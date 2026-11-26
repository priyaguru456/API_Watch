import { Redis } from 'ioredis';
import { env } from '@apiwatch/shared';
import { logger } from './logger.js';

let redisClient = null;

/**
 * Returns the singleton Redis client instance.
 * @returns {Redis}
 */
export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis client connection error');
    });
  }

  return redisClient;
}

/**
 * Probes Redis ping command to verify readiness.
 * @param {Redis} [client]
 * @returns {Promise<{ isHealthy: boolean, latencyMs: number, error?: string }>}
 */
export async function checkRedisHealth(client = getRedisClient()) {
  const start = performance.now();
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    const latencyMs = Math.round(performance.now() - start);
    return {
      isHealthy: pong === 'PONG',
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      isHealthy: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
