import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma } from '@apiwatch/db';
import {
  inviteMemberSchema,
  createMonitorSchema,
  ConflictError,
  BadRequestError,
  NotFoundError,
} from '@apiwatch/shared';
import { requireAuth, createResolveOrgMiddleware, requireRole } from '../middleware/auth.js';

export function createOrgRouter({ db = prisma } = {}) {
  const router = Router();
  const resolveOrg = createResolveOrgMiddleware({ db });

  /**
   * Helper to handle listing members for an organization.
   */
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
        },
        orderBy: { createdAt: 'asc' },
      });

      res.status(200).json({
        success: true,
        members: members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          createdAt: m.createdAt,
          user: m.user,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Support both /orgs/members (using X-Organization-Id header)
   * and /orgs/:organizationId/members (using param)
   */
  router.get('/members', requireAuth, resolveOrg, listMembersHandler);
  router.get('/:organizationId/members', requireAuth, resolveOrg, listMembersHandler);

  /**
   * Helper to handle listing monitors for an organization.
   */
  async function listMonitorsHandler(req, res, next) {
    try {
      const { organizationId } = req;
      const monitors = await db.monitor.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        monitors,
      });
    } catch (err) {
      next(err);
    }
  }

  router.get('/monitors', requireAuth, resolveOrg, listMonitorsHandler);
  router.get('/:organizationId/monitors', requireAuth, resolveOrg, listMonitorsHandler);

  /**
   * Helper to handle creating a monitor.
   */
  async function createMonitorHandler(req, res, next) {
    try {
      const data = createMonitorSchema.parse(req.body);
      const { organizationId } = req;

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
        },
      });

      res.status(201).json({
        success: true,
        monitor,
      });
    } catch (err) {
      next(err);
    }
  }

  router.post(
    '/monitors',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN', 'ENGINEER'),
    createMonitorHandler
  );
  router.post(
    '/:organizationId/monitors',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN', 'ENGINEER'),
    createMonitorHandler
  );

  /**
   * Helper to handle sending invites.
   */
  async function inviteMemberHandler(req, res, next) {
    try {
      const data = inviteMemberSchema.parse(req.body);
      const { organizationId } = req;

      const existingMembership = await db.membership.findFirst({
        where: {
          organizationId,
          user: {
            email: data.email,
          },
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
          token,
          expiresAt,
          invitedById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
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
    requireRole('OWNER', 'ADMIN'),
    inviteMemberHandler
  );
  router.post(
    '/:organizationId/invites',
    requireAuth,
    resolveOrg,
    requireRole('OWNER', 'ADMIN'),
    inviteMemberHandler
  );

  return router;
}

export function createInviteAcceptRouter({ db = prisma } = {}) {
  const router = Router();

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
          },
          create: {
            organizationId: invitation.organizationId,
            userId: req.user.id,
            role: invitation.role,
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
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const orgRouter = createOrgRouter();
export const inviteAcceptRouter = createInviteAcceptRouter();
