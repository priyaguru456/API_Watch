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

// Email Verification Schemas
export const emailVerifyRequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim().optional(),
});

export const emailVerifyConfirmSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Password Reset Schemas
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Password reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
});

// TOTP 2FA Schemas
export const totpVerifySchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

export const totpEnableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

export const totpDisableSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, 'TOTP code must be 6 digits')
    .optional(),
  password: z.string().min(1).optional(),
});

// Organization & Invitation Schemas
export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid invite email address').toLowerCase().trim(),
  role: z.enum(['ADMIN', 'ENGINEER', 'VIEWER']).default('VIEWER'),
  customRoleId: z.string().uuid().optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

// Custom Role Schemas
export const createCustomRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(255).optional(),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
});

export const updateCustomRoleSchema = createCustomRoleSchema.partial();

// API Key Schemas
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
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
  auth: z.union([z.string(), z.record(z.any())]).optional(),
  assertionConfig: z
    .object({
      expectedStatusCode: z.number().int().min(100).max(599).default(200),
      maxLatencyMs: z.number().int().positive().optional(),
      bodyContains: z.string().optional(),
    })
    .default({ expectedStatusCode: 200 }),
});

export const updateMonitorSchema = createMonitorSchema.partial();

// Audit Log Query & Search Schema
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().optional(),
  actorId: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  startDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  endDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  search: z.string().trim().optional(),
});

// Audit Log Export Schema
export const auditExportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  action: z.string().trim().optional(),
  actorId: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  startDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  endDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  search: z.string().trim().optional(),
});

// Vault Key Rotation Schema
export const rotateKeySchema = z.object({
  reencrypt: z.boolean().default(true),
});
