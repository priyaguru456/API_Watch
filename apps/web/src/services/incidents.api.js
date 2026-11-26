/**
 * Incidents API Service
 * Manages incident creation, status updates, and resolutions.
 */
import { apiClient } from './api.js';

export const incidentsApi = {
  getAll: (params) => apiClient.get('/incidents', { params }),
  getById: (id) => apiClient.get(`/incidents/${id}`),
  create: (data) => apiClient.post('/incidents', data),
  updateStatus: (id, status) => apiClient.patch(`/incidents/${id}/status`, { status }),
};
