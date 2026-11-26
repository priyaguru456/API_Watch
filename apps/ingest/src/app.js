import express from 'express';
import { z } from 'zod';

const ingestCheckResultSchema = z.object({
  monitorId: z.string().uuid(),
  statusCode: z.number().int().min(100).max(599),
  responseTimeMs: z.number().int().min(0),
  isSuccess: z.boolean(),
  errorMessage: z.string().nullable().optional(),
  timing: z.record(z.any()).optional(),
  headers: z.record(z.any()).optional(),
  region: z.string().default('us-east-1'),
});

export function createIngestApp({ db } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'ingest' });
  });

  app.post('/api/v1/ingest/results', async (req, res, next) => {
    try {
      const orgId = req.headers['x-organization-id'];
      if (!orgId) {
        return res.status(400).json({ success: false, error: 'Missing X-Organization-Id header' });
      }

      const body = Array.isArray(req.body) ? req.body : [req.body];
      const parsedResults = body.map((item) => ingestCheckResultSchema.parse(item));

      if (db) {
        await db.checkResult.createMany({
          data: parsedResults.map((r) => ({
            organizationId: orgId,
            monitorId: r.monitorId,
            statusCode: r.statusCode,
            responseTimeMs: r.responseTimeMs,
            isSuccess: r.isSuccess,
            errorMessage: r.errorMessage || null,
            timing: r.timing || null,
            headers: r.headers || null,
            region: r.region,
          })),
        });
      }

      res.status(202).json({
        success: true,
        acceptedCount: parsedResults.length,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: err.errors });
      }
      next(err);
    }
  });

  return app;
}
