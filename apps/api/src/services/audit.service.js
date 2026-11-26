import { prisma } from '@apiwatch/db';
import { redactSensitiveData } from '@apiwatch/shared';

/**
 * Formats an AuditLog model instance for API responses.
 * @param {object} log
 */
export function formatAuditLogResponse(log) {
  return {
    id: log.id,
    organizationId: log.organizationId,
    action: log.action,
    actor: {
      id: log.userId,
      email: log.user?.email || null,
      name: log.user?.name || null,
    },
    target: {
      type: log.entityType,
      id: log.entityId,
    },
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    before: log.before,
    after: log.after,
    details: log.details,
    createdAt: log.createdAt,
  };
}

/**
 * Formats audit logs as a clean, properly escaped CSV string.
 * @param {object[]} logs
 * @returns {string}
 */
export function toCsv(logs) {
  const headers = [
    'id',
    'createdAt',
    'actorId',
    'actorEmail',
    'action',
    'targetType',
    'targetId',
    'ipAddress',
    'userAgent',
    'details',
  ];

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];
  for (const log of logs) {
    const row = [
      escapeCell(log.id),
      escapeCell(log.createdAt),
      escapeCell(log.actor?.id || log.userId),
      escapeCell(log.actor?.email),
      escapeCell(log.action),
      escapeCell(log.target?.type || log.entityType),
      escapeCell(log.target?.id || log.entityId),
      escapeCell(log.ipAddress),
      escapeCell(log.userAgent),
      escapeCell(log.details),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}

/**
 * Multi-tenant Audit Service.
 * Records security and lifecycle events with strictly redacted state before/after,
 * and provides org-scoped search, filtering, and export capabilities.
 */
export class AuditService {
  /**
   * @param {object} [options]
   * @param {import('@prisma/client').PrismaClient} [options.db]
   */
  constructor(options = {}) {
    this.db = options.db || prisma;
  }

  /**
   * Records an audit event. Guaranteed strictly org-scoped and redacted.
   *
   * @param {object} params
   * @param {string} params.organizationId
   * @param {object|string} [params.actor] User object or ID
   * @param {string} params.action E.g. 'monitor.create', 'key.rotate'
   * @param {object|string} [params.target] Entity type and ID
   * @param {string} [params.ipAddress]
   * @param {string} [params.userAgent]
   * @param {any} [params.before] Pre-action state (redacted)
   * @param {any} [params.after] Post-action state (redacted)
   * @param {any} [params.details] Contextual details (redacted)
   * @returns {Promise<object>}
   */
  async record({
    organizationId,
    actor,
    action,
    target,
    ipAddress,
    userAgent,
    before,
    after,
    details = {},
  }) {
    if (!organizationId || typeof organizationId !== 'string') {
      throw new Error('organizationId is required to record an audit log');
    }
    if (!action || typeof action !== 'string') {
      throw new Error('action is required to record an audit log');
    }

    const actorId =
      actor && typeof actor === 'object'
        ? actor.id || null
        : typeof actor === 'string'
          ? actor
          : null;

    let entityType = 'general';
    let entityId = null;
    if (target && typeof target === 'object') {
      entityType = target.type || 'general';
      entityId = target.id || null;
    } else if (typeof target === 'string') {
      entityType = target;
    }

    // Always deep redact before, after, and details
    const redactedBefore =
      before !== undefined && before !== null ? redactSensitiveData(before) : null;
    const redactedAfter = after !== undefined && after !== null ? redactSensitiveData(after) : null;
    const redactedDetails =
      details !== undefined && details !== null ? redactSensitiveData(details) : null;

    const log = await this.db.auditLog.create({
      data: {
        organizationId,
        userId: actorId,
        action,
        entityType,
        entityId,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        before: redactedBefore,
        after: redactedAfter,
        details: redactedDetails,
      },
    });

    return log;
  }

  /**
   * Queries and searches audit logs scoped strictly to the specified organization.
   *
   * @param {string} organizationId
   * @param {object} [filters]
   * @returns {Promise<{ logs: object[]; pagination: object }>}
   */
  async search(organizationId, filters = {}) {
    if (!organizationId) {
      throw new Error('organizationId is required to search audit logs');
    }

    const {
      page = 1,
      limit = 20,
      action,
      actorId,
      entityType,
      entityId,
      startDate,
      endDate,
      search,
    } = filters;

    const where = {
      organizationId,
    };

    if (action) {
      where.action = action;
    }
    if (actorId) {
      where.userId = actorId;
    }
    if (entityType) {
      where.entityType = entityType;
    }
    if (entityId) {
      where.entityId = entityId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
      ];
    }

    const total = await this.db.auditLog.count({ where });
    const skip = (page - 1) * limit;

    const logs = await this.db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return {
      logs: logs.map(formatAuditLogResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Exports audit logs as CSV or JSON.
   *
   * @param {string} organizationId
   * @param {object} [filters]
   * @param {'json'|'csv'} [format='json']
   * @returns {Promise<{ data: string|object[]; contentType: string; filename: string }>}
   */
  async exportLogs(organizationId, filters = {}, format = 'json') {
    if (!organizationId) {
      throw new Error('organizationId is required to export audit logs');
    }

    const { action, actorId, entityType, entityId, startDate, endDate, search } = filters;

    const where = {
      organizationId,
    };

    if (action) where.action = action;
    if (actorId) where.userId = actorId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
      ];
    }

    const logs = await this.db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    const formatted = logs.map(formatAuditLogResponse);
    const timestamp = Date.now();

    if (format === 'csv') {
      const csvData = toCsv(formatted);
      return {
        data: csvData,
        contentType: 'text/csv; charset=utf-8',
        filename: `audit-logs-${organizationId}-${timestamp}.csv`,
      };
    }

    return {
      data: formatted,
      contentType: 'application/json; charset=utf-8',
      filename: `audit-logs-${organizationId}-${timestamp}.json`,
    };
  }
}

export function createAuditService(options = {}) {
  return new AuditService(options);
}
