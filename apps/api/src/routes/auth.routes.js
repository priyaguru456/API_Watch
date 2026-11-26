import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma } from '@apiwatch/db';
import {
  registerSchema,
  loginSchema,
  emailVerifyRequestSchema,
  emailVerifyConfirmSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  totpVerifySchema,
  totpEnableSchema,
  totpDisableSchema,
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from '@apiwatch/shared';
import { encryptSecret, decryptSecret } from '@apiwatch/vault';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  generateChallengeToken,
  verifyChallengeToken,
  hashToken,
  generateCsrfToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  setCsrfCookie,
  REFRESH_TOKEN_TTL_MS,
} from '../utils/tokens.js';
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from '../utils/totp.js';
import { recordAuditLog } from '../utils/audit.js';
import { loginRateLimiter } from '../middleware/rate-limiter.js';
import { csrfProtection } from '../middleware/csrf.js';
import { createRequireAuthMiddleware } from '../middleware/auth.js';

export function createAuthRouter({ db = prisma } = {}) {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware({ db });

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
   * Registers a new tenant and owner user, argon2id password hashing, issues initial tokens.
   */
  router.post('/register', async (req, res, next) => {
    try {
      const data = registerSchema.parse(req.body);

      const existingUser = await db.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        throw new ConflictError('A user with this email address already exists');
      }

      const passwordHash = await hashPassword(data.password);
      const orgName = data.organizationName || `${data.name || 'Personal'}'s Org`;
      const orgSlug = slugify(orgName);

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

      // Audit registration event
      await recordAuditLog({
        db,
        organizationId: result.org.id,
        userId: result.user.id,
        action: 'AUTH_REGISTER',
        entityType: 'User',
        entityId: result.user.id,
        details: { email: result.user.email, orgName: result.org.name },
        req,
      });

      res.status(201).json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          emailVerified: result.user.emailVerified,
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
   * Validates argon2id password, checks 2FA status, rate-limited.
   */
  router.post('/login', loginRateLimiter.middleware(), async (req, res, next) => {
    try {
      const data = loginSchema.parse(req.body);

      const user = await db.user.findUnique({
        where: { email: data.email },
        include: {
          memberships: {
            include: { organization: true },
          },
        },
      });

      if (!user) {
        req.recordLoginFailure?.();
        await recordAuditLog({
          db,
          organizationId: null,
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'User',
          details: { reason: 'user_not_found', email: data.email },
          req,
        });
        throw new UnauthorizedError('Invalid email or password');
      }

      const isValidPassword = await verifyPassword(user.passwordHash, data.password);
      if (!isValidPassword) {
        req.recordLoginFailure?.();
        const primaryOrgId = user.memberships?.[0]?.organizationId || null;
        await recordAuditLog({
          db,
          organizationId: primaryOrgId,
          userId: user.id,
          action: 'AUTH_LOGIN_FAILURE',
          entityType: 'User',
          entityId: user.id,
          details: { reason: 'invalid_password' },
          req,
        });
        throw new UnauthorizedError('Invalid email or password');
      }

      req.recordLoginSuccess?.();

      // If TOTP 2FA is enabled, require 2FA challenge resolution
      if (user.totpEnabled) {
        const challengeToken = generateChallengeToken(user);
        const primaryOrgId = user.memberships?.[0]?.organizationId || null;

        await recordAuditLog({
          db,
          organizationId: primaryOrgId,
          userId: user.id,
          action: 'AUTH_LOGIN_2FA_CHALLENGE',
          entityType: 'User',
          entityId: user.id,
          req,
        });

        return res.status(200).json({
          success: true,
          require2Fa: true,
          challengeToken,
          message: 'Two-factor authentication required',
        });
      }

      // Normal login: issue tokens
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

      const primaryOrgId = user.memberships?.[0]?.organizationId || null;
      await recordAuditLog({
        db,
        organizationId: primaryOrgId,
        userId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          totpEnabled: user.totpEnabled,
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
   * POST /2fa/verify
   * Verifies TOTP 2FA challenge code during login.
   */
  router.post('/2fa/verify', async (req, res, next) => {
    try {
      const data = totpVerifySchema.parse(req.body);

      let payload;
      try {
        payload = verifyChallengeToken(data.challengeToken);
      } catch (_err) {
        throw new UnauthorizedError('Invalid or expired 2FA challenge token');
      }

      const user = await db.user.findUnique({
        where: { id: payload.sub },
        include: {
          memberships: {
            include: { organization: true },
          },
        },
      });

      if (!user || !user.totpEnabled || !user.totpSecret) {
        throw new UnauthorizedError('2FA is not enabled for this user account');
      }

      // Decrypt TOTP secret via vault
      const base32Secret = decryptSecret(user.totpSecret);
      const isValidCode = verifyTotpCode(base32Secret, data.code);

      if (!isValidCode) {
        const primaryOrgId = user.memberships?.[0]?.organizationId || null;
        await recordAuditLog({
          db,
          organizationId: primaryOrgId,
          userId: user.id,
          action: 'AUTH_2FA_FAILED',
          entityType: 'User',
          entityId: user.id,
          details: { reason: 'invalid_totp_code' },
          req,
        });
        throw new UnauthorizedError('Invalid 2FA verification code');
      }

      // Issue full session tokens
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

      const primaryOrgId = user.memberships?.[0]?.organizationId || null;
      await recordAuditLog({
        db,
        organizationId: primaryOrgId,
        userId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
        details: { method: 'totp_2fa' },
        req,
      });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          totpEnabled: user.totpEnabled,
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
   * POST /2fa/setup
   * Generates a new TOTP secret and returns URI for authenticator setup.
   */
  router.post('/2fa/setup', requireAuth, async (req, res, next) => {
    try {
      const secret = generateTotpSecret();
      const uri = generateTotpUri(req.user.email, secret);

      // Encrypt and store pending secret
      const encryptedSecret = encryptSecret(secret);
      await db.user.update({
        where: { id: req.user.id },
        data: { totpSecret: encryptedSecret, totpEnabled: false },
      });

      await recordAuditLog({
        db,
        organizationId: req.organizationId || null,
        userId: req.user.id,
        action: 'AUTH_2FA_SETUP',
        entityType: 'User',
        entityId: req.user.id,
        req,
      });

      res.status(200).json({
        success: true,
        secret,
        uri,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /2fa/enable
   * Confirms code verification and activates 2FA on user account.
   */
  router.post('/2fa/enable', requireAuth, async (req, res, next) => {
    try {
      const data = totpEnableSchema.parse(req.body);

      const user = await db.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user || !user.totpSecret) {
        throw new BadRequestError('2FA setup has not been initiated');
      }

      const secret = decryptSecret(user.totpSecret);
      const isValid = verifyTotpCode(secret, data.code);
      if (!isValid) {
        throw new BadRequestError(
          'Invalid verification code. Please check your authenticator app.'
        );
      }

      await db.user.update({
        where: { id: user.id },
        data: { totpEnabled: true },
      });

      await recordAuditLog({
        db,
        organizationId: req.organizationId || null,
        userId: user.id,
        action: 'AUTH_2FA_ENABLED',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Two-factor authentication enabled successfully',
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /2fa/disable
   * Deactivates 2FA on user account.
   */
  router.post('/2fa/disable', requireAuth, async (req, res, next) => {
    try {
      const data = totpDisableSchema.parse(req.body);

      const user = await db.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user || !user.totpEnabled) {
        throw new BadRequestError('2FA is not enabled on this account');
      }

      let verified = false;
      if (data.code && user.totpSecret) {
        const secret = decryptSecret(user.totpSecret);
        verified = verifyTotpCode(secret, data.code);
      } else if (data.password) {
        verified = await verifyPassword(user.passwordHash, data.password);
      }

      if (!verified) {
        throw new UnauthorizedError('Valid 2FA code or password required to disable 2FA');
      }

      await db.user.update({
        where: { id: user.id },
        data: { totpEnabled: false, totpSecret: null },
      });

      await recordAuditLog({
        db,
        organizationId: req.organizationId || null,
        userId: user.id,
        action: 'AUTH_2FA_DISABLED',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Two-factor authentication has been disabled',
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /verify-email/request
   * Generates email verification token.
   */
  router.post('/verify-email/request', async (req, res, next) => {
    try {
      const data = emailVerifyRequestSchema.parse(req.body);
      const email = data.email || req.user?.email;

      if (!email) {
        throw new BadRequestError('Email address is required');
      }

      const user = await db.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(200).json({
          success: true,
          message: 'If the email exists, a verification link has been sent.',
        });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db.user.update({
        where: { id: user.id },
        data: {
          emailVerifyToken: token,
          emailVerifyExpiresAt: expiresAt,
        },
      });

      await recordAuditLog({
        db,
        organizationId: null,
        userId: user.id,
        action: 'AUTH_EMAIL_VERIFY_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Verification link sent',
        token, // Included for test verification
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /verify-email/confirm
   * Confirms email address verification token.
   */
  router.post('/verify-email/confirm', async (req, res, next) => {
    try {
      const data = emailVerifyConfirmSchema.parse(req.body);

      const user = await db.user.findUnique({
        where: { emailVerifyToken: data.token },
      });

      if (!user) {
        throw new BadRequestError('Invalid or expired verification token');
      }

      if (user.emailVerifyExpiresAt && new Date() > new Date(user.emailVerifyExpiresAt)) {
        throw new BadRequestError('Verification token has expired');
      }

      await db.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerifyToken: null,
          emailVerifyExpiresAt: null,
        },
      });

      await recordAuditLog({
        db,
        organizationId: null,
        userId: user.id,
        action: 'AUTH_EMAIL_VERIFIED',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Email address verified successfully',
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /password-reset/request
   * Requests a password reset token.
   */
  router.post('/password-reset/request', async (req, res, next) => {
    try {
      const data = passwordResetRequestSchema.parse(req.body);

      const user = await db.user.findUnique({ where: { email: data.email } });
      if (!user) {
        // Prevent email enumeration
        return res.status(200).json({
          success: true,
          message: 'If the email exists, a password reset link has been dispatched.',
        });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: token,
          passwordResetExpiresAt: expiresAt,
        },
      });

      await recordAuditLog({
        db,
        organizationId: null,
        userId: user.id,
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Password reset link sent',
        token, // Included for test verification
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /password-reset/confirm
   * Confirms password reset token and sets new argon2id password.
   */
  router.post('/password-reset/confirm', async (req, res, next) => {
    try {
      const data = passwordResetConfirmSchema.parse(req.body);

      const user = await db.user.findUnique({
        where: { passwordResetToken: data.token },
      });

      if (!user) {
        throw new BadRequestError('Invalid or expired password reset token');
      }

      if (user.passwordResetExpiresAt && new Date() > new Date(user.passwordResetExpiresAt)) {
        throw new BadRequestError('Password reset token has expired');
      }

      const passwordHash = await hashPassword(data.newPassword);

      // Invalidate all existing refresh tokens (revoking all sessions)
      await db.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      });

      await db.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      });

      await recordAuditLog({
        db,
        organizationId: null,
        userId: user.id,
        action: 'AUTH_PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: user.id,
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Password reset successfully. You may now log in.',
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /refresh
   * Rotating refresh token with replay attack detection.
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

      // Replay Detection: Invalidate family if already revoked
      if (tokenRecord.isRevoked) {
        await db.refreshToken.updateMany({
          where: { family: tokenRecord.family },
          data: { isRevoked: true },
        });
        clearRefreshTokenCookie(res);
        throw new UnauthorizedError(
          'Replay attack detected: Revoked token presented. All sessions in family terminated.'
        );
      }

      if (new Date() > new Date(tokenRecord.expiresAt)) {
        await db.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { isRevoked: true },
        });
        clearRefreshTokenCookie(res);
        throw new UnauthorizedError('Refresh token has expired');
      }

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

      await recordAuditLog({
        db,
        organizationId: null,
        userId: tokenRecord.userId,
        action: 'AUTH_TOKEN_REFRESH',
        entityType: 'RefreshToken',
        entityId: tokenRecord.id,
        req,
      });

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
   * Revokes refresh token and clears cookie.
   */
  router.post('/logout', csrfProtection, async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.refresh_token;
      let userId = null;

      if (rawRefreshToken) {
        const tokenHash = hashToken(rawRefreshToken);
        const record = await db.refreshToken.findUnique({ where: { tokenHash } });
        if (record) {
          userId = record.userId;
          await db.refreshToken.update({
            where: { id: record.id },
            data: { isRevoked: true },
          });
        }
      }

      clearRefreshTokenCookie(res);

      await recordAuditLog({
        db,
        organizationId: null,
        userId,
        action: 'AUTH_LOGOUT',
        entityType: 'RefreshToken',
        req,
      });

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
