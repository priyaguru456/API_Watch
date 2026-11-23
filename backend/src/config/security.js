/**
 * Security Configuration
 * Configures CORS, Helmet, and HTTP security policies.
 */
import { env } from './env.js';

export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman) or matching origin
    if (!origin || origin === env.CORS_ORIGIN || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked request from origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
};

export const helmetOptions = {
  contentSecurityPolicy: env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
};
