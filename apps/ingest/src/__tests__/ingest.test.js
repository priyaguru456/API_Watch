import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createIngestApp } from '../app.js';

describe('High-Throughput Ingest Service (@apiwatch/ingest)', () => {
  it('serves health probe', async () => {
    const app = createIngestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ingest');
  });

  it('validates batch check results and rejects unauthenticated/unscoped payload', async () => {
    const app = createIngestApp();
    const res = await request(app)
      .post('/api/v1/ingest/results')
      .send([
        {
          monitorId: '11111111-1111-1111-1111-111111111111',
          statusCode: 200,
          responseTimeMs: 45,
          isSuccess: true,
        },
      ]);

    // Missing X-Organization-Id
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing X-Organization-Id');
  });

  it('accepts valid check results batch with tenant scope', async () => {
    const mockDb = {
      checkResult: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const app = createIngestApp({ db: mockDb });
    const res = await request(app)
      .post('/api/v1/ingest/results')
      .set('X-Organization-Id', '22222222-2222-2222-2222-222222222222')
      .send([
        {
          monitorId: '11111111-1111-1111-1111-111111111111',
          statusCode: 200,
          responseTimeMs: 38,
          isSuccess: true,
        },
      ]);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.acceptedCount).toBe(1);
    expect(mockDb.checkResult.createMany).toHaveBeenCalled();
  });
});
