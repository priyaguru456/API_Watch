import { prisma } from '@apiwatch/db';
import { VaultService } from './vault-service.js';
import { EnvMasterKeyProvider } from './master-key-provider.js';
import { PrismaKeyStore } from './key-store.js';

/**
 * Parses CLI arguments into an options object.
 * @param {string[]} args
 */
export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    org: null,
    all: false,
    reencrypt: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--org' || arg === '-o') {
      options.org = args[++i];
    } else if (arg.startsWith('--org=')) {
      options.org = arg.split('=')[1];
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--reencrypt' || arg === '-r') {
      options.reencrypt = true;
    }
  }

  return options;
}

/**
 * Executes key rotation CLI.
 * @param {string[]} [rawArgs]
 * @param {object} [injected]
 */
export async function runRotationCli(rawArgs = process.argv.slice(2), injected = {}) {
  const options = parseArgs(rawArgs);

  if (options.help) {
    console.info(`
APIWatch Vault Key Rotation Utility

Usage:
  node ./bin/vault-rotate.js [options]

Options:
  --org, -o <orgId>   Rotate the data encryption key (DEK) for a specific organization
  --all, -a           Rotate DEKs for ALL organizations in the database
  --reencrypt, -r     Re-encrypt all stored monitor secrets with the new key version
  --help, -h          Show this help message

Examples:
  node ./bin/vault-rotate.js --org 123e4567-e89b-12d3-a456-426614174000 --reencrypt
  node ./bin/vault-rotate.js --all --reencrypt
`);
    return { success: true, action: 'help' };
  }

  const db = injected.db || prisma;
  const masterKeyProvider = injected.masterKeyProvider || new EnvMasterKeyProvider();
  const keyStore = injected.keyStore || new PrismaKeyStore(db);
  const vault = injected.vault || new VaultService({ masterKeyProvider, keyStore, db });

  if (options.all) {
    console.info(
      `[VAULT] Starting key rotation for all organizations (reencrypt=${options.reencrypt})...`
    );
    const results = await vault.rotateAllKeys({ reencrypt: options.reencrypt, db });
    console.info(`[VAULT] Successfully rotated keys for ${results.length} organization(s):`);
    for (const r of results) {
      console.info(
        `  - Org: ${r.orgName || r.organizationId} (v${r.previousVersion} -> v${r.newVersion}, re-encrypted: ${r.reencryptedCount} secret(s))`
      );
    }
    return { success: true, count: results.length, results };
  }

  if (options.org) {
    console.info(
      `[VAULT] Starting key rotation for organization "${options.org}" (reencrypt=${options.reencrypt})...`
    );
    const result = await vault.rotateOrgKey(options.org, {
      reencrypt: options.reencrypt,
      db,
    });
    console.info(
      `[VAULT] Successfully rotated key for org ${result.organizationId}: v${result.previousVersion} -> v${result.newVersion} (re-encrypted ${result.reencryptedCount} secret(s))`
    );
    return { success: true, count: 1, result };
  }

  throw new Error('Must specify either --org <orgId> or --all. Run with --help for usage.');
}
