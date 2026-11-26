/**
 * In-memory sliding window rate limiter for login attempts.
 * Supports configurable window and max attempts, with automatic cleanup.
 */
class LoginRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.maxAttempts = options.maxAttempts || 5;
    this.hits = new Map(); // key -> [timestamp, timestamp, ...]
  }

  getKey(req) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown-ip';
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : '';
    return `${ip}:${email}`;
  }

  isRateLimited(key) {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];

    // Filter timestamps within window
    const validTimestamps = timestamps.filter((time) => now - time < this.windowMs);
    this.hits.set(key, validTimestamps);

    return validTimestamps.length >= this.maxAttempts;
  }

  recordAttempt(key) {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];
    timestamps.push(now);
    this.hits.set(key, timestamps);
  }

  resetKey(key) {
    this.hits.delete(key);
  }

  clear() {
    this.hits.clear();
  }

  middleware() {
    return (req, res, next) => {
      const key = this.getKey(req);
      if (this.isRateLimited(key)) {
        return res.status(429).json({
          success: false,
          error: 'Too many login attempts. Please try again after 15 minutes.',
          requestId: req.id,
          timestamp: new Date().toISOString(),
        });
      }
      // Attach recorder to request so login handler can record failure or clear on success
      req.recordLoginFailure = () => this.recordAttempt(key);
      req.recordLoginSuccess = () => this.resetKey(key);
      next();
    };
  }
}

export const loginRateLimiter = new LoginRateLimiter();
export { LoginRateLimiter };
