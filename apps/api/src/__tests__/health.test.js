import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Health and Readiness Endpoints (apps/api)', () => {
  const mockHealthyDb = {
    $queryRaw: async () => [{ healthy: 1 }],
  };

  const mockHealthyRedis = {
    status: 'ready',
    ping: async () => 'PONG',
  };

  const mockFailingDb = {
    $queryRaw: async () => {
      throw new Error('Connection refused to postgres:5432');
    },
  };

  const mockFailingRedis = {
    status: 'ready',
    ping: async () => {
      throw new Error('Redis connection timeout');
    },
  };

  describe('GET /health (Liveness)', () => {
    const app = createApp({ db: mockHealthyDb, redis: mockHealthyRedis });

    it('returns 200 OK with service details at /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('apiwatch-api');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.headers).toHaveProperty('x-request-id');
    });

    it('returns 200 OK at /api/v1/health prefix', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('GET /ready (Readiness)', () => {
    it('returns 200 OK when both PostgreSQL and Redis are healthy', async () => {
      const app = createApp({ db: mockHealthyDb, redis: mockHealthyRedis });
      const res = await request(app).get('/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.database.status).toBe('healthy');
      expect(res.body.checks.redis.status).toBe('healthy');
      expect(typeof res.body.checks.database.latencyMs).toBe('number');
      expect(typeof res.body.checks.redis.latencyMs).toBe('number');
      expect(res.headers).toHaveProperty('x-request-id');
    });

    it('returns 503 Service Unavailable when PostgreSQL is failing', async () => {
      const app = createApp({ db: mockFailingDb, redis: mockHealthyRedis });
      const res = await request(app).get('/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.database.status).toBe('unhealthy');
      expect(res.body.checks.database.error).toContain('Connection refused to postgres:5432');
      expect(res.body.checks.redis.status).toBe('healthy');
    });

    it('returns 503 Service Unavailable when Redis is failing', async () => {
      const app = createApp({ db: mockHealthyDb, redis: mockFailingRedis });
      const res = await request(app).get('/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.database.status).toBe('healthy');
      expect(res.body.checks.redis.status).toBe('unhealthy');
      expect(res.body.checks.redis.error).toContain('Redis connection timeout');
    });

    it('returns 503 Service Unavailable when both PostgreSQL and Redis fail', async () => {
      const app = createApp({ db: mockFailingDb, redis: mockFailingRedis });
      const res = await request(app).get('/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.database.status).toBe('unhealthy');
      expect(res.body.checks.redis.status).toBe('unhealthy');
    });
  });
});
