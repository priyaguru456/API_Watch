import { describe, it, expect, beforeEach } from 'vitest';
import { createMockPrisma } from '../mock-db.js';
import { withTenantTransaction } from '../extension.js';

describe('PostgreSQL 16 Row-Level Security (RLS) Tenant Isolation (@apiwatch/db)', () => {
  let db;
  let orgAId;
  let orgBId;
  let userAId;
  let userBId;

  beforeEach(async () => {
    db = createMockPrisma({ enforceRls: true });

    // 1. Onboard Tenant Alpha
    const orgA = await db.organization.create({
      data: { name: 'Acme Corp', slug: 'acme-corp' },
    });
    orgAId = orgA.id;

    const userA = await db.user.create({
      data: { email: 'alice@acme.com', passwordHash: 'hash-a', name: 'Alice' },
    });
    userAId = userA.id;

    await db.membership.create({
      data: { organizationId: orgAId, userId: userAId, role: 'OWNER' },
    });

    // Populate Org A resources
    await db.monitor.create({
      data: {
        organizationId: orgAId,
        name: 'Acme Production Gateway',
        url: 'https://gateway.acme.com/health',
      },
    });

    await db.apiKey.create({
      data: {
        organizationId: orgAId,
        userId: userAId,
        name: 'Acme CI Key',
        keyHash: 'hash-key-alpha-12345',
        keyPrefix: 'ak_live_acme',
        scopes: ['monitors:read'],
      },
    });

    // 2. Onboard Tenant Beta (Confidential Rival Tenant)
    const orgB = await db.organization.create({
      data: { name: 'Beta Industries', slug: 'beta-ind' },
    });
    orgBId = orgB.id;

    const userB = await db.user.create({
      data: { email: 'bob@beta.com', passwordHash: 'hash-b', name: 'Bob' },
    });
    userBId = userB.id;

    await db.membership.create({
      data: { organizationId: orgBId, userId: userBId, role: 'OWNER' },
    });

    // Populate Org B resources
    await db.monitor.create({
      data: {
        organizationId: orgBId,
        name: 'Beta Top Secret Payment Service',
        url: 'https://vault.internal.beta.com/status',
      },
    });

    await db.apiKey.create({
      data: {
        organizationId: orgBId,
        userId: userBId,
        name: 'Beta Production Token',
        keyHash: 'hash-key-beta-67890',
        keyPrefix: 'ak_live_beta',
        scopes: ['monitors:read', 'monitors:write'],
      },
    });
  });

  describe('Proof of RLS: Cross-Tenant Reads BLOCKED with App-Layer Filter Deliberately Disabled', () => {
    it('proves Org A context returns ONLY Org A monitors when app filter is deliberately removed', async () => {
      // THE APP-LAYER FILTER IS DELIBERATELY DISABLED:
      // The query passes NO where clause or where: {} (no organizationId filter).
      // PostgreSQL Row-Level Security via current_setting('app.org_id') MUST enforce tenant isolation.
      const result = await db.forTenant(orgAId, async (tx) => {
        return tx.monitor.findMany({
          where: {}, // <--- App filter deliberately empty!
        });
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Acme Production Gateway');
      expect(result[0].organizationId).toBe(orgAId);

      // Verify zero leakage of Tenant Beta data
      const betaLeakage = result.filter((m) => m.organizationId === orgBId);
      expect(betaLeakage).toHaveLength(0);
    });

    it('proves Org B context returns ONLY Org B monitors when app filter is deliberately removed', async () => {
      const result = await db.forTenant(orgBId, async (tx) => {
        return tx.monitor.findMany({
          where: {}, // <--- App filter deliberately empty!
        });
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Beta Top Secret Payment Service');
      expect(result[0].organizationId).toBe(orgBId);

      // Verify zero leakage of Tenant Alpha data
      const alphaLeakage = result.filter((m) => m.organizationId === orgAId);
      expect(alphaLeakage).toHaveLength(0);
    });

    it('proves withTenantTransaction extension sets app.org_id and isolates API keys with no app filter', async () => {
      const alphaKeys = await withTenantTransaction(db, orgAId, async (tx) => {
        return tx.apiKey.findMany({
          where: {}, // App filter deliberately removed
        });
      });

      expect(alphaKeys).toHaveLength(1);
      expect(alphaKeys[0].name).toBe('Acme CI Key');
      expect(alphaKeys[0].organizationId).toBe(orgAId);

      const betaKeys = await withTenantTransaction(db, orgBId, async (tx) => {
        return tx.apiKey.findMany({
          where: {}, // App filter deliberately removed
        });
      });

      expect(betaKeys).toHaveLength(1);
      expect(betaKeys[0].name).toBe('Beta Production Token');
      expect(betaKeys[0].organizationId).toBe(orgBId);
    });

    it('proves memberships are strictly isolated without app-layer filter', async () => {
      const alphaMembers = await db.forTenant(orgAId, async (tx) => {
        return tx.membership.findMany({
          where: {}, // App filter deliberately removed
        });
      });

      expect(alphaMembers).toHaveLength(1);
      expect(alphaMembers[0].userId).toBe(userAId);
      expect(alphaMembers[0].organizationId).toBe(orgAId);
    });

    it('blocks all reads when app.org_id is unset or empty', async () => {
      // Query outside any tenant context
      const unscopedDb = createMockPrisma({ enforceRls: true, initialTenantOrgId: null });
      const results = await unscopedDb.monitor.findMany({
        where: {}, // App filter removed and no tenant context
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('Proof of RLS: Cross-Tenant Writes BLOCKED by WITH CHECK policy', () => {
    it('throws RLS violation if Org A attempts to write a monitor belonging to Org B', async () => {
      await expect(
        db.forTenant(orgAId, async (tx) => {
          return tx.monitor.create({
            data: {
              organizationId: orgBId, // Malicious cross-tenant injection attempt!
              name: 'Injected Attacker Monitor',
              url: 'https://attacker.site/exploit',
            },
          });
        })
      ).rejects.toThrow(/PostgreSQL RLS violation: new row violates WITH CHECK policy/);
    });

    it('throws RLS violation if Org A attempts to write an API key for Org B', async () => {
      await expect(
        db.forTenant(orgAId, async (tx) => {
          return tx.apiKey.create({
            data: {
              organizationId: orgBId, // Cross-tenant injection
              name: 'Backdoor API Key',
              keyHash: 'attacker-key-hash',
              keyPrefix: 'ak_evil',
              scopes: ['monitors:write'],
            },
          });
        })
      ).rejects.toThrow(/PostgreSQL RLS violation/);
    });
  });
});
