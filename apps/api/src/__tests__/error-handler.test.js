import express from 'express';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../app.js';
import { errorHandler } from '../middleware/error-handler.js';
import { requestIdMiddleware } from '../middleware/request-id.js';

describe('Central Error Handler and Request ID (apps/api)', () => {
  const dummyDb = { $queryRaw: async () => [{ healthy: 1 }] };
  const dummyRedis = { status: 'ready', ping: async () => 'PONG' };

  it('generates a unique x-request-id if not provided by client', async () => {
    const app = createApp({ db: dummyDb, redis: dummyRedis });
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('preserves client-provided X-Request-Id header in responses and error payloads', async () => {
    const app = createApp({ db: dummyDb, redis: dummyRedis });
    const customTraceId = 'client-custom-uuid-12345';

    const res = await request(app).get('/non-existent-endpoint').set('x-request-id', customTraceId);

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe(customTraceId);
    expect(res.body.requestId).toBe(customTraceId);
    expect(res.body.success).toBe(false);
    // CRITICAL RULE: Never leak stack traces to client
    expect(res.body.stack).toBeUndefined();
  });

  it('handles 400 Zod validation errors cleanly without stack traces', async () => {
    // Dedicated test express app configured with test route followed by error handler
    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.use(express.json());

    const testSchema = z.object({
      organizationId: z.string().uuid(),
      url: z.string().url(),
    });

    testApp.post('/test-validation', (req, res, next) => {
      try {
        testSchema.parse(req.body);
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    testApp.use(errorHandler);

    const res = await request(testApp).post('/test-validation').send({
      organizationId: 'invalid-not-uuid',
      url: 'not-a-valid-url',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation Error');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBe(2);
    // Never leak stack traces
    expect(res.body.stack).toBeUndefined();
  });

  it('handles unhandled 500 errors without leaking stack traces', async () => {
    const testApp = express();
    testApp.use(requestIdMiddleware);

    testApp.get('/test-500', (_req, _res, next) => {
      next(new Error('Fatal unhandled database crash'));
    });

    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-500');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Internal Server Error');
    expect(res.body.requestId).toBeDefined();
    // Never leak stack traces
    expect(res.body.stack).toBeUndefined();
  });
});
