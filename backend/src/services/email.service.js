/**
 * Email Service
 * Handles transactional and alert notifications via email.
 */
import { logger } from '../config/logger.js';

export const emailService = {
  /**
   * Send an email notification
   * @param {Object} options - { to, subject, html, text }
   */
  async sendEmail({ to, subject, text }) {
    logger.info(`[Email Service Placeholder] Sending email to: ${to}, subject: ${subject}`);
    return { success: true };
  },
};
