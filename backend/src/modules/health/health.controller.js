/**
 * Health Controller
 * Handles application health and status check requests.
 */
import { ApiResponse } from '../../utils/response.js';

export const getHealth = (req, res) => {
  const healthData = {
    service: 'APIWatch Backend API',
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  };

  return res.status(200).json({
    success: true,
    message: 'APIWatch API is running',
    timestamp: new Date().toISOString(),
    data: healthData,
  });
};
