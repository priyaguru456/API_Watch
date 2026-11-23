/**
 * Express Application Configuration
 * Assembles middleware pipeline, security headers, routing, and error handling.
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { corsOptions, helmetOptions } from './config/security.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { notFoundMiddleware } from './middleware/not-found.middleware.js';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import apiRouter from './routes/index.js';

const app = express();

// Security Middlewares
app.use(helmet(helmetOptions));
app.use(cors(corsOptions));

// Request Tracking and Rate Limiting
app.use(requestIdMiddleware);
app.use(rateLimitMiddleware);

// Logging Middleware
const morganFormat = env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

// Body Parsing Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Mount Modular API Routes
app.use(env.API_PREFIX, apiRouter);

// 404 Fallback Handler
app.use(notFoundMiddleware);

// Global Centralized Error Handler
app.use(errorMiddleware);

export default app;
