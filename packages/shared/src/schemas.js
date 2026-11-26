import { z } from 'zod';

// Multi-tenant organization scoping schema
export const organizationIdSchema = z.string().uuid({
  message: 'organizationId must be a valid UUID',
});

// Membership Role Enum Schema (OWNER | ADMIN | ENGINEER | VIEWER)
export const membershipRoleSchema = z.enum(['OWNER', 'ADMIN', 'ENGINEER', 'VIEWER']);

// Auth Schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
  name: z.string().min(1).max(100).optional(),
  organizationName: z.string().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

// Organization & Invitation Schemas
export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid invite email address').toLowerCase().trim(),
  role: z.enum(['ADMIN', 'ENGINEER', 'VIEWER']).default('VIEWER'),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

// Generic pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// HTTP Method enum schema
export const httpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

// Monitor Creation Schema
export const createMonitorSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url('Must be a valid HTTP or HTTPS URL'),
  method: httpMethodSchema.default('GET'),
  intervalSeconds: z.number().int().min(10).max(86400).default(60),
  timeoutSeconds: z.number().int().min(1).max(120).default(30),
  headers: z.record(z.string()).optional().default({}),
  body: z.unknown().optional(),
  assertionConfig: z
    .object({
      expectedStatusCode: z.number().int().min(100).max(599).default(200),
      maxLatencyMs: z.number().int().positive().optional(),
      bodyContains: z.string().optional(),
    })
    .default({ expectedStatusCode: 200 }),
});

export const updateMonitorSchema = createMonitorSchema.partial();
