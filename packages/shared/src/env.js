import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load .env from monorepo root if running locally
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.resolve(__dirname, '../../../');
dotenv.config({ path: path.join(monorepoRoot, '.env') });
dotenv.config(); // fallback to process.cwd()

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z
    .string()
    .or(z.number())
    .default(5000)
    .transform((val) => (typeof val === 'number' ? val : parseInt(val, 10))),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//i, 'DATABASE_URL must be a valid PostgreSQL connection URI'),
  REDIS_URL: z.string().regex(/^redis(s)?:\/\//i, 'REDIS_URL must be a valid Redis connection URI'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long for security')
    .default('apiwatch_dev_super_secret_jwt_key_at_least_32_characters_long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes AES-256 key)')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be a hexadecimal string')
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

/**
 * Validates and returns parsed environment variables.
 * @param {Record<string, unknown>} [overrides]
 * @returns {z.infer<typeof envSchema>}
 */
export function loadEnv(overrides = {}) {
  const source = {
    ...process.env,
    ...overrides,
  };

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }

  return result.data;
}

// Lazy/eager export
let cachedEnv = null;
export const env = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!cachedEnv) {
        cachedEnv = loadEnv();
      }
      return cachedEnv[prop];
    },
  }
);
