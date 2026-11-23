/**
 * Global Error Handling Middleware
 * Catches all forwarded errors, formats response payloads, and prevents sensitive leakage in production.
 */
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.issues || err.errors || [];
  }

  // Handle Prisma known request errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    statusCode = 400;
    message = `Database Error: ${err.message}`;
  }

  // Log error details
  if (statusCode >= 500) {
    logger.error(`[${req.id || 'N/A'}] ${statusCode} - ${message}`, err.stack);
  } else {
    logger.warn(`[${req.id || 'N/A'}] ${statusCode} - ${message}`);
  }

  const response = {
    success: false,
    message,
    errors: errors.length > 0 ? errors : undefined,
    requestId: req.id,
    timestamp: new Date().toISOString(),
    ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  };

  res.status(statusCode).json(response);
};
