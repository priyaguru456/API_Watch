import crypto from 'node:crypto';

/**
 * Creates an in-memory database mock conforming to the PrismaClient interface
 * for User, Organization, Membership, RefreshToken, Invitation, and Monitor models.
 */
export function createMockPrisma() {
  const users = new Map();
  const organizations = new Map();
  const memberships = new Map(); // key: `${orgId}:${userId}`
  const refreshTokens = new Map(); // key: tokenHash
  const invitations = new Map(); // key: token
  const monitors = new Map(); // key: id

  const mockDb = {
    user: {
      async findUnique({ where }) {
        if (where.id) return users.get(where.id) || null;
        if (where.email) {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) return u;
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
          createdAt: new Date(),
          updatedAt: new Date(),
          memberships: [],
        };
        users.set(id, user);
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

    membership: {
      async findUnique({ where }) {
        if (where.organizationId_userId) {
          const { organizationId, userId } = where.organizationId_userId;
          const key = `${organizationId}:${userId}`;
          const mem = memberships.get(key);
          if (!mem) return null;
          return {
            ...mem,
            organization: organizations.get(mem.organizationId),
            user: users.get(mem.userId),
          };
        }
        return null;
      },
      async findFirst({ where }) {
        for (const m of memberships.values()) {
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
            };
          }
        }
        return null;
      },
      async findMany({ where }) {
        const results = [];
        for (const m of memberships.values()) {
          if (!where.organizationId || m.organizationId === where.organizationId) {
            results.push({
              ...m,
              organization: organizations.get(m.organizationId),
              user: users.get(m.userId),
            });
          }
        }
        return results;
      },
      async create({ data }) {
        const id = data.id || crypto.randomUUID();
        const mem = {
          id,
          organizationId: data.organizationId,
          userId: data.userId,
          role: data.role || 'VIEWER',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        memberships.set(`${data.organizationId}:${data.userId}`, mem);

        // link to user and org in memory
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
        const key = `${organizationId}:${userId}`;
        const existing = memberships.get(key);
        if (existing) {
          existing.role = update.role;
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
      async create({ data }) {
        const id = data.id || crypto.randomUUID();
        const inv = {
          id,
          organizationId: data.organizationId,
          email: data.email,
          role: data.role || 'VIEWER',
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
          Object.assign(inv, data, { updatedAt: new Date() });
          return inv;
        }
        throw new Error('Invitation not found for update');
      },
    },

    monitor: {
      async findMany({ where }) {
        const results = [];
        for (const m of monitors.values()) {
          if (!where.organizationId || m.organizationId === where.organizationId) {
            results.push(m);
          }
        }
        return results;
      },
      async create({ data }) {
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
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        monitors.set(id, mon);
        return mon;
      },
    },

    async $transaction(fnOrArray) {
      if (Array.isArray(fnOrArray)) {
        return Promise.all(fnOrArray);
      }
      return fnOrArray(mockDb);
    },

    async $queryRaw() {
      return [{ healthy: 1 }];
    },
  };

  return mockDb;
}
