import app from './app.js';
import { logger } from './config/logger.js';
import { getRedisClient } from './config/redis.js';
import { env } from '@apiwatch/shared';
import { prisma } from '@apiwatch/db';

const PORT = env.PORT || 5000;
const HOST = env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info(`🚀 APIWatch API server running in ${env.NODE_ENV} mode on http://${HOST}:${PORT}`);
  logger.info(`👉 Health check: http://${HOST}:${PORT}/health`);
  logger.info(`👉 Readiness check: http://${HOST}:${PORT}/ready`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Gracefully shutting down API server...`);

  // Force close after 10 seconds
  const forceTimer = setTimeout(() => {
    logger.error('Forceful shutdown timeout reached. Terminating process.');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    try {
      const redis = getRedisClient();
      await redis.quit();
      await prisma.$disconnect();
      clearTimeout(forceTimer);
      logger.info('API server closed gracefully.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown cleanup');
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
