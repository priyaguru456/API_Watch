export class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {unknown} [details]
   * @param {boolean} [isOperational]
   */
  constructor(statusCode, message, details = null, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', details = null) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', details = null) {
    super(401, message, details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', details = null) {
    super(403, message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource Not Found', details = null) {
    super(404, message, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict', details = null) {
    super(409, message, details);
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation Error', details = null) {
    super(400, message, details);
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal Server Error', details = null) {
    super(500, message, details, false);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service Unavailable', details = null) {
    super(503, message, details, true);
  }
}
