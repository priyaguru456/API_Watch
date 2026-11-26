import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockPrisma } from './mock-db.js';

describe('Multi-Tenant Data Scoping & RBAC Isolation (apps/api)', () => {
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
      // User A attempts to list Org B's monitors
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
        .get('/api/v1/orgs/members') // header-based scoping
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
      // Org A has no monitors yet, completely isolated from Org B
      expect(res.body.monitors).toEqual([]);
    });
  });

  describe('Invite-Member Flow and requireRole() RBAC Enforcement', () => {
    it('executes full invite, acceptance, and role enforcement lifecycle', async () => {
      // 1. User B (OWNER of Org B) invites User A to Org B with role ENGINEER
      const inviteRes = await request(app)
        .post(`/api/v1/orgs/${orgBId}/invites`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          email: 'usera@orga.com',
          role: 'ENGINEER',
        });

      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.success).toBe(true);
      const inviteToken = inviteRes.body.invitation.token;
      expect(inviteToken).toBeDefined();

      // 2. User A accepts the invitation
      const acceptRes = await request(app)
        .post(`/api/v1/invites/${inviteToken}/accept`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);
      expect(acceptRes.body.organizationId).toBe(orgBId);
      expect(acceptRes.body.role).toBe('ENGINEER');

      // 3. User A now legitimately has access to Org B's monitors!
      const readMonitorsRes = await request(app)
        .get(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(readMonitorsRes.status).toBe(200);
      expect(readMonitorsRes.body.monitors.length).toBe(1);
      expect(readMonitorsRes.body.monitors[0].name).toBe('Confidential Internal Microservice Beta');

      // 4. Role Guard Check: User A (ENGINEER) CAN create monitors
      const createByEngineerRes = await request(app)
        .post(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Engineer Created Target',
          url: 'https://staging.beta.corp/health',
        });
      expect(createByEngineerRes.status).toBe(201);

      // 5. Role Guard Check: User A (ENGINEER) CANNOT invite members (requires OWNER or ADMIN)
      const unauthorizedInviteRes = await request(app)
        .post(`/api/v1/orgs/${orgBId}/invites`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          email: 'another@example.com',
          role: 'VIEWER',
        });

      expect(unauthorizedInviteRes.status).toBe(403);
      expect(unauthorizedInviteRes.body.error).toContain('Insufficient permissions');

      // 6. Non-member (User C) remains strictly forbidden
      const resC = await request(app).post('/api/v1/auth/register').send({
        email: 'userC@external.com',
        password: 'Password123!',
      });
      const userCToken = resC.body.accessToken;

      const forbiddenResC = await request(app)
        .get(`/api/v1/orgs/${orgBId}/monitors`)
        .set('Authorization', `Bearer ${userCToken}`);

      expect(forbiddenResC.status).toBe(403);
    });
  });
});
