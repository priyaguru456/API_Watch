/**
 * Monitored Services API Service
 * Handles CRUD operations for monitored target services and endpoints.
 */
import { apiClient } from './api.js';

export const servicesApi = {
  getAll: (params) => apiClient.get('/services', { params }),
  getById: (id) => apiClient.get(`/services/${id}`),
  create: (serviceData) => apiClient.post('/services', serviceData),
  update: (id, serviceData) => apiClient.patch(`/services/${id}`, serviceData),
  delete: (id) => apiClient.delete(`/services/${id}`),
};
