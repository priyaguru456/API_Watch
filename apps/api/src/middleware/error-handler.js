import { ZodError } from 'zod';
import { ApiError } from '@apiwatch/shared';
import { logger } from '../config/logger.js';

/**
 * Central Error Handler Middleware.
 * Catches all errors, formats a standard JSON response, and NEVER leaks stack traces to the client.
 */
export function errorHandler(err, req, res, _next) {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details = null;

  const reqLogger = req.log || logger;

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  }
  // Handle Custom Operational ApiErrors
  else if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  }
  // Handle Prisma Database Errors
  else if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'A resource with this identifier or unique attribute already exists.';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'The requested database record was not found.';
    } else {
      statusCode = 400;
      message = 'Database operation error.';
    }
  }
  // Standard or unknown Errors
  else if (err.statusCode && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
    message = err.message || 'Error occurred';
  }

  // Log error with request ID (stack trace logged internally only, NEVER sent to client)
  if (statusCode >= 500) {
    reqLogger.error(
      {
        err: {
          name: err.name,
          message: err.message,
          stack: err.stack,
          code: err.code,
        },
        requestId: req.id,
      },
      `Unhandled server error: ${err.message}`
    );
  } else {
    reqLogger.warn(
      {
        requestId: req.id,
        statusCode,
        message,
        details,
      },
      `Client request rejected (${statusCode}): ${message}`
    );
  }

  const responseBody = {
    success: false,
    error: message,
    ...(details ? { details } : {}),
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(responseBody);
}
