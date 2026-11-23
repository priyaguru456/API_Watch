/**
 * Notification Service
 * Dispatches incident alerts to configured channels (Webhooks, Slack, Email).
 */
import { logger } from '../config/logger.js';

export const notificationService = {
  /**
   * Dispatch an incident alert
   * @param {Object} incident
   */
  async dispatchAlert(incident) {
    logger.info(`[Notification Service Placeholder] Dispatching alert for incident: ${incident?.id || 'N/A'}`);
    return { success: true };
  },
};
