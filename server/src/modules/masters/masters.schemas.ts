import { z } from 'zod';

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional()
  .transform((value) => value || undefined);

const codeSchema = (maximum: number) => z.string().trim().min(1).max(maximum)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores only.')
  .transform((value) => value.toUpperCase());

export const masterIdParamsSchema = z.object({ id: z.uuid() });

export const masterListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['code', 'name', 'status', 'updatedAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const versionedMasterSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const deactivateMasterSchema = versionedMasterSchema.extend({
  reason: z.string().trim().min(3).max(500),
});

export const unitCreateSchema = z.object({
  code: codeSchema(30),
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(20),
});
export const unitUpdateSchema = unitCreateSchema.extend(versionedMasterSchema.shape);

export const itemCategoryCreateSchema = z.object({
  code: codeSchema(40),
  name: z.string().trim().min(2).max(120),
});
export const itemCategoryUpdateSchema = itemCategoryCreateSchema.extend(versionedMasterSchema.shape);

export const itemCreateSchema = z.object({
  code: codeSchema(50),
  name: z.string().trim().min(2).max(160),
  specification: optionalText(2_000),
  categoryId: z.uuid(),
  unitId: z.uuid(),
});
export const itemUpdateSchema = itemCreateSchema.extend(versionedMasterSchema.shape);

export const vendorContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  jobTitle: optionalText(100),
  phone: optionalText(30),
  email: z.union([z.email().max(254), z.literal('')]).optional().transform((value) => value || undefined),
}).refine((value) => value.phone || value.email, {
  message: 'Provide a phone number or email address.',
  path: ['phone'],
});

export const vendorCreateSchema = z.object({
  code: codeSchema(50),
  displayName: z.string().trim().min(2).max(160),
  legalName: optionalText(200),
  taxIdentifier: optionalText(40),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
  primaryContact: vendorContactSchema,
});
export const vendorUpdateSchema = vendorCreateSchema.extend(versionedMasterSchema.shape);

export type MasterListQuery = z.infer<typeof masterListQuerySchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;
export type ItemCategoryCreateInput = z.infer<typeof itemCategoryCreateSchema>;
export type ItemCategoryUpdateInput = z.infer<typeof itemCategoryUpdateSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
