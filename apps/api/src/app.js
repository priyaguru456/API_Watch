import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, NotFoundError } from '@apiwatch/shared';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createOrgRouter, createInviteAcceptRouter } from './routes/org.routes.js';

/**
 * Creates and configures the Express application instance.
 * @param {object} [options]
 * @param {any} [options.db]
 * @param {any} [options.redis]
 * @returns {express.Express}
 */
export function createApp(options = {}) {
  const app = express();

  // Attach Request ID middleware first
  app.use(requestIdMiddleware);

  // Request logging with Pino HTTP
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: {
        ignore: (req) => req.url === '/health', // Keep liveness probe out of noisy logs
      },
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
          };
        },
      },
    })
  );

  // Security headers & CORS
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true, // enable httpOnly cookies across origins
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Organization-Id',
        'X-CSRF-Token',
      ],
      exposedHeaders: ['X-Request-Id'],
    })
  );

  // Cookie and Body Parsing
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Health and Readiness endpoints (mounted at root and API_PREFIX)
  const healthRouter = createHealthRouter(options);
  app.use('/', healthRouter);
  if (env.API_PREFIX && env.API_PREFIX !== '/') {
    app.use(env.API_PREFIX, healthRouter);
  }

  // Auth & Org Feature Routes
  const authRouter = createAuthRouter(options);
  const orgRouter = createOrgRouter(options);
  const inviteAcceptRouter = createInviteAcceptRouter(options);

  const prefix = env.API_PREFIX || '/api/v1';
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/orgs`, orgRouter);
  app.use(`${prefix}/invites`, inviteAcceptRouter);

  // Also mount without prefix for convenience
  if (prefix !== '') {
    app.use('/auth', authRouter);
    app.use('/orgs', orgRouter);
    app.use('/invites', inviteAcceptRouter);
  }

  // 404 Handler
  app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // Centralized Error Handler (guaranteed no stack leak)
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
