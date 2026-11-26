/**
 * Formatter Utilities
 * Formats response times, percentages, and numerical metrics.
 */

/**
 * Format milliseconds into human-readable string
 * @param {number} ms
 */
export function formatResponseTime(ms) {
  if (ms == null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Format uptime percentage (e.g. 99.95%)
 * @param {number} percent
 */
export function formatPercentage(percent) {
  if (percent == null) return '0.00%';
  return `${percent.toFixed(2)}%`;
}
