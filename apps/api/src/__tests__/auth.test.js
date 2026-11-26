import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockPrisma } from './mock-db.js';
import { LoginRateLimiter } from '../middleware/rate-limiter.js';
import { generateTotpCode } from '../utils/totp.js';

describe('Authentication & Token Flow (apps/api)', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createMockPrisma();
    app = createApp({ db });
  });

  describe('POST /api/v1/auth/register', () => {
    it('successfully registers a user, creates default organization with OWNER role, and sets httpOnly cookies', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice Developer',
        organizationName: 'Acme Corp',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.name).toBe('Alice Developer');
      expect(res.body.organization.name).toBe('Acme Corp');
      expect(res.body.organization.role).toBe('OWNER');
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.csrfToken).toBe('string');

      // Verify cookies
      const cookies = res.headers['set-cookie'] || [];
      const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));
      const csrfCookie = cookies.find((c) => c.startsWith('csrf_token='));

      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(csrfCookie).toBeDefined();

      // Verify audit log
      const audit = await db.auditLog.findMany({ where: { action: 'AUTH_REGISTER' } });
      expect(audit.length).toBeGreaterThan(0);
    });

    it('rejects registration when email already exists with 409 Conflict', async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
      });

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already exists');
    });

    it('rejects registration with short password (< 8 chars) with 400 Validation Error', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'weak@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
      expect(res.body.stack).toBeUndefined(); // Guarantees no stack trace leak
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'bob@example.com',
        password: 'SecurePassword123!',
        name: 'Bob',
      });
    });

    it('successfully logs in with valid credentials and sets rotating refresh cookie', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'SecurePassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('bob@example.com');
      expect(typeof res.body.accessToken).toBe('string');
      expect(Array.isArray(res.body.organizations)).toBe(true);
      expect(res.body.organizations[0].role).toBe('OWNER');

      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((c) => c.startsWith('refresh_token=') && c.includes('HttpOnly'))).toBe(
        true
      );
    });

    it('fails login with invalid password with 401 Unauthorized', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid email or password');
    });
  });

  describe('Login Rate Limiting', () => {
    it('blocks excessive failed login attempts with 429 Too Many Requests', async () => {
      const testLimiter = new LoginRateLimiter({ maxAttempts: 3, windowMs: 60000 });

      for (let i = 0; i < 3; i++) {
        testLimiter.recordAttempt('127.0.0.1:target@example.com');
      }

      expect(testLimiter.isRateLimited('127.0.0.1:target@example.com')).toBe(true);
    });
  });

  describe('Rotating Refresh Token & CSRF Flow', () => {
    it('refuses token refresh when refresh cookie is missing', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Refresh token cookie is missing');
    });

    it('enforces CSRF protection on refresh: blocks request if X-CSRF-Token header does not match cookie', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'charlie@example.com',
        password: 'Password123!',
      });

      const cookies = regRes.headers['set-cookie'];

      const resWithoutCsrf = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);

      expect(resWithoutCsrf.status).toBe(403);
      expect(resWithoutCsrf.body.error).toContain('CSRF');

      const resWithWrongCsrf = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', 'invalid-token-here');

      expect(resWithWrongCsrf.status).toBe(403);
    });

    it('successfully rotates refresh token and returns new access token with matching CSRF', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'dave@example.com',
        password: 'Password123!',
      });

      const cookies = regRes.headers['set-cookie'];
      const csrfToken = regRes.body.csrfToken;

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(typeof refreshRes.body.accessToken).toBe('string');
      expect(refreshRes.body.accessToken).not.toBe(regRes.body.accessToken);

      const newCookies = refreshRes.headers['set-cookie'];
      expect(newCookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    });

    it('detects replay attack: presenting an old/revoked token terminates entire token family', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'eve@example.com',
        password: 'Password123!',
      });

      const originalCookies = regRes.headers['set-cookie'];
      const csrfToken = regRes.body.csrfToken;

      const rotateRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookies)
        .set('X-CSRF-Token', csrfToken);
      expect(rotateRes.status).toBe(200);

      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookies)
        .set('X-CSRF-Token', csrfToken);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error).toContain('Replay attack detected');

      const nextCookies = rotateRes.headers['set-cookie'];
      const nextCsrfToken = rotateRes.body.csrfToken;
      const subsequentRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', nextCookies)
        .set('X-CSRF-Token', nextCsrfToken);

      expect(subsequentRes.status).toBe(401);
    });
  });

  describe('Email Verification Flow', () => {
    it('requests email verification and confirms verification token', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'verify-me@example.com',
        password: 'Password123!',
      });

      // Request verification token
      const reqRes = await request(app)
        .post('/api/v1/auth/verify-email/request')
        .send({ email: 'verify-me@example.com' });

      expect(reqRes.status).toBe(200);
      expect(reqRes.body.success).toBe(true);
      const token = reqRes.body.token;
      expect(token).toBeDefined();

      // Confirm verification
      const confirmRes = await request(app)
        .post('/api/v1/auth/verify-email/confirm')
        .send({ token });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.success).toBe(true);

      const user = await db.user.findUnique({ where: { id: regRes.body.user.id } });
      expect(user.emailVerified).toBe(true);
    });
  });

  describe('Password Reset Flow', () => {
    it('requests password reset, completes reset with new argon2id password, and invalidates old tokens', async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'reset-pwd@example.com',
        password: 'OldPassword123!',
      });

      // Request reset
      const reqRes = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'reset-pwd@example.com' });

      expect(reqRes.status).toBe(200);
      const resetToken = reqRes.body.token;
      expect(resetToken).toBeDefined();

      // Confirm reset with new password
      const confirmRes = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: resetToken, newPassword: 'NewPassword999!' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.success).toBe(true);

      // Verify old password no longer works
      const oldLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'reset-pwd@example.com',
        password: 'OldPassword123!',
      });
      expect(oldLogin.status).toBe(401);

      // Verify new password works
      const newLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'reset-pwd@example.com',
        password: 'NewPassword999!',
      });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.success).toBe(true);
    });
  });

  describe('Optional TOTP 2FA Flow', () => {
    it('executes full 2FA lifecycle: setup, enable, challenge on login, and code verification', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'totp-user@example.com',
        password: 'Password123!',
      });
      const token = regRes.body.accessToken;

      // 1. Setup 2FA
      const setupRes = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${token}`);

      expect(setupRes.status).toBe(200);
      expect(setupRes.body.secret).toBeDefined();
      expect(setupRes.body.uri).toContain('otpauth://totp/');
      const secret = setupRes.body.secret;

      // 2. Enable 2FA with generated code
      const validCode = generateTotpCode(secret);
      const enableRes = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode });

      expect(enableRes.status).toBe(200);
      expect(enableRes.body.success).toBe(true);

      // 3. Login now returns 2FA challenge instead of tokens!
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'totp-user@example.com',
        password: 'Password123!',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.require2Fa).toBe(true);
      expect(loginRes.body.challengeToken).toBeDefined();
      const challengeToken = loginRes.body.challengeToken;

      // 4. Verify 2FA code with challenge token
      const currentCode = generateTotpCode(secret);
      const verifyRes = await request(app).post('/api/v1/auth/2fa/verify').send({
        challengeToken,
        code: currentCode,
      });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(typeof verifyRes.body.accessToken).toBe('string');
      expect(verifyRes.body.user.email).toBe('totp-user@example.com');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes refresh token and clears cookie upon logout', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'frank@example.com',
        password: 'Password123!',
      });

      const cookies = regRes.headers['set-cookie'];
      const csrfToken = regRes.body.csrfToken;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      const clearCookies = logoutRes.headers['set-cookie'];
      expect(clearCookies.some((c) => c.startsWith('refresh_token=;'))).toBe(true);
    });
  });
});
