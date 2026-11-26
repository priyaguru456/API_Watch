import pino from 'pino';
import { env, pinoRedactionSerializer, redactSensitiveData } from '@apiwatch/shared';

const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

/**
 * Creates a configured Pino logger instance with deep redaction.
 * @param {object} [options]
 * @param {import('stream').Writable} [destination]
 * @returns {pino.Logger}
 */
export function createLogger(options = {}, destination) {
  const level = options.level || (isTest ? 'silent' : env.LOG_LEVEL || 'info');

  return pino(
    {
      level,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.headers["x-csrf-token"]',
          'headers.authorization',
          'headers.cookie',
          'headers["x-api-key"]',
          'password',
          'token',
          'secret',
          'encryptedAuth',
          'auth',
          'apiKey',
          'dek',
          'masterKey',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: pinoRedactionSerializer.req,
        res: pinoRedactionSerializer.res,
        err: pinoRedactionSerializer.err,
        ...options.serializers,
      },
      formatters: {
        log(object) {
          return redactSensitiveData(object);
        },
        ...options.formatters,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      transport:
        !destination && isDev && !isTest
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      ...options,
    },
    destination
  );
}

export const logger = createLogger();
