/**
 * Authentication API Service
 * Handles login, registration, and session token verification requests.
 */
import { apiClient } from './api.js';

export const authApi = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (userData) => apiClient.post('/auth/register', userData),
  getCurrentUser: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
};
