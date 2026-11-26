import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockPrisma } from './mock-db.js';
import { generateAccessToken } from '../utils/tokens.js';
import { AuditService } from '../services/audit.service.js';

describe('Audit Service & Endpoints (apps/api)', () => {
  let db;
  let app;
  let auditService;

  let userA, userB;
  let orgA, orgB;
  let tokenA, tokenB;

  beforeEach(async () => {
    db = createMockPrisma();
    auditService = new AuditService({ db });
    app = createApp({ db, auditService });

    // Seed User A & Org A
    userA = await db.user.create({
      data: { email: 'alice@alpha.io', passwordHash: 'hash-a', name: 'Alice Alpha' },
    });
    orgA = await db.organization.create({
      data: { name: 'Alpha Org', slug: 'alpha-org' },
    });
    await db.membership.create({
      data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' },
    });
    tokenA = generateAccessToken(userA);

    // Seed User B & Org B
    userB = await db.user.create({
      data: { email: 'bob@beta.io', passwordHash: 'hash-b', name: 'Bob Beta' },
    });
    orgB = await db.organization.create({
      data: { name: 'Beta Org', slug: 'beta-org' },
    });
    await db.membership.create({
      data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' },
    });
    tokenB = generateAccessToken(userB);
  });

  describe('AuditService.record() - Security & Automatic Redaction', () => {
    it('records an audit event with actor, action, target, IP, and userAgent', async () => {
      const record = await auditService.record({
        organizationId: orgA.id,
        actor: userA,
        action: 'monitor.create',
        target: { type: 'monitor', id: 'mon-101' },
        ipAddress: '198.51.100.42',
        userAgent: 'Mozilla/5.0 APIWatch/1.0',
        before: null,
        after: { name: 'Production Health', url: 'https://api.alpha.io/health' },
        details: { intervalSeconds: 60 },
      });

      expect(record.id).toBeDefined();
      expect(record.organizationId).toBe(orgA.id);
      expect(record.userId).toBe(userA.id);
      expect(record.action).toBe('monitor.create');
      expect(record.entityType).toBe('monitor');
      expect(record.entityId).toBe('mon-101');
      expect(record.ipAddress).toBe('198.51.100.42');
      expect(record.userAgent).toBe('Mozilla/5.0 APIWatch/1.0');
      expect(record.after.name).toBe('Production Health');
    });

    it('strictly redacts sensitive secrets in before, after, and details objects', async () => {
      const record = await auditService.record({
        organizationId: orgA.id,
        actor: userA,
        action: 'user.update_password',
        target: { type: 'user', id: userA.id },
        before: {
          password: 'old-plaintext-password-here',
          apiKey: 'sec_live_99887766',
        },
        after: {
          password: 'new-plaintext-password-here',
          token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token.123',
          encryptedAuth: 'vault:v1:0123:4567:89ab',
        },
        details: {
          authHeader: 'Bearer secret-key-xyz',
          client_secret: 'shhh-secret',
        },
      });

      expect(record.before.password).toBe('[REDACTED]');
      expect(record.before.apiKey).toBe('[REDACTED]');
      expect(record.after.password).toBe('[REDACTED]');
      expect(record.after.token).toBe('[REDACTED]');
      expect(record.after.encryptedAuth).toBe('[REDACTED]');
      expect(record.details.client_secret).toBe('[REDACTED]');
    });
  });

  describe('GET /api/v1/orgs/:organizationId/audit-logs - Query & Multi-Tenant Scoping', () => {
    beforeEach(async () => {
      // Seed audit entries for Org A
      await auditService.record({
        organizationId: orgA.id,
        actor: userA,
        action: 'monitor.create',
        target: { type: 'monitor', id: 'm-1' },
        details: { name: 'Monitor 1' },
      });
      await auditService.record({
        organizationId: orgA.id,
        actor: userA,
        action: 'monitor.update',
        target: { type: 'monitor', id: 'm-1' },
        details: { name: 'Monitor 1 Updated' },
      });
      await auditService.record({
        organizationId: orgA.id,
        actor: userA,
        action: 'member.invite',
        target: { type: 'invitation', id: 'inv-1' },
        details: { email: 'charlie@alpha.io' },
      });

      // Seed audit entry for Org B
      await auditService.record({
        organizationId: orgB.id,
        actor: userB,
        action: 'monitor.create',
        target: { type: 'monitor', id: 'm-beta' },
        details: { name: 'Beta Monitor' },
      });
    });

    it('returns paginated audit logs for the authenticated organization', async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs?page=1&limit=2`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logs).toHaveLength(2);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it('enforces multi-tenant isolation: User B cannot access Org A audit logs', async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs`)
        .set('Authorization', `Bearer ${tokenB}`); // User B token for Org A

      expect(res.status).toBe(403);
    });

    it('filters audit logs by action', async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs?action=member.invite`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].action).toBe('member.invite');
    });

    it('filters audit logs by target entityType', async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs?entityType=monitor`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(2);
      expect(res.body.logs.every((l) => l.target.type === 'monitor')).toBe(true);
    });
  });

  describe('GET /api/v1/orgs/:organizationId/audit-logs/export - Export Functionality', () => {
    beforeEach(async () => {
      await auditService.record({
        organizationId: orgA.id,
        actor: userA,
        action: 'key.rotate',
        target: { type: 'vault_key', id: orgA.id },
        ipAddress: '10.0.0.1',
        userAgent: 'Supertest/1.0',
        before: { version: 1, secret: 'old-sec' },
        after: { version: 2, secret: 'new-sec' },
      });
    });

    it('exports audit logs as JSON', async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs/export?format=json`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].action).toBe('key.rotate');
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('exports audit logs as CSV with proper headers and escaped rows', async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs/export?format=csv`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('.csv');

      const csvLines = res.text.trim().split('\r\n');
      expect(csvLines[0]).toBe(
        'id,createdAt,actorId,actorEmail,action,targetType,targetId,ipAddress,userAgent,details'
      );
      expect(csvLines[1]).toContain('key.rotate');
      expect(csvLines[1]).toContain('vault_key');
    });

    it('blocks export for non-admin/viewer roles', async () => {
      const viewer = await db.user.create({
        data: { email: 'viewer@alpha.io', passwordHash: 'hash-v' },
      });
      await db.membership.create({
        data: { organizationId: orgA.id, userId: viewer.id, role: 'VIEWER' },
      });
      const viewerToken = generateAccessToken(viewer);

      const res = await request(app)
        .get(`/api/v1/orgs/${orgA.id}/audit-logs/export`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
