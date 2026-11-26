/**
 * Monitoring API Service
 * Fetches health check history, ping logs, and trigger checks.
 */
import { apiClient } from './api.js';

export const monitoringApi = {
  getSystemHealth: () => apiClient.get('/health'),
  getChecks: (serviceId, params) => apiClient.get(`/monitoring/${serviceId}/checks`, { params }),
  triggerCheck: (serviceId) => apiClient.post(`/monitoring/${serviceId}/trigger`),
};
