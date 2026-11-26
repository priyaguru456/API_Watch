import crypto from 'node:crypto';
import { prisma } from '@apiwatch/db';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '@apiwatch/shared';
import { verifyAccessToken } from '../utils/tokens.js';

// Role hierarchy rank mapping: OWNER > ADMIN > ENGINEER > VIEWER
const ROLE_RANKS = {
  OWNER: 4,
  ADMIN: 3,
  ENGINEER: 2,
  VIEWER: 1,
};

// Default permission matrix for native roles
const DEFAULT_ROLE_PERMISSIONS = {
  OWNER: ['*'],
  ADMIN: ['monitors:*', 'members:*', 'roles:*', 'api_keys:*', 'audit:*', 'settings:*'],
  ENGINEER: [
    'monitors:read',
    'monitors:create',
    'monitors:update',
    'monitors:delete',
    'api_keys:read',
    'api_keys:create',
  ],
  VIEWER: ['monitors:read', 'members:read', 'audit:read'],
};

/**
 * Checks if a granted permission (e.g. "monitors:*", "*", or "monitors:create")
 * satisfies a required permission (e.g. "monitors:create").
 *
 * @param {string} granted
 * @param {string} required
 * @returns {boolean}
 */
export function matchesPermission(granted, required) {
  if (granted === '*' || granted === required) return true;
  if (granted.endsWith(':*')) {
    const prefix = granted.slice(0, -2);
    return required.startsWith(`${prefix}:`);
  }
  return false;
}

/**
 * Middleware that authenticates JWT Bearer tokens or Hashed API Keys and attaches req.user.
 *
 * @param {object} [options]
 * @param {import('@prisma/client').PrismaClient} [options.db]
 */
export function createRequireAuthMiddleware(options = {}) {
  const db = options.db || prisma;

  return async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    const apiKeyToken =
      (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) ||
      (authHeader && authHeader.startsWith('Bearer ak_') ? authHeader.slice(7).trim() : null);

    // 1. API Key Authentication Flow
    if (apiKeyToken) {
      try {
        const keyHash = crypto.createHash('sha256').update(apiKeyToken).digest('hex');
        const apiKey = await db.apiKey.findUnique({
          where: { keyHash },
          include: { organization: true },
        });

        if (!apiKey || apiKey.isRevoked) {
          return next(new UnauthorizedError('Invalid, expired, or revoked API key'));
        }

        if (apiKey.expiresAt && new Date() > new Date(apiKey.expiresAt)) {
          return next(new UnauthorizedError('API key has expired'));
        }

        // Track last-used timestamp asynchronously
        db.apiKey
          .update({
            where: { id: apiKey.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => {});

        req.apiKey = apiKey;
        req.user = {
          id: apiKey.userId || 'api-key-actor',
          email: 'apikey@apiwatch.io',
          isApiKey: true,
        };
        req.organizationId = apiKey.organizationId;
        req.org = apiKey.organization;
        req.orgRole = 'ADMIN'; // API keys operate with Admin rank within their granted scopes
        req.permissions = Array.isArray(apiKey.scopes) ? apiKey.scopes : [];

        return next();
      } catch (err) {
        return next(err);
      }
    }

    // 2. JWT Bearer Token Authentication Flow
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing or malformed Authorization header'));
    }

    const token = authHeader.slice(7).trim();
    try {
      const payload = verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
      next();
    } catch (_err) {
      return next(new UnauthorizedError('Invalid, malformed, or expired access token'));
    }
  };
}

export const requireAuth = createRequireAuthMiddleware();

/**
 * Org-scoped middleware: Resolves the target organization and user's role/permissions in it.
 * Strictly guarantees multi-tenant isolation by checking the user's membership.
 *
 * @param {object} [options]
 * @param {import('@prisma/client').PrismaClient} [options.db]
 */
export function createResolveOrgMiddleware(options = {}) {
  const db = options.db || prisma;

  return async (req, _res, next) => {
    if (!req.user || !req.user.id) {
      return next(new UnauthorizedError('Authentication required before organization scoping'));
    }

    // If request was already scoped via API key
    if (req.apiKey && req.organizationId) {
      return next();
    }

    const orgId =
      req.headers['x-organization-id'] ||
      req.params.organizationId ||
      req.params.orgId ||
      req.query.organizationId ||
      req.body?.organizationId;

    if (!orgId || typeof orgId !== 'string') {
      return next(
        new BadRequestError('Organization ID is required (via X-Organization-Id header or param)')
      );
    }

    const organizationId = orgId.trim();

    try {
      const membership = await db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: req.user.id,
          },
        },
        include: {
          organization: true,
          customRole: true,
        },
      });

      if (!membership) {
        return next(new ForbiddenError('Access denied: You are not a member of this organization'));
      }

      req.organizationId = organizationId;
      req.org = membership.organization;
      req.membership = membership;
      req.orgRole = membership.role;

      // Resolve combined permissions from standard role and custom role
      const standardPerms = DEFAULT_ROLE_PERMISSIONS[membership.role] || [];
      const customPerms = membership.customRole?.permissions || [];
      req.permissions = Array.from(new Set([...standardPerms, ...customPerms]));

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const resolveOrg = createResolveOrgMiddleware();

/**
 * Role guard middleware: Ensures the user has one of the allowed roles (or higher).
 * @param {...('OWNER'|'ADMIN'|'ENGINEER'|'VIEWER')} allowedRoles
 */
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.orgRole) {
      return next(
        new ForbiddenError('Cannot check role: Organization context has not been resolved')
      );
    }

    const userRoleRank = ROLE_RANKS[req.orgRole] || 0;
    const minRequiredRank = Math.min(...allowedRoles.map((r) => ROLE_RANKS[r] || 99));

    const hasPermission = userRoleRank >= minRequiredRank || allowedRoles.includes(req.orgRole);

    if (!hasPermission) {
      return next(
        new ForbiddenError(
          `Insufficient permissions: Action requires one of [${allowedRoles.join(
            ', '
          )}], but current role is ${req.orgRole}`
        )
      );
    }

    next();
  };
}

/**
 * Permission guard middleware: Ensures the user or API key possesses
 * the necessary granular permissions (e.g., 'monitors:create', 'members:invite').
 * Resolves against custom roles table, standard role matrix, and API key scopes.
 *
 * @param {...string} requiredPermissions
 */
export function requirePermission(...requiredPermissions) {
  return (req, _res, next) => {
    if (!req.permissions || !Array.isArray(req.permissions)) {
      return next(
        new ForbiddenError('Cannot check permission: Organization permissions context is missing')
      );
    }

    const granted = req.permissions;
    const hasAll = requiredPermissions.every((required) =>
      granted.some((g) => matchesPermission(g, required))
    );

    if (!hasAll) {
      return next(
        new ForbiddenError(
          `Insufficient permissions: Action requires permission [${requiredPermissions.join(', ')}]`
        )
      );
    }

    next();
  };
}
