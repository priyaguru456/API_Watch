import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

/**
 * Creates or retrieves the singleton PrismaClient instance.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Checks PostgreSQL connectivity by executing a raw SQL query.
 * Returns health status and latency in milliseconds.
 *
 * @param {PrismaClient} [client]
 * @returns {Promise<{ isHealthy: boolean, latencyMs: number, error?: string }>}
 */
export async function checkDatabaseHealth(client = prisma) {
  const start = performance.now();
  try {
    await client.$queryRaw`SELECT 1 as healthy`;
    const latencyMs = Math.round(performance.now() - start);
    return { isHealthy: true, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      isHealthy: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export * from '@prisma/client';
