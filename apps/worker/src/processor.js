import { prisma } from '@apiwatch/db';
import { safeFetch } from '@apiwatch/ssrf-guard';
import { logger } from './logger.js';

/**
 * Executes a single monitoring job for an organization's target.
 * Guarantees organizationId scoping and routes through ssrf-guard.
 *
 * @param {import('bullmq').Job} job
 */
export async function processMonitorCheck(job) {
  const { monitorId, organizationId } = job.data;

  if (!organizationId || !monitorId) {
    throw new Error('Missing organizationId or monitorId in job payload');
  }

  // Strictly scope lookup by organizationId
  const monitor = await prisma.monitor.findFirst({
    where: {
      id: monitorId,
      organizationId,
    },
  });

  if (!monitor) {
    logger.warn(
      { monitorId, organizationId },
      'Monitor not found or does not belong to specified tenant'
    );
    return { status: 'skipped', reason: 'monitor_not_found' };
  }

  if (monitor.status === 'PAUSED') {
    return { status: 'skipped', reason: 'monitor_paused' };
  }

  logger.info(
    { monitorId: monitor.id, organizationId, url: monitor.url },
    `Executing scheduled check for ${monitor.name}`
  );

  let isSuccess = false;
  let statusCode = 0;
  let responseTimeMs = 0;
  let errorMessage = null;
  let timing = null;
  let responseHeaders = null;

  try {
    const result = await safeFetch(monitor.url, {
      method: monitor.method,
      headers: monitor.headers && typeof monitor.headers === 'object' ? monitor.headers : {},
      timeoutMs: (monitor.timeoutSeconds || 30) * 1000,
    });

    statusCode = result.statusCode;
    responseTimeMs = result.timing.totalMs;
    timing = result.timing;
    responseHeaders = result.headers;

    // Check assertions
    const expectedStatus =
      monitor.assertionConfig && typeof monitor.assertionConfig === 'object'
        ? monitor.assertionConfig.expectedStatusCode || 200
        : 200;

    isSuccess = statusCode === expectedStatus;
    if (!isSuccess) {
      errorMessage = `Expected HTTP ${expectedStatus}, received ${statusCode}`;
    }
  } catch (err) {
    errorMessage = err.message || 'Check failed';
    isSuccess = false;
  }

  // Record check result scoped by organizationId
  const checkResult = await prisma.checkResult.create({
    data: {
      organizationId,
      monitorId: monitor.id,
      statusCode,
      responseTimeMs,
      isSuccess,
      errorMessage,
      timing: timing ? timing : undefined,
      headers: responseHeaders ? responseHeaders : undefined,
    },
  });

  // Update monitor status and lastCheckedAt
  await prisma.monitor.update({
    where: {
      id: monitor.id,
    },
    data: {
      lastCheckedAt: new Date(),
      status: isSuccess ? 'ACTIVE' : 'DEGRADED',
    },
  });

  return {
    checkResultId: checkResult.id,
    isSuccess,
    statusCode,
    responseTimeMs,
  };
}
