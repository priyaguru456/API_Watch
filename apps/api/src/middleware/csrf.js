import { CSRF_COOKIE_NAME } from '../utils/tokens.js';

/**
 * CSRF Protection Middleware for Cookie Flows (refresh, logout, cookie-based mutations).
 * Enforces double-submit cookie validation or anti-CSRF custom request header.
 */
export function csrfProtection(req, res, next) {
  // Safe HTTP read methods are exempt
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Only validate CSRF if cookies are present (specifically refresh token cookie flow)
  const refreshTokenCookie = req.cookies?.refresh_token;
  if (!refreshTokenCookie) {
    // If not using cookie-based auth, standard Bearer token authorization protects against CSRF
    return next();
  }

  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
  const csrfHeader =
    req.headers['x-csrf-token'] || req.headers['csrf-token'] || req.headers['x-xsrf-token'];

  // Check double-submit cookie match
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing CSRF token',
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }

  next();
}
