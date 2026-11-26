import { Router } from 'express';
import { checkDatabaseHealth, prisma } from '@apiwatch/db';
import { checkRedisHealth, getRedisClient } from '../config/redis.js';

export function createHealthRouter({ db = prisma, redis = getRedisClient() } = {}) {
  const router = Router();

  /**
   * GET /health - Liveness probe
   */
  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'apiwatch-api',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /ready - Readiness probe (verifies Postgres and Redis)
   */
  router.get('/ready', async (_req, res) => {
    const [dbResult, redisResult] = await Promise.all([
      checkDatabaseHealth(db),
      checkRedisHealth(redis),
    ]);

    const isAllReady = dbResult.isHealthy && redisResult.isHealthy;
    const statusCode = isAllReady ? 200 : 503;

    res.status(statusCode).json({
      status: isAllReady ? 'ready' : 'unhealthy',
      checks: {
        database: {
          status: dbResult.isHealthy ? 'healthy' : 'unhealthy',
          latencyMs: dbResult.latencyMs,
          ...(dbResult.error ? { error: dbResult.error } : {}),
        },
        redis: {
          status: redisResult.isHealthy ? 'healthy' : 'unhealthy',
          latencyMs: redisResult.latencyMs,
          ...(redisResult.error ? { error: redisResult.error } : {}),
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

export const healthRouter = createHealthRouter();
