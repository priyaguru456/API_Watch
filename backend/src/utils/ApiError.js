/**
 * ApiError - Custom Application Error Class
 * Standardizes operational and HTTP errors across the application.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error description message
   * @param {Array} errors - Optional validation or contextual error details
   * @param {string} stack - Optional custom stack trace
   */
  constructor(statusCode, message = 'Something went wrong', errors = [], stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
