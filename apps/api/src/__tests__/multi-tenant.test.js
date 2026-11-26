import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockPrisma } from './mock-db.js';

describe('Multi-Tenant Data Scoping, RBAC & API Keys (apps/api)', () => {
  let db;
  let app;

  let userAToken;
  let orgAId;

  let userBToken;
  let orgBId;

  beforeEach(async () => {
    db = createMockPrisma();
    app = createApp({ db });

    // 1. Register User A in Organization A
    const resA = await request(app).post('/api/v1/auth/register').send({
      email: 'userA@orgA.com',
      password: 'Password123!',
      name: 'User A',
      organizationName: 'Tenant Alpha',
    });
    userAToken = resA.body.accessToken;
    orgAId = resA.body.organization.id;

    // 2. Register User B in Organization B
    const resB = await request(app).post('/api/v1/auth/register').send({
      email: 'userB@orgB.com',
      password: 'Password123!',
      name: 'User B',
      organizationName: 'Tenant Beta',
    });
    userBToken = resB.body.accessToken;
    orgBId = resB.body.organization.id;

    // 3. User B creates a confidential monitor in Org B
    const createMonRes = await request(app)
      .post(`/api/v1/orgs/${orgBId}/monitors`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({
        name: 'Confidential Internal Microservice Beta',
        url: 'https://internal.beta.corp/health',
        intervalSeconds: 30,
      });
    expect(createMonRes.status).toBe(201);
  });

  describe("Proof of Multi-Tenant Scoping: User A CANNOT access Org B's data", () => {
    it("proves User A cannot read Org B's monitors (receives 403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('You are not a member of this organization');
    });

    it("proves User A cannot read Org B's members list (receives 403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgBId}/members`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('You are not a member of this organization');
    });

    it('proves User A cannot create a monitor inside Org B (receives 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Malicious Injected Monitor',
          url: 'https://attacker.site/probe',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('You are not a member of this organization');
    });

    it('proves User A cannot invite members to Org B (receives 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/orgs/${orgBId}/invites`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          email: 'intruder@example.com',
          role: 'ADMIN',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('You are not a member of this organization');
    });

    it('proves spoofing X-Organization-Id header does not bypass tenant isolation', async () => {
      const res = await request(app)
        .get('/api/v1/orgs/members')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Organization-Id', orgBId);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('You are not a member of this organization');
    });

    it("confirms User A can cleanly access Org A's own resources without data bleeding", async () => {
      const res = await request(app)
        .get(`/api/v1/orgs/${orgAId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.monitors).toEqual([]);
    });
  });

  describe('Invite-Member Flow and Role Matrix Enforcement', () => {
    it('executes full invite, acceptance, and role enforcement lifecycle', async () => {
      // 1. User B invites User A to Org B with ENGINEER role
      const inviteRes = await request(app)
        .post(`/api/v1/orgs/${orgBId}/invites`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          email: 'usera@orga.com',
          role: 'ENGINEER',
        });

      expect(inviteRes.status).toBe(201);
      const inviteToken = inviteRes.body.invitation.token;
      expect(inviteToken).toBeDefined();

      // 2. User A accepts invitation
      const acceptRes = await request(app)
        .post(`/api/v1/invites/${inviteToken}/accept`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.organizationId).toBe(orgBId);
      expect(acceptRes.body.role).toBe('ENGINEER');

      // 3. User A now legitimately has access to Org B
      const readMonitorsRes = await request(app)
        .get(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(readMonitorsRes.status).toBe(200);
      expect(readMonitorsRes.body.monitors.length).toBe(1);

      // 4. Role Guard: ENGINEER CAN create monitors
      const createByEngineerRes = await request(app)
        .post(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Engineer Created Target',
          url: 'https://staging.beta.corp/health',
        });
      expect(createByEngineerRes.status).toBe(201);

      // 5. Role Guard: ENGINEER CANNOT invite members (requires OWNER or ADMIN)
      const unauthorizedInviteRes = await request(app)
        .post(`/api/v1/orgs/${orgBId}/invites`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          email: 'another@example.com',
          role: 'VIEWER',
        });

      expect(unauthorizedInviteRes.status).toBe(403);
    });
  });

  describe('Custom Roles Table & requirePermission() Enforcement', () => {
    it('creates custom role, assigns to user, and validates granular permission guards', async () => {
      // 1. Owner creates custom role "MonitorOperator" with permissions ["monitors:read", "monitors:create"]
      const createRoleRes = await request(app)
        .post(`/api/v1/orgs/${orgAId}/roles`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'MonitorOperator',
          description: 'Can read and create monitors only',
          permissions: ['monitors:read', 'monitors:create'],
        });

      expect(createRoleRes.status).toBe(201);
      expect(createRoleRes.body.role.name).toBe('MonitorOperator');
      const customRoleId = createRoleRes.body.role.id;

      // 2. Register Operator user
      const opRegRes = await request(app).post('/api/v1/auth/register').send({
        email: 'operator@acme.com',
        password: 'Password123!',
      });
      const operatorToken = opRegRes.body.accessToken;

      // 3. Invite Operator with VIEWER base role and customRoleId
      const inviteRes = await request(app)
        .post(`/api/v1/orgs/${orgAId}/invites`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          email: 'operator@acme.com',
          role: 'VIEWER',
          customRoleId,
        });

      expect(inviteRes.status).toBe(201);
      const inviteToken = inviteRes.body.invitation.token;

      // 4. Operator accepts invitation
      await request(app)
        .post(`/api/v1/invites/${inviteToken}/accept`)
        .set('Authorization', `Bearer ${operatorToken}`);

      // 5. Operator can create monitors because custom role grants "monitors:create"
      const createMonRes = await request(app)
        .post(`/api/v1/orgs/${orgAId}/monitors`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Operator Monitor',
          url: 'https://operator.acme.com/ping',
        });

      expect(createMonRes.status).toBe(201);

      // 6. Operator CANNOT invite members because custom role does NOT grant "members:invite"
      const forbidInviteRes = await request(app)
        .post(`/api/v1/orgs/${orgAId}/invites`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          email: 'someone@acme.com',
          role: 'VIEWER',
        });

      expect(forbidInviteRes.status).toBe(403);
    });
  });

  describe('Hashed API Keys with Scopes & Last-Used Tracking', () => {
    it('creates API key, authenticates API request, enforces scopes, and handles revocation', async () => {
      // 1. Create API key with scope ["monitors:read", "monitors:create"]
      const createKeyRes = await request(app)
        .post(`/api/v1/orgs/${orgAId}/api-keys`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'CI/CD Automation Pipeline Key',
          scopes: ['monitors:read', 'monitors:create'],
          expiresInDays: 30,
        });

      expect(createKeyRes.status).toBe(201);
      expect(createKeyRes.body.apiKey).toBeDefined();
      expect(createKeyRes.body.apiKey.keyPrefix).toBeDefined();
      expect(createKeyRes.body.secretKey).toBeDefined();
      expect(createKeyRes.body.secretKey.startsWith('ak_live_')).toBe(true);

      const secretKey = createKeyRes.body.secretKey;
      const apiKeyId = createKeyRes.body.apiKey.id;

      // 2. Authenticate request using API Key via Authorization: Bearer ak_live_...
      const readMonitorsRes = await request(app)
        .get('/api/v1/orgs/monitors')
        .set('Authorization', `Bearer ${secretKey}`);

      expect(readMonitorsRes.status).toBe(200);
      expect(readMonitorsRes.body.success).toBe(true);

      // 3. Create a monitor using the API Key
      const createMonRes = await request(app)
        .post('/api/v1/orgs/monitors')
        .set('Authorization', `Bearer ${secretKey}`)
        .send({
          name: 'Monitor Created via API Key',
          url: 'https://api.acme.com/metrics',
        });

      expect(createMonRes.status).toBe(201);

      // 4. Verify scope enforcement: API key lacks "members:invite" scope -> 403 Forbidden
      const unauthorizedInvite = await request(app)
        .post('/api/v1/orgs/invites')
        .set('Authorization', `Bearer ${secretKey}`)
        .send({
          email: 'unauthorized@acme.com',
          role: 'VIEWER',
        });

      expect(unauthorizedInvite.status).toBe(403);

      // 5. Revoke the API key
      const revokeRes = await request(app)
        .delete(`/api/v1/orgs/${orgAId}/api-keys/${apiKeyId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(revokeRes.status).toBe(200);

      // 6. Subsequent requests with revoked key fail with 401 Unauthorized
      const failedAfterRevoke = await request(app)
        .get('/api/v1/orgs/monitors')
        .set('Authorization', `Bearer ${secretKey}`);

      expect(failedAfterRevoke.status).toBe(401);
      expect(failedAfterRevoke.body.error).toContain('revoked');
    });
  });
});
