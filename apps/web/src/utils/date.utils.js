/**
 * Date Utilities
 * Standardizes timestamp formatting and relative time calculations.
 */

/**
 * Format ISO string to localized date time
 * @param {string|Date} date
 */
export function formatDateTime(date) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

/**
 * Format ISO string to time only
 * @param {string|Date} date
 */
export function formatTimeOnly(date) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    timeStyle: 'medium',
  }).format(new Date(date));
}
