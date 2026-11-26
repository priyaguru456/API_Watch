import { prisma } from '@apiwatch/db';

/**
 * Records a tenant-scoped or security audit log entry.
 *
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} [params.db]
 * @param {string} params.organizationId
 * @param {string} [params.userId]
 * @param {string} params.action
 * @param {string} params.entityType
 * @param {string} [params.entityId]
 * @param {object} [params.details]
 * @param {import('express').Request} [params.req]
 * @returns {Promise<any>}
 */
export async function recordAuditLog({
  db = prisma,
  organizationId,
  userId = null,
  action,
  entityType,
  entityId = null,
  details = null,
  req = null,
}) {
  if (!organizationId) {
    // If auth event occurs before organization selection (e.g. invalid login),
    // we use a system organization sentinel or skip org-scoped audit table
    return null;
  }

  const ipAddress = req
    ? req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
    : null;
  const userAgent = req ? req.headers['user-agent'] || null : null;

  try {
    return await db.auditLog.create({
      data: {
        organizationId,
        userId: userId || null,
        action,
        entityType,
        entityId: entityId || null,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : null,
        userAgent,
        details: details || undefined,
      },
    });
  } catch (_err) {
    // Audit log should not break main user flow, but errors should be observable
    return null;
  }
}
