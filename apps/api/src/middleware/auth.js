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

/**
 * Middleware that authenticates JWT Bearer tokens and attaches req.user.
 */
export function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    next();
  } catch (_err) {
    return next(new UnauthorizedError('Invalid, malformed, or expired access token'));
  }
}

/**
 * Org-scoped middleware: Resolves the target organization and user's role in it.
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
        },
      });

      if (!membership) {
        // User does not belong to this organization -> Block access
        return next(new ForbiddenError('Access denied: You are not a member of this organization'));
      }

      req.organizationId = organizationId;
      req.org = membership.organization;
      req.membership = membership;
      req.orgRole = membership.role;

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
    if (!req.membership || !req.orgRole) {
      return next(
        new ForbiddenError('Cannot check role: Organization context has not been resolved')
      );
    }

    const userRoleRank = ROLE_RANKS[req.orgRole] || 0;
    const minRequiredRank = Math.min(...allowedRoles.map((r) => ROLE_RANKS[r] || 99));

    // Check if user has sufficient rank or explicit role match
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
