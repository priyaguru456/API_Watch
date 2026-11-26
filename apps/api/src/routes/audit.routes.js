import { Router } from 'express';
import { prisma } from '@apiwatch/db';
import { auditQuerySchema, auditExportSchema } from '@apiwatch/shared';
import { requireAuth, createResolveOrgMiddleware, requireRole } from '../middleware/auth.js';
import { createAuditService } from '../services/audit.service.js';

/**
 * Creates express router for audit log queries and exports.
 * @param {object} [options]
 * @param {import('@prisma/client').PrismaClient} [options.db]
 * @param {import('../services/audit.service.js').AuditService} [options.auditService]
 */
export function createAuditRouter(options = {}) {
  const router = Router({ mergeParams: true });
  const db = options.db || prisma;
  const auditService = options.auditService || createAuditService({ db });
  const resolveOrg = createResolveOrgMiddleware({ db });

  /**
   * GET / - Search and list audit logs for an organization.
   * Scoped strictly by organizationId. Accessible by OWNER, ADMIN, ENGINEER, VIEWER.
   */
  async function listAuditLogsHandler(req, res, next) {
    try {
      const filters = auditQuerySchema.parse(req.query);
      const { organizationId } = req;

      const result = await auditService.search(organizationId, filters);

      res.status(200).json({
        success: true,
        logs: result.logs,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /export - Export audit logs as CSV or JSON.
   * Scoped strictly by organizationId. Accessible by OWNER, ADMIN.
   */
  async function exportAuditLogsHandler(req, res, next) {
    try {
      const { format = 'json', ...filters } = auditExportSchema.parse(req.query);
      const { organizationId } = req;

      const exportResult = await auditService.exportLogs(organizationId, filters, format);

      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);

      if (format === 'csv') {
        res.status(200).send(exportResult.data);
      } else {
        res.status(200).json({
          success: true,
          count: exportResult.data.length,
          logs: exportResult.data,
        });
      }
    } catch (err) {
      next(err);
    }
  }

  // Mount handlers with authentication and tenant resolution
  router.get(
    '/export',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    exportAuditLogsHandler
  );
  router.get('/', requireAuth, resolveOrg, listAuditLogsHandler);

  return router;
}

export const auditRouter = createAuditRouter();
