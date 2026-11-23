/**
 * Rate Limiting Middleware
 * Protects endpoints from abuse using an in-memory window counter.
 */
const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

export const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const record = requestCounts.get(ip) || { count: 0, resetTime: now + WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + WINDOW_MS;
  } else {
    record.count += 1;
  }

  requestCounts.set(ip, record);

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - record.count));

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
  }

  next();
};
