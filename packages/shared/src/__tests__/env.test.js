import { describe, it, expect } from 'vitest';
import { loadEnv } from '../env.js';

describe('Environment Loader (@apiwatch/shared/env)', () => {
  const baseValidEnv = {
    NODE_ENV: 'test',
    PORT: '5000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/apiwatch_test?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'super_secret_jwt_key_that_is_at_least_32_chars_long',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  it('successfully parses valid environment variables with defaults', () => {
    const parsed = loadEnv(baseValidEnv);
    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.PORT).toBe(5000);
    expect(parsed.HOST).toBe('0.0.0.0');
    expect(parsed.API_PREFIX).toBe('/api/v1');
    expect(parsed.DATABASE_URL).toBe(baseValidEnv.DATABASE_URL);
    expect(parsed.REDIS_URL).toBe(baseValidEnv.REDIS_URL);
  });

  it('fails validation when DATABASE_URL is not a valid postgres connection URI', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        DATABASE_URL: 'http://localhost:5432',
      })
    ).toThrow(/DATABASE_URL must be a valid PostgreSQL connection URI/);
  });

  it('fails validation when REDIS_URL is not a valid redis connection URI', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        REDIS_URL: 'mongodb://localhost:27017',
      })
    ).toThrow(/REDIS_URL must be a valid Redis connection URI/);
  });

  it('fails validation when JWT_SECRET is less than 32 characters', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        JWT_SECRET: 'too_short',
      })
    ).toThrow(/JWT_SECRET must be at least 32 characters/);
  });

  it('fails validation when ENCRYPTION_KEY is not a 64-character hex string', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        ENCRYPTION_KEY: 'not-hex-or-length-64',
      })
    ).toThrow(/ENCRYPTION_KEY/);
  });
});
