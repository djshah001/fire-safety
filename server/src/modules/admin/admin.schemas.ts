import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas.js';

const uuid = z.uuid();

export const listUsersQuerySchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'email', 'status', 'lastLoginAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const createUserSchema = z.object({
  employeeCode: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  temporaryPassword: passwordSchema,
  roleIds: z.array(uuid).min(1).max(20),
});

export const userIdParamsSchema = z.object({ userId: uuid });
export const roleIdParamsSchema = z.object({ roleId: uuid });

const permissionCodesSchema = z.array(z.string().trim().min(1).max(100)).max(100)
  .transform((codes) => [...new Set(codes)]);
const optionalDescription = z.string().trim().max(500).optional()
  .transform((value) => value || undefined);

export const listRolesQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export const createRoleSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(100),
  description: optionalDescription,
  permissionCodes: permissionCodesSchema,
});

export const updateRoleSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(2).max(100),
  description: optionalDescription,
  permissionCodes: permissionCodesSchema,
  reason: z.string().trim().min(3).max(500),
});

export const updateRolePermissionsSchema = z.object({
  expectedVersion: z.number().int().positive(),
  permissionCodes: permissionCodesSchema,
  reason: z.string().trim().min(3).max(500),
});

export const replaceUserRolesSchema = z.object({
  rowVersion: z.number().int().positive(),
  roleIds: z.array(uuid).min(1).max(20).transform((ids) => [...new Set(ids)]),
  reason: z.string().trim().min(3).max(500),
});

export const deactivateRoleSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const accessChangeSchema = z.object({
  rowVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const adminPasswordResetSchema = z.object({
  rowVersion: z.number().int().positive(),
  temporaryPassword: passwordSchema,
  reason: z.string().trim().min(3).max(500),
});
