/**
 * Prisma Client Extension for Multi-Tenant Row-Level Security (RLS)
 * Sets PostgreSQL session variable `app.org_id` per request in an isolated transaction.
 */

/**
 * Executes a callback within a database transaction scoped to an organization
 * via PostgreSQL `set_config('app.org_id', $1, true)`.
 *
 * @template T
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} organizationId
 * @param {(tx: import('@prisma/client').PrismaClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTenantTransaction(prismaClient, organizationId, callback) {
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('Tenant RLS Error: Valid organizationId is required');
  }

  return prismaClient.$transaction(async (tx) => {
    // Set LOCAL configuration parameter for this transaction only (is_local = true)
    await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, organizationId);
    return callback(tx);
  });
}

/**
 * Creates a Prisma Client extension that attaches tenant RLS capabilities.
 */
export function tenantRlsExtension() {
  return (client) => {
    return client.$extends({
      name: 'apiwatch-tenant-rls',
      client: {
        /**
         * Scopes queries within an RLS transaction for the given tenant.
         * @param {string} organizationId
         * @param {(tx: any) => Promise<any>} fn
         */
        async forTenant(organizationId, fn) {
          return withTenantTransaction(client, organizationId, fn);
        },
      },
    });
  };
}
