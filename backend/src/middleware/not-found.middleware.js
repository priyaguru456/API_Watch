/**
 * Not Found Middleware
 * Handles requests targeting unregistered routes by passing an ApiError to the error handler.
 */
import { ApiError } from '../utils/ApiError.js';

export const notFoundMiddleware = (req, res, next) => {
  const error = new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`);
  next(error);
};
