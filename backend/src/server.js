/**
 * Server Entry Point
 * Boots the HTTP server and handles process termination signals.
 */
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const PORT = env.PORT || 5000;
const HOST = env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info(`🚀 APIWatch backend server running in ${env.NODE_ENV} mode on http://${HOST}:${PORT}`);
  logger.info(`👉 Health check: http://localhost:${PORT}${env.API_PREFIX}/health`);
});

// Graceful shutdown handling
const handleShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
