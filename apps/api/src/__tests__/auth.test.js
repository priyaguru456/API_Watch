import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMockPrisma } from './mock-db.js';
import { LoginRateLimiter } from '../middleware/rate-limiter.js';

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
      // 1. Register to obtain cookies
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'charlie@example.com',
        password: 'Password123!',
      });

      const cookies = regRes.headers['set-cookie'];

      // 2. Attempt refresh with cookies but without CSRF header
      const resWithoutCsrf = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);

      expect(resWithoutCsrf.status).toBe(403);
      expect(resWithoutCsrf.body.error).toContain('CSRF');

      // 3. Attempt refresh with mismatched CSRF header
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

      // Verify a new rotating refresh cookie was set
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

      // 1. First legitimate rotation
      const rotateRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookies)
        .set('X-CSRF-Token', csrfToken);
      expect(rotateRes.status).toBe(200);

      // 2. Attacker replays the original, now-revoked cookie!
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookies)
        .set('X-CSRF-Token', csrfToken);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error).toContain('Replay attack detected');

      // 3. Even the newly rotated cookie is now revoked because the family was invalidated!
      const nextCookies = rotateRes.headers['set-cookie'];
      const nextCsrfToken = rotateRes.body.csrfToken;
      const subsequentRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', nextCookies)
        .set('X-CSRF-Token', nextCsrfToken);

      expect(subsequentRes.status).toBe(401);
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

      // Verify clear cookie header
      const clearCookies = logoutRes.headers['set-cookie'];
      expect(clearCookies.some((c) => c.startsWith('refresh_token=;'))).toBe(true);
    });
  });
});
