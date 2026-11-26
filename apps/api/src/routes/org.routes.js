import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma } from '@apiwatch/db';
import {
  inviteMemberSchema,
  createMonitorSchema,
  createApiKeySchema,
  createCustomRoleSchema,
  rotateKeySchema,
  ConflictError,
  BadRequestError,
  NotFoundError,
} from '@apiwatch/shared';
import { createVaultService } from '@apiwatch/vault';
import { createAuditService } from '../services/audit.service.js';
import {
  createRequireAuthMiddleware,
  createResolveOrgMiddleware,
  requireRole,
  requirePermission,
} from '../middleware/auth.js';

export function createOrgRouter({
  db = prisma,
  vault = createVaultService({ db }),
  auditService = createAuditService({ db }),
} = {}) {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware({ db });
  const resolveOrg = createResolveOrgMiddleware({ db });

  // ==========================================
  // MEMBERS MANAGEMENT
  // ==========================================

  async function listMembersHandler(req, res, next) {
    try {
      const { organizationId } = req;
      const members = await db.membership.findMany({
        where: { organizationId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          customRole: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      res.status(200).json({
        success: true,
        members: members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          customRole: m.customRole
            ? {
                id: m.customRole.id,
                name: m.customRole.name,
                permissions: m.customRole.permissions,
              }
            : null,
          createdAt: m.createdAt,
          user: m.user,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  router.get(
    '/members',
    requireAuth,
    resolveOrg,
    requirePermission('members:read'),
    listMembersHandler
  );
  router.get(
    '/:organizationId/members',
    requireAuth,
    resolveOrg,
    requirePermission('members:read'),
    listMembersHandler
  );

  // ==========================================
  // CUSTOM ROLES MANAGEMENT
  // ==========================================

  async function createCustomRoleHandler(req, res, next) {
    try {
      const data = createCustomRoleSchema.parse(req.body);
      const { organizationId } = req;

      const existing = await db.customRole.findUnique({
        where: {
          organizationId_name: {
            organizationId,
            name: data.name,
          },
        },
      });

      if (existing) {
        throw new ConflictError(`Custom role "${data.name}" already exists in this organization`);
      }

      const role = await db.customRole.create({
        data: {
          organizationId,
          name: data.name,
          description: data.description || null,
          permissions: data.permissions,
        },
      });

      await auditService.record({
        organizationId,
        actor: req.user,
        action: 'role.create',
        target: { type: 'custom_role', id: role.id },
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        details: { name: role.name, permissions: role.permissions },
      });

      res.status(201).json({
        success: true,
        role,
      });
    } catch (err) {
      next(err);
    }
  }

  async function listCustomRolesHandler(req, res, next) {
    try {
      const { organizationId } = req;
      const roles = await db.customRole.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });

      res.status(200).json({
        success: true,
        roles,
      });
    } catch (err) {
      next(err);
    }
  }

  router.post(
    '/roles',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    createCustomRoleHandler
  );
  router.post(
    '/:organizationId/roles',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    createCustomRoleHandler
  );

  router.get(
    '/roles',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN', 'ENGINEER', 'VIEWER'),
    listCustomRolesHandler
  );
  router.get(
    '/:organizationId/roles',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN', 'ENGINEER', 'VIEWER'),
    listCustomRolesHandler
  );

  // ==========================================
  // HASHED API KEYS WITH SCOPES & AUDIT
  // ==========================================

  async function createApiKeyHandler(req, res, next) {
    try {
      const data = createApiKeySchema.parse(req.body);
      const { organizationId } = req;

      // Generate secure 32-byte API key: ak_live_<random_hex>
      const secretRandom = crypto.randomBytes(24).toString('hex');
      const secretKey = `ak_live_${secretRandom}`;
      const keyPrefix = `ak_live_${secretRandom.slice(0, 6)}`;
      const keyHash = crypto.createHash('sha256').update(secretKey).digest('hex');

      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const apiKey = await db.apiKey.create({
        data: {
          organizationId,
          userId: req.user?.id || null,
          name: data.name,
          keyHash,
          keyPrefix,
          scopes: data.scopes,
          expiresAt,
        },
      });

      await auditService.record({
        organizationId,
        actor: req.user,
        action: 'api_key.create',
        target: { type: 'api_key', id: apiKey.id },
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        details: { name: apiKey.name, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes },
      });

      // Raw secretKey is returned ONLY ONCE upon creation!
      res.status(201).json({
        success: true,
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          scopes: apiKey.scopes,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
        secretKey,
      });
    } catch (err) {
      next(err);
    }
  }

  async function listApiKeysHandler(req, res, next) {
    try {
      const { organizationId } = req;
      const keys = await db.apiKey.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });

      // Secrets and key hashes are NEVER returned!
      res.status(200).json({
        success: true,
        apiKeys: keys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt,
          expiresAt: k.expiresAt,
          isRevoked: k.isRevoked,
          createdAt: k.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  async function revokeApiKeyHandler(req, res, next) {
    try {
      const { organizationId } = req;
      const { apiKeyId } = req.params;

      const key = await db.apiKey.findUnique({
        where: { id: apiKeyId },
      });

      if (!key || key.organizationId !== organizationId) {
        throw new NotFoundError('API key not found');
      }

      await db.apiKey.update({
        where: { id: apiKeyId },
        data: { isRevoked: true },
      });

      await auditService.record({
        organizationId,
        actor: req.user,
        action: 'api_key.revoke',
        target: { type: 'api_key', id: apiKeyId },
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        details: { keyPrefix: key.keyPrefix },
      });

      res.status(200).json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  router.post(
    '/api-keys',
    requireAuth,
    resolveOrg,
    requirePermission('api_keys:create'),
    createApiKeyHandler
  );
  router.post(
    '/:organizationId/api-keys',
    requireAuth,
    resolveOrg,
    requirePermission('api_keys:create'),
    createApiKeyHandler
  );

  router.get(
    '/api-keys',
    requireAuth,
    resolveOrg,
    requirePermission('api_keys:read'),
    listApiKeysHandler
  );
  router.get(
    '/:organizationId/api-keys',
    requireAuth,
    resolveOrg,
    requirePermission('api_keys:read'),
    listApiKeysHandler
  );

  router.delete(
    '/api-keys/:apiKeyId',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    revokeApiKeyHandler
  );
  router.delete(
    '/:organizationId/api-keys/:apiKeyId',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    revokeApiKeyHandler
  );

  // ==========================================
  // MONITORS MANAGEMENT
  // ==========================================

  async function listMonitorsHandler(req, res, next) {
    try {
      const { organizationId } = req;
      const monitors = await db.monitor.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        monitors: monitors.map((m) => {
          const { encryptedAuth, ...rest } = m;
          return {
            ...rest,
            hasAuth: Boolean(encryptedAuth),
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  }

  router.get(
    '/monitors',
    requireAuth,
    resolveOrg,
    requirePermission('monitors:read'),
    listMonitorsHandler
  );
  router.get(
    '/:organizationId/monitors',
    requireAuth,
    resolveOrg,
    requirePermission('monitors:read'),
    listMonitorsHandler
  );

  async function createMonitorHandler(req, res, next) {
    try {
      const data = createMonitorSchema.parse(req.body);
      const { organizationId } = req;

      let encryptedAuth = null;
      if (data.auth) {
        encryptedAuth = await vault.encrypt(organizationId, data.auth);
      }

      const monitor = await db.monitor.create({
        data: {
          organizationId,
          name: data.name,
          url: data.url,
          method: data.method,
          intervalSeconds: data.intervalSeconds,
          timeoutSeconds: data.timeoutSeconds,
          headers: data.headers,
          body: data.body ? JSON.stringify(data.body) : undefined,
          assertionConfig: data.assertionConfig,
          encryptedAuth,
        },
      });

      await auditService.record({
        organizationId,
        actor: req.user,
        action: 'monitor.create',
        target: { type: 'monitor', id: monitor.id },
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        details: { name: monitor.name, url: monitor.url },
      });

      const { encryptedAuth: _secret, ...sanitizedMonitor } = monitor;

      res.status(201).json({
        success: true,
        monitor: {
          ...sanitizedMonitor,
          hasAuth: Boolean(encryptedAuth),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  router.post(
    '/monitors',
    requireAuth,
    resolveOrg,
    requirePermission('monitors:create'),
    createMonitorHandler
  );
  router.post(
    '/:organizationId/monitors',
    requireAuth,
    resolveOrg,
    requirePermission('monitors:create'),
    createMonitorHandler
  );

  // ==========================================
  // INVITATIONS MANAGEMENT
  // ==========================================

  async function inviteMemberHandler(req, res, next) {
    try {
      const data = inviteMemberSchema.parse(req.body);
      const { organizationId } = req;

      const existingMembership = await db.membership.findFirst({
        where: {
          organizationId,
          user: { email: data.email },
        },
      });

      if (existingMembership) {
        throw new ConflictError('User is already a member of this organization');
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitation = await db.invitation.create({
        data: {
          organizationId,
          email: data.email,
          role: data.role,
          customRoleId: data.customRoleId || null,
          token,
          expiresAt,
          invitedById: req.user.id,
        },
      });

      await auditService.record({
        organizationId,
        actor: req.user,
        action: 'member.invite',
        target: { type: 'invitation', id: invitation.id },
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        details: {
          email: invitation.email,
          role: invitation.role,
          customRoleId: invitation.customRoleId,
        },
      });

      res.status(201).json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          customRoleId: invitation.customRoleId,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  router.post(
    '/invites',
    requireAuth,
    resolveOrg,
    requirePermission('members:invite'),
    inviteMemberHandler
  );
  router.post(
    '/:organizationId/invites',
    requireAuth,
    resolveOrg,
    requirePermission('members:invite'),
    inviteMemberHandler
  );

  // ==========================================
  // VAULT KEY ROTATION
  // ==========================================

  async function rotateKeyHandler(req, res, next) {
    try {
      const { reencrypt = true } = rotateKeySchema.parse(req.body || {});
      const { organizationId } = req;

      const result = await vault.rotateOrgKey(organizationId, {
        reencrypt,
        db,
      });

      await auditService.record({
        organizationId,
        actor: req.user,
        action: 'vault.rotate_key',
        target: { type: 'organization_key', id: organizationId },
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        details: { reencrypt, newVersion: result.newVersion },
      });

      res.status(200).json({
        success: true,
        organizationId: result.organizationId,
        previousVersion: result.previousVersion,
        newVersion: result.newVersion,
        reencryptedCount: result.reencryptedCount,
      });
    } catch (err) {
      next(err);
    }
  }

  router.post(
    '/keys/rotate',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    rotateKeyHandler
  );
  router.post(
    '/:organizationId/keys/rotate',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    rotateKeyHandler
  );

  return router;
}

export function createInviteAcceptRouter({ db = prisma } = {}) {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware({ db });

  router.post('/:token/accept', requireAuth, async (req, res, next) => {
    try {
      const { token } = req.params;
      if (!token) {
        throw new BadRequestError('Invitation token is required');
      }

      const invitation = await db.invitation.findUnique({
        where: { token },
      });

      if (!invitation) {
        throw new NotFoundError('Invitation not found or invalid');
      }

      if (invitation.status !== 'PENDING') {
        throw new BadRequestError(`Invitation has already been ${invitation.status.toLowerCase()}`);
      }

      if (new Date() > new Date(invitation.expiresAt)) {
        await db.invitation.update({
          where: { id: invitation.id },
          data: { status: 'REVOKED' },
        });
        throw new BadRequestError('Invitation has expired');
      }

      const membership = await db.$transaction(async (tx) => {
        const mem = await tx.membership.upsert({
          where: {
            organizationId_userId: {
              organizationId: invitation.organizationId,
              userId: req.user.id,
            },
          },
          update: {
            role: invitation.role,
            customRoleId: invitation.customRoleId || null,
          },
          create: {
            organizationId: invitation.organizationId,
            userId: req.user.id,
            role: invitation.role,
            customRoleId: invitation.customRoleId || null,
          },
        });

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED' },
        });

        return mem;
      });

      res.status(200).json({
        success: true,
        message: 'Invitation accepted successfully',
        organizationId: invitation.organizationId,
        role: membership.role,
        customRoleId: membership.customRoleId,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const orgRouter = createOrgRouter();
export const inviteAcceptRouter = createInviteAcceptRouter();
