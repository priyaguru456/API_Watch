import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '@apiwatch/shared';

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived JWT access token
export const REFRESH_COOKIE_NAME = 'refresh_token';
export const CSRF_COOKIE_NAME = 'csrf_token';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Signs a short-lived access JWT with a unique jti identifier.
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      jti: crypto.randomUUID(), // Guarantees uniqueness across every issuance
    },
    env.JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    }
  );
}

/**
 * Verifies and decodes an access JWT.
 * @param {string} token
 * @returns {{ sub: string, email: string, jti: string }}
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

/**
 * Generates a short-lived 2FA challenge JWT (5 minutes).
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
export function generateChallengeToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: '2fa_challenge',
      jti: crypto.randomUUID(),
    },
    env.JWT_SECRET,
    {
      expiresIn: '5m',
    }
  );
}

/**
 * Verifies a 2FA challenge token.
 * @param {string} token
 * @returns {{ sub: string, email: string, type: string }}
 */
export function verifyChallengeToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (payload.type !== '2fa_challenge') {
    throw new Error('Invalid token purpose: Expected 2fa_challenge');
  }
  return payload;
}

/**
 * Generates a cryptographically strong refresh token string.
 * @returns {string}
 */
export function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a token with SHA-256 for safe storage at rest.
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a CSRF token.
 * @returns {string}
 */
export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Attaches the rotating refresh token in an httpOnly secure cookie.
 * @param {import('express').Response} res
 * @param {string} refreshToken
 */
export function setRefreshTokenCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/**
 * Clears the refresh token cookie upon logout or token revocation.
 * @param {import('express').Response} res
 */
export function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Sets the CSRF cookie readable by the frontend application.
 * @param {import('express').Response} res
 * @param {string} csrfToken
 */
export function setCsrfCookie(res, csrfToken) {
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}
