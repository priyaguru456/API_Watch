import crypto from 'node:crypto';

/**
 * Creates an in-memory database mock conforming to the PrismaClient interface
 * for User, Organization, Membership, CustomRole, RefreshToken, Invitation, ApiKey,
 * Monitor, and AuditLog models with full PostgreSQL Row-Level Security (RLS) simulation.
 */
export function createMockPrisma({ enforceRls = true, initialTenantOrgId = null } = {}) {
  const users = new Map();
  const organizations = new Map();
  const memberships = new Map(); // key: `${orgId}:${userId}`
  const customRoles = new Map(); // key: id
  const refreshTokens = new Map(); // key: tokenHash
  const invitations = new Map(); // key: token
  const apiKeys = new Map(); // key: id or keyHash
  const monitors = new Map(); // key: id
  const auditLogs = new Map(); // key: id
  const organizationKeys = new Map(); // key: `${orgId}:${version}`

  let currentTenantOrgId = initialTenantOrgId;

  function getRlsOrgId() {
    return currentTenantOrgId;
  }

  function checkRlsWrite(orgId) {
    if (!enforceRls) return;
    const activeOrgId = getRlsOrgId();
    if (activeOrgId && orgId && activeOrgId !== orgId) {
      throw new Error(
        `PostgreSQL RLS violation: new row violates WITH CHECK policy for organizationId: ${orgId} (active tenant: ${activeOrgId})`
      );
    }
  }

  const mockDb = {
    _users: users,
    _organizations: organizations,
    _memberships: memberships,
    _customRoles: customRoles,
    _refreshTokens: refreshTokens,
    _invitations: invitations,
    _apiKeys: apiKeys,
    _monitors: monitors,
    _auditLogs: auditLogs,
    enforceRls,

    setTenantOrgId(orgId) {
      currentTenantOrgId = orgId;
    },

    getTenantOrgId() {
      return currentTenantOrgId;
    },

    user: {
      async findUnique({ where }) {
        if (where.id) return users.get(where.id) || null;
        if (where.email) {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) return u;
          }
        }
        if (where.emailVerifyToken) {
          for (const u of users.values()) {
            if (u.emailVerifyToken === where.emailVerifyToken) return u;
          }
        }
        if (where.passwordResetToken) {
          for (const u of users.values()) {
            if (u.passwordResetToken === where.passwordResetToken) return u;
          }
        }
        return null;
      },
      async create({ data }) {
        const id = data.id || crypto.randomUUID();
        const user = {
          id,
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name || null,
          emailVerified: Boolean(data.emailVerified),
          emailVerifyToken: data.emailVerifyToken || null,
          emailVerifyExpiresAt: data.emailVerifyExpiresAt || null,
          passwordResetToken: data.passwordResetToken || null,
          passwordResetExpiresAt: data.passwordResetExpiresAt || null,
          totpSecret: data.totpSecret || null,
          totpEnabled: Boolean(data.totpEnabled),
          createdAt: new Date(),
          updatedAt: new Date(),
          memberships: [],
        };
        users.set(id, user);
        return user;
      },
      async update({ where, data }) {
        let user = null;
        if (where.id) user = users.get(where.id);
        else if (where.email) {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) {
              user = u;
              break;
            }
          }
        }
        if (!user) throw new Error('User not found for update');
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
    },

    organization: {
      async findUnique({ where }) {
        if (where.id) return organizations.get(where.id) || null;
        if (where.slug) {
          for (const o of organizations.values()) {
            if (o.slug === where.slug) return o;
          }
        }
        return null;
      },
      async create({ data }) {
        const id = data.id || crypto.randomUUID();
        const org = {
          id,
          name: data.name,
          slug: data.slug,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        organizations.set(id, org);
        return org;
      },
    },

    customRole: {
      async findUnique({ where }) {
        if (where.id) return customRoles.get(where.id) || null;
        if (where.organizationId_name) {
          const { organizationId, name } = where.organizationId_name;
          for (const r of customRoles.values()) {
            if (r.organizationId === organizationId && r.name === name) return r;
          }
        }
        return null;
      },
      async findMany({ where = {} }) {
        const results = [];
        const rlsOrg = getRlsOrgId();
        for (const r of customRoles.values()) {
          if (enforceRls && rlsOrg && r.organizationId !== rlsOrg) continue;
          if (where.organizationId && r.organizationId !== where.organizationId) continue;
          results.push(r);
        }
        return results;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const role = {
          id,
          organizationId: data.organizationId,
          name: data.name,
          description: data.description || null,
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        customRoles.set(id, role);
        return role;
      },
    },

    membership: {
      async findUnique({ where }) {
        if (where.organizationId_userId) {
          const { organizationId, userId } = where.organizationId_userId;
          const rlsOrg = getRlsOrgId();
          if (enforceRls && rlsOrg && organizationId !== rlsOrg) return null;
          const key = `${organizationId}:${userId}`;
          const mem = memberships.get(key);
          if (!mem) return null;
          return {
            ...mem,
            organization: organizations.get(mem.organizationId),
            user: users.get(mem.userId),
            customRole: mem.customRoleId ? customRoles.get(mem.customRoleId) : null,
          };
        }
        return null;
      },
      async findFirst({ where }) {
        const rlsOrg = getRlsOrgId();
        for (const m of memberships.values()) {
          if (enforceRls && rlsOrg && m.organizationId !== rlsOrg) continue;
          const matchOrg = !where.organizationId || m.organizationId === where.organizationId;
          const matchUser = !where.userId || m.userId === where.userId;
          let matchEmail = true;
          if (where.user?.email) {
            const u = users.get(m.userId);
            matchEmail = u && u.email.toLowerCase() === where.user.email.toLowerCase();
          }
          if (matchOrg && matchUser && matchEmail) {
            return {
              ...m,
              organization: organizations.get(m.organizationId),
              user: users.get(m.userId),
              customRole: m.customRoleId ? customRoles.get(m.customRoleId) : null,
            };
          }
        }
        return null;
      },
      async findMany({ where = {} }) {
        const results = [];
        const rlsOrg = getRlsOrgId();
        for (const m of memberships.values()) {
          // If RLS is enabled, enforce tenant policy even when caller omitted where.organizationId
          if (enforceRls && rlsOrg && m.organizationId !== rlsOrg) continue;
          if (enforceRls && !rlsOrg && !where.organizationId) continue;
          if (where.organizationId && m.organizationId !== where.organizationId) continue;

          results.push({
            ...m,
            organization: organizations.get(m.organizationId),
            user: users.get(m.userId),
            customRole: m.customRoleId ? customRoles.get(m.customRoleId) : null,
          });
        }
        return results;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const mem = {
          id,
          organizationId: data.organizationId,
          userId: data.userId,
          role: data.role || 'VIEWER',
          customRoleId: data.customRoleId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        memberships.set(`${data.organizationId}:${data.userId}`, mem);

        const u = users.get(data.userId);
        if (u) {
          u.memberships = u.memberships || [];
          u.memberships.push({
            ...mem,
            organization: organizations.get(data.organizationId),
          });
        }
        return mem;
      },
      async upsert({ where, create, update }) {
        const { organizationId, userId } = where.organizationId_userId;
        checkRlsWrite(organizationId);
        const key = `${organizationId}:${userId}`;
        const existing = memberships.get(key);
        if (existing) {
          existing.role = update.role;
          if (update.customRoleId !== undefined) existing.customRoleId = update.customRoleId;
          existing.updatedAt = new Date();
          return existing;
        }
        return mockDb.membership.create({ data: create });
      },
    },

    refreshToken: {
      async findUnique({ where }) {
        if (where.tokenHash) {
          const record = refreshTokens.get(where.tokenHash);
          if (!record) return null;
          return {
            ...record,
            user: users.get(record.userId),
          };
        }
        return null;
      },
      async create({ data }) {
        const id = data.id || crypto.randomUUID();
        const record = {
          id,
          userId: data.userId,
          tokenHash: data.tokenHash,
          family: data.family,
          isRevoked: Boolean(data.isRevoked),
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        refreshTokens.set(data.tokenHash, record);
        return record;
      },
      async update({ where, data }) {
        let record = null;
        if (where.tokenHash) record = refreshTokens.get(where.tokenHash);
        else if (where.id) {
          for (const r of refreshTokens.values()) {
            if (r.id === where.id) {
              record = r;
              break;
            }
          }
        }
        if (record) {
          Object.assign(record, data, { updatedAt: new Date() });
          return record;
        }
        throw new Error('RefreshToken not found for update');
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const r of refreshTokens.values()) {
          if (where.family && r.family === where.family) {
            Object.assign(r, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
    },

    invitation: {
      async findUnique({ where }) {
        if (where.token) return invitations.get(where.token) || null;
        return null;
      },
      async findMany({ where = {} }) {
        const results = [];
        const rlsOrg = getRlsOrgId();
        for (const inv of invitations.values()) {
          if (enforceRls && rlsOrg && inv.organizationId !== rlsOrg) continue;
          if (enforceRls && !rlsOrg && !where.organizationId) continue;
          if (where.organizationId && inv.organizationId !== where.organizationId) continue;
          results.push(inv);
        }
        return results;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const inv = {
          id,
          organizationId: data.organizationId,
          email: data.email,
          role: data.role || 'VIEWER',
          customRoleId: data.customRoleId || null,
          token: data.token,
          expiresAt: data.expiresAt,
          status: 'PENDING',
          invitedById: data.invitedById || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        invitations.set(data.token, inv);
        return inv;
      },
      async update({ where, data }) {
        let inv = null;
        if (where.token) inv = invitations.get(where.token);
        else if (where.id) {
          for (const i of invitations.values()) {
            if (i.id === where.id) {
              inv = i;
              break;
            }
          }
        }
        if (inv) {
          checkRlsWrite(inv.organizationId);
          Object.assign(inv, data, { updatedAt: new Date() });
          return inv;
        }
        throw new Error('Invitation not found for update');
      },
    },

    apiKey: {
      async findUnique({ where }) {
        if (where.keyHash) {
          for (const k of apiKeys.values()) {
            if (k.keyHash === where.keyHash) return k;
          }
        }
        if (where.id) return apiKeys.get(where.id) || null;
        return null;
      },
      async findMany({ where = {} }) {
        const results = [];
        const rlsOrg = getRlsOrgId();
        for (const k of apiKeys.values()) {
          if (enforceRls && rlsOrg && k.organizationId !== rlsOrg) continue;
          if (enforceRls && !rlsOrg && !where.organizationId) continue;
          if (where.organizationId && k.organizationId !== where.organizationId) continue;
          if (where.isRevoked !== undefined && k.isRevoked !== where.isRevoked) continue;
          results.push(k);
        }
        return results;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const key = {
          id,
          organizationId: data.organizationId,
          userId: data.userId || null,
          name: data.name,
          keyHash: data.keyHash,
          keyPrefix: data.keyPrefix,
          scopes: Array.isArray(data.scopes) ? data.scopes : [],
          lastUsedAt: null,
          expiresAt: data.expiresAt || null,
          isRevoked: Boolean(data.isRevoked),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        apiKeys.set(id, key);
        return key;
      },
      async update({ where, data }) {
        const key = apiKeys.get(where.id);
        if (!key) throw new Error('ApiKey not found');
        checkRlsWrite(key.organizationId);
        Object.assign(key, data, { updatedAt: new Date() });
        return key;
      },
    },

    monitor: {
      async findUnique({ where }) {
        if (where.id) {
          const m = monitors.get(where.id);
          if (!m) return null;
          const rlsOrg = getRlsOrgId();
          if (enforceRls && rlsOrg && m.organizationId !== rlsOrg) return null;
          return m;
        }
        return null;
      },
      async findMany({ where = {} } = {}) {
        const results = [];
        const rlsOrg = getRlsOrgId();
        for (const m of monitors.values()) {
          // If RLS is enabled: filter by current_setting('app.org_id')
          // even when where.organizationId was completely removed!
          if (enforceRls && rlsOrg && m.organizationId !== rlsOrg) continue;
          if (enforceRls && !rlsOrg && !where.organizationId) continue;
          if (where.organizationId && m.organizationId !== where.organizationId) continue;
          results.push(m);
        }
        return results;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const mon = {
          id,
          organizationId: data.organizationId,
          name: data.name,
          url: data.url,
          method: data.method || 'GET',
          intervalSeconds: data.intervalSeconds || 60,
          timeoutSeconds: data.timeoutSeconds || 30,
          status: 'ACTIVE',
          headers: data.headers || {},
          body: data.body || null,
          assertionConfig: data.assertionConfig || { expectedStatusCode: 200 },
          encryptedAuth: data.encryptedAuth || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        monitors.set(id, mon);
        return mon;
      },
      async update({ where, data }) {
        const mon = monitors.get(where.id);
        if (!mon) throw new Error('Monitor not found');
        checkRlsWrite(mon.organizationId);
        Object.assign(mon, data, { updatedAt: new Date() });
        return mon;
      },
    },

    checkResult: {
      async findMany({ where: _where = {} } = {}) {
        const results = [];
        return results;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        return { id: crypto.randomUUID(), ...data, checkedAt: new Date() };
      },
      async createMany({ data }) {
        return { count: data.length };
      },
    },

    auditLog: {
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const log = {
          id,
          organizationId: data.organizationId,
          userId: data.userId || null,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          before: data.before || null,
          after: data.after || null,
          details: data.details || null,
          createdAt: new Date(),
        };
        auditLogs.set(id, log);
        return log;
      },
      async count({ where = {} }) {
        const list = await mockDb.auditLog.findMany({ where });
        return list.length;
      },
      async findMany({ where = {}, orderBy = { createdAt: 'desc' }, skip = 0, take = 50 }) {
        let results = [];
        const rlsOrg = getRlsOrgId();
        for (const log of auditLogs.values()) {
          if (enforceRls && rlsOrg && log.organizationId !== rlsOrg) continue;
          if (where.organizationId && log.organizationId !== where.organizationId) continue;
          if (
            where.action &&
            log.action !== where.action &&
            !log.action.toLowerCase().includes(where.action.toLowerCase())
          )
            continue;
          if (where.userId && log.userId !== where.userId) continue;
          if (where.entityType && log.entityType.toLowerCase() !== where.entityType.toLowerCase())
            continue;
          if (where.entityId && log.entityId !== where.entityId) continue;
          if (where.createdAt) {
            if (where.createdAt.gte && new Date(log.createdAt) < new Date(where.createdAt.gte))
              continue;
            if (where.createdAt.lte && new Date(log.createdAt) > new Date(where.createdAt.lte))
              continue;
          }

          results.push({
            ...log,
            user: log.userId ? users.get(log.userId) : null,
          });
        }

        results.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return orderBy.createdAt === 'asc' ? dateA - dateB : dateB - dateA;
        });

        if (typeof skip === 'number' && typeof take === 'number') {
          return results.slice(skip, skip + take);
        }
        return results;
      },
    },

    organizationKey: {
      async findFirst({ where }) {
        const matching = [];
        for (const k of organizationKeys.values()) {
          if (where.organizationId && k.organizationId !== where.organizationId) continue;
          if (where.status && k.status !== where.status) continue;
          matching.push(k);
        }
        return matching[0] || null;
      },
      async create({ data }) {
        checkRlsWrite(data.organizationId);
        const id = data.id || crypto.randomUUID();
        const key = {
          id,
          organizationId: data.organizationId,
          keyVersion: data.keyVersion || 1,
          encryptedKey: data.encryptedKey,
          masterKeyId: data.masterKeyId || 'v1',
          algorithm: data.algorithm || 'aes-256-gcm',
          status: data.status || 'ACTIVE',
          createdAt: new Date(),
          rotatedAt: null,
        };
        organizationKeys.set(`${data.organizationId}:${key.keyVersion}`, key);
        return key;
      },
    },

    async $transaction(fnOrArray) {
      if (Array.isArray(fnOrArray)) {
        return Promise.all(fnOrArray);
      }
      // Create a scoped transaction client
      const tx = Object.create(mockDb);
      tx.setTenantOrgId(currentTenantOrgId);
      return fnOrArray(tx);
    },

    async $executeRawUnsafe(sql, ...params) {
      // Parse SELECT set_config('app.org_id', $1, true)
      if (sql.includes('set_config') && sql.includes('app.org_id')) {
        const orgId = params[0];
        mockDb.setTenantOrgId(orgId);
        return 1;
      }
      return 1;
    },

    async $queryRaw() {
      return [{ healthy: 1 }];
    },

    /**
     * Extension method: executes callback within an RLS transaction with app.org_id set.
     */
    async forTenant(organizationId, fn) {
      const tx = Object.create(mockDb);
      tx.setTenantOrgId(organizationId);
      return fn(tx);
    },
  };

  return mockDb;
}
