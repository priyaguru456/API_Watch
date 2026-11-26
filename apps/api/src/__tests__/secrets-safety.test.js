import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createApp } from '../app.js';
import { createMockPrisma } from './mock-db.js';
import { generateAccessToken } from '../utils/tokens.js';
import { createLogger } from '../config/logger.js';
import { createVaultService, MemoryKeyStore, EnvMasterKeyProvider } from '@apiwatch/vault';
import { createAuditService } from '../services/audit.service.js';

describe('Zero Secret Leakage Verification (API Responses & Logs)', () => {
  let db;
  let app;
  let vault;
  let auditService;
  let user;
  let org;
  let token;
  let logBuffer;
  let testLogger;

  const RAW_SECRET_TOKEN = 'secret-api-token-omega-998877665544';
  const RAW_PASSWORD = 'TopSecretPassword9988!!';
  const RAW_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    db = createMockPrisma();

    // Stream buffer to intercept all Pino log lines
    logBuffer = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logBuffer.push(chunk.toString());
        callback();
      },
    });

    testLogger = createLogger({ level: 'info' }, logStream);

    const masterKeyProvider = new EnvMasterKeyProvider({
      keys: { v1: RAW_MASTER_KEY },
      activeKeyId: 'v1',
    });
    const keyStore = new MemoryKeyStore();
    vault = createVaultService({ masterKeyProvider, keyStore, db });
    auditService = createAuditService({ db });

    app = createApp({
      db,
      vault,
      auditService,
      logger: testLogger,
    });

    // Seed test org & owner user
    user = await db.user.create({
      data: { email: 'owner@vault-safe.io', passwordHash: 'hashed-pwd', name: 'Security Officer' },
    });
    org = await db.organization.create({
      data: { name: 'Vault Safe Org', slug: 'vault-safe' },
    });
    await db.membership.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    token = generateAccessToken(user);
  });

  describe('Proof: Secrets Never Appear in API Responses', () => {
    it('creates monitor with sensitive auth; API response never contains raw credentials or ciphertext', async () => {
      const createRes = await request(app)
        .post(`/api/v1/orgs/${org.id}/monitors`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Secure Payment Gateway API',
          url: 'https://api.payments.com/health',
          method: 'GET',
          intervalSeconds: 60,
          timeoutSeconds: 30,
          auth: {
            token: RAW_SECRET_TOKEN,
            password: RAW_PASSWORD,
          },
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);

      const responseString = JSON.stringify(createRes.body);

      // Raw secrets must NEVER be in response
      expect(responseString).not.toContain(RAW_SECRET_TOKEN);
      expect(responseString).not.toContain(RAW_PASSWORD);
      expect(responseString).not.toContain(RAW_MASTER_KEY);
      expect(responseString).not.toContain('vault:v'); // raw ciphertext stripped

      // Instead, metadata indicates presence of authentication
      expect(createRes.body.monitor.hasAuth).toBe(true);
      expect(createRes.body.monitor.encryptedAuth).toBeUndefined();
    });

    it('lists monitors: encryptedAuth is completely omitted from response', async () => {
      // Seed a monitor with encryptedAuth at rest in DB
      const encryptedPayload = await vault.encrypt(org.id, {
        bearerToken: RAW_SECRET_TOKEN,
      });

      await db.monitor.create({
        data: {
          organizationId: org.id,
          name: 'Core Internal API',
          url: 'https://internal.alpha.com',
          encryptedAuth: encryptedPayload,
        },
      });

      const listRes = await request(app)
        .get(`/api/v1/orgs/${org.id}/monitors`)
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      const listString = JSON.stringify(listRes.body);

      expect(listString).not.toContain(RAW_SECRET_TOKEN);
      expect(listString).not.toContain('vault:v');
      expect(listRes.body.monitors[0].hasAuth).toBe(true);
      expect(listRes.body.monitors[0].encryptedAuth).toBeUndefined();
    });

    it('rotates vault keys: response contains version metadata, never raw DEK or Master Key', async () => {
      const rotateRes = await request(app)
        .post(`/api/v1/orgs/${org.id}/keys/rotate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reencrypt: true });

      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.success).toBe(true);
      expect(rotateRes.body.newVersion).toBeGreaterThan(0);

      const rotateString = JSON.stringify(rotateRes.body);
      expect(rotateString).not.toContain(RAW_MASTER_KEY);
      expect(rotateString).not.toContain('Buffer');
      expect(rotateString).not.toContain('encryptedKey');
    });

    it('audit logs query: before/after/details are redacted in API responses', async () => {
      await auditService.record({
        organizationId: org.id,
        actor: user,
        action: 'credentials.updated',
        target: { type: 'api_credentials', id: 'cred-1' },
        before: { secretKey: RAW_SECRET_TOKEN },
        after: { secretKey: 'new-secret-xyz' },
        details: { token: 'another-secret-token' },
      });

      const auditRes = await request(app)
        .get(`/api/v1/orgs/${org.id}/audit-logs`)
        .set('Authorization', `Bearer ${token}`);

      expect(auditRes.status).toBe(200);
      const auditString = JSON.stringify(auditRes.body);

      expect(auditString).not.toContain(RAW_SECRET_TOKEN);
      expect(auditString).not.toContain('new-secret-xyz');
      expect(auditString).not.toContain('another-secret-token');
      expect(auditString).toContain('[REDACTED]');
    });
  });

  describe('Proof: Secrets Never Appear in Pino Logs', () => {
    it('redacts Authorization headers, cookies, api keys, and passwords from logged requests', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .set('Authorization', `Bearer ${RAW_SECRET_TOKEN}`)
        .set('Cookie', `token=${RAW_SECRET_TOKEN}`)
        .set('X-Api-Key', RAW_SECRET_TOKEN)
        .send({
          email: 'user@example.com',
          password: RAW_PASSWORD,
        });

      const combinedLogs = logBuffer.join('\n');

      expect(combinedLogs).not.toContain(RAW_SECRET_TOKEN);
      expect(combinedLogs).not.toContain(RAW_PASSWORD);
      expect(combinedLogs).not.toContain(RAW_MASTER_KEY);
      expect(combinedLogs).toContain('[REDACTED]');
    });

    it('redacts arbitrary logged objects containing DEKs, tokens, and encryptedAuth', () => {
      testLogger.info({
        event: 'DATABASE_BACKUP',
        dek: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        masterKey: RAW_MASTER_KEY,
        nested: {
          secret: RAW_SECRET_TOKEN,
          password: RAW_PASSWORD,
          encryptedAuth: 'vault:v1:010203:040506:070809',
        },
      });

      const combinedLogs = logBuffer.join('\n');

      expect(combinedLogs).not.toContain(RAW_SECRET_TOKEN);
      expect(combinedLogs).not.toContain(RAW_PASSWORD);
      expect(combinedLogs).not.toContain(RAW_MASTER_KEY);
      expect(combinedLogs).not.toContain('vault:v1:010203:040506:070809');
      expect(combinedLogs).toContain('[REDACTED]');
    });
  });
});
