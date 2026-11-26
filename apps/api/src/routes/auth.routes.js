import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma } from '@apiwatch/db';
import { registerSchema, loginSchema, ConflictError, UnauthorizedError } from '@apiwatch/shared';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  generateCsrfToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  setCsrfCookie,
  REFRESH_TOKEN_TTL_MS,
} from '../utils/tokens.js';
import { loginRateLimiter } from '../middleware/rate-limiter.js';
import { csrfProtection } from '../middleware/csrf.js';

export function createAuthRouter({ db = prisma } = {}) {
  const router = Router();

  /**
   * Helper to derive an organization slug from name.
   */
  function slugify(text) {
    const base = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }

  /**
   * POST /register
   * Registers user, creates initial organization, sets user as OWNER,
   * issues access token and sets rotating refresh token in httpOnly secure cookie.
   */
  router.post('/register', async (req, res, next) => {
    try {
      const data = registerSchema.parse(req.body);

      // Check existing email
      const existingUser = await db.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        throw new ConflictError('A user with this email address already exists');
      }

      // Hash password using Argon2
      const passwordHash = await hashPassword(data.password);

      const orgName = data.organizationName || `${data.name || 'Personal'}'s Org`;
      const orgSlug = slugify(orgName);

      // Execute atomic tenant onboarding transaction
      const result = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: data.email,
            passwordHash,
            name: data.name || null,
          },
        });

        const org = await tx.organization.create({
          data: {
            name: orgName,
            slug: orgSlug,
          },
        });

        const membership = await tx.membership.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: 'OWNER',
          },
        });

        return { user, org, membership };
      });

      // Issue access token & rotating refresh token
      const accessToken = generateAccessToken(result.user);
      const rawRefreshToken = generateRefreshToken();
      const tokenHash = hashToken(rawRefreshToken);
      const family = crypto.randomUUID();
      const csrfToken = generateCsrfToken();

      await db.refreshToken.create({
        data: {
          userId: result.user.id,
          tokenHash,
          family,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      setRefreshTokenCookie(res, rawRefreshToken);
      setCsrfCookie(res, csrfToken);

      res.status(201).json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        organization: {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
          role: result.membership.role,
        },
        accessToken,
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /login
   * Validates credentials against argon2 hash, subject to rate limiting,
   * sets rotating refresh token in httpOnly cookie and returns short-lived access JWT.
   */
  router.post('/login', loginRateLimiter.middleware(), async (req, res, next) => {
    try {
      const data = loginSchema.parse(req.body);

      const user = await db.user.findUnique({
        where: { email: data.email },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        req.recordLoginFailure?.();
        throw new UnauthorizedError('Invalid email or password');
      }

      const isValidPassword = await verifyPassword(user.passwordHash, data.password);
      if (!isValidPassword) {
        req.recordLoginFailure?.();
        throw new UnauthorizedError('Invalid email or password');
      }

      req.recordLoginSuccess?.();

      // Issue tokens
      const accessToken = generateAccessToken(user);
      const rawRefreshToken = generateRefreshToken();
      const tokenHash = hashToken(rawRefreshToken);
      const family = crypto.randomUUID();
      const csrfToken = generateCsrfToken();

      await db.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          family,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      setRefreshTokenCookie(res, rawRefreshToken);
      setCsrfCookie(res, csrfToken);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        organizations: user.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role,
        })),
        accessToken,
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /refresh
   * Reads rotating refresh token from httpOnly cookie, verifies token family,
   * enforces CSRF protection, invalidates old token, issues new refresh token + access JWT.
   */
  router.post('/refresh', csrfProtection, async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.refresh_token;
      if (!rawRefreshToken) {
        throw new UnauthorizedError('Refresh token cookie is missing');
      }

      const tokenHash = hashToken(rawRefreshToken);
      const tokenRecord = await db.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!tokenRecord) {
        clearRefreshTokenCookie(res);
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Replay Detection: If an already revoked token is used, invalidate the whole family!
      if (tokenRecord.isRevoked) {
        await db.refreshToken.updateMany({
          where: { family: tokenRecord.family },
          data: { isRevoked: true },
        });
        clearRefreshTokenCookie(res);
        throw new UnauthorizedError(
          'Replay attack detected: Revoked token presented. All sessions in this token family have been terminated.'
        );
      }

      // Check token expiration
      if (new Date() > new Date(tokenRecord.expiresAt)) {
        await db.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { isRevoked: true },
        });
        clearRefreshTokenCookie(res);
        throw new UnauthorizedError('Refresh token has expired');
      }

      // Rotate token: revoke current token and create new one in same family
      const nextRawToken = generateRefreshToken();
      const nextTokenHash = hashToken(nextRawToken);
      const nextCsrfToken = generateCsrfToken();

      await db.$transaction([
        db.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { isRevoked: true },
        }),
        db.refreshToken.create({
          data: {
            userId: tokenRecord.userId,
            tokenHash: nextTokenHash,
            family: tokenRecord.family,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          },
        }),
      ]);

      const newAccessToken = generateAccessToken(tokenRecord.user);

      setRefreshTokenCookie(res, nextRawToken);
      setCsrfCookie(res, nextCsrfToken);

      res.status(200).json({
        success: true,
        accessToken: newAccessToken,
        csrfToken: nextCsrfToken,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /logout
   * Revokes the refresh token and clears the httpOnly cookie.
   */
  router.post('/logout', csrfProtection, async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.refresh_token;
      if (rawRefreshToken) {
        const tokenHash = hashToken(rawRefreshToken);
        await db.refreshToken
          .update({
            where: { tokenHash },
            data: { isRevoked: true },
          })
          .catch(() => {}); // silent if already revoked or not found
      }

      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const authRouter = createAuthRouter();
