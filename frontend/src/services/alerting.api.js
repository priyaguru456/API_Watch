/**
 * Alerting API Service
 * Configures alert rules, webhooks, and contact channels.
 */
import { apiClient } from './api.js';

export const alertingApi = {
  getRules: () => apiClient.get('/alerting/rules'),
  createRule: (rule) => apiClient.post('/alerting/rules', rule),
  deleteRule: (id) => apiClient.delete(`/alerting/rules/${id}`),
};
