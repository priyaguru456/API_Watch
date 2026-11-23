/**
 * Application Constants
 * Defines fixed configuration constants, status codes, and service states.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

export const SERVICE_STATUS = {
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  DOWN: 'DOWN',
  MAINTENANCE: 'MAINTENANCE',
};

export const INCIDENT_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};
