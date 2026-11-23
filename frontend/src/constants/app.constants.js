/**
 * Application Constants
 * Defines status labels, poll intervals, and UI configuration values.
 */
export const APP_CONFIG = {
  NAME: 'APIWatch',
  VERSION: '1.0.0',
  DEFAULT_POLL_INTERVAL_MS: 30000,
  TOKEN_STORAGE_KEY: 'apiwatch_auth_token',
};

export const STATUS_TYPES = {
  OPERATIONAL: { label: 'Operational', color: 'green' },
  DEGRADED: { label: 'Degraded', color: 'yellow' },
  DOWN: { label: 'Down', color: 'red' },
  MAINTENANCE: { label: 'Maintenance', color: 'blue' },
};
