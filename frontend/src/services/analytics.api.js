/**
 * Analytics API Service
 * Fetches latency distributions, uptime SLA stats, and incident reports.
 */
import { apiClient } from './api.js';

export const analyticsApi = {
  getOverviewMetrics: () => apiClient.get('/analytics/overview'),
  getServiceMetrics: (serviceId, timeRange) =>
    apiClient.get(`/analytics/services/${serviceId}`, { params: { range: timeRange } }),
};
