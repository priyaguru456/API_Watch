import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@apiwatch/shared';
import { prisma } from '@apiwatch/db';
import { logger } from './logger.js';
import { processMonitorCheck } from './processor.js';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  logger.error({ err }, 'Worker Redis connection error');
});

export const MONITOR_QUEUE_NAME = 'monitor-checks';

export const worker = new Worker(
  MONITOR_QUEUE_NAME,
  async (job) => {
    return processMonitorCheck(job);
  },
  {
    connection,
    concurrency: 10,
  }
);

worker.on('ready', () => {
  logger.info(`👷 APIWatch BullMQ Worker ready, listening on queue: ${MONITOR_QUEUE_NAME}`);
});

worker.on('completed', (job, result) => {
  logger.info(
    { jobId: job.id, monitorId: job.data.monitorId, result },
    `Job ${job.id} completed successfully`
  );
});

worker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, monitorId: job?.data?.monitorId, err },
    `Job ${job?.id} failed with error: ${err.message}`
  );
});

// Graceful worker shutdown
const handleWorkerShutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down worker...`);
  try {
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
    logger.info('Worker shutdown complete.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleWorkerShutdown('SIGTERM'));
process.on('SIGINT', () => handleWorkerShutdown('SIGINT'));
