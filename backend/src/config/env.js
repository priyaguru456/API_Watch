/**
 * Environment Configuration and Validation
 * Validates runtime environment variables using Zod schema.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/apiwatch_dev?schema=public'),
  JWT_SECRET: z.string().default('apiwatch_dev_default_secret_key_minimum_32_characters_long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:', parseResult.error.format());
  process.exit(1);
}

export const env = parseResult.data;
