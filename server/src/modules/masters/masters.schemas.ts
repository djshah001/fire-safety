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
  allowFractional: z.boolean().default(true),
});
export const unitUpdateSchema = unitCreateSchema.extend(versionedMasterSchema.shape);

export const itemCategoryCreateSchema = z.object({
  code: codeSchema(40),
  name: z.string().trim().min(2).max(120),
});
export const itemCategoryUpdateSchema = itemCategoryCreateSchema.extend(versionedMasterSchema.shape);

export const brandCreateSchema = z.object({
  code: codeSchema(40),
  name: z.string().trim().min(2).max(120),
});
export const brandUpdateSchema = brandCreateSchema.extend(versionedMasterSchema.shape);

const specificationDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/, 'Use a lowercase specification key.'),
  label: z.string().trim().min(1).max(100),
  valueType: z.enum(['text', 'number', 'boolean']),
  unitLabel: optionalText(30),
  isRequired: z.boolean().default(false),
});

export const itemFamilyCreateSchema = z.object({
  code: codeSchema(50),
  name: z.string().trim().min(2).max(160),
  categoryId: z.uuid(),
  scopeDescription: z.string().trim().min(2).max(4_000),
  defaultUnitId: z.uuid().optional(),
  specifications: z.array(specificationDefinitionSchema).max(30).default([]),
}).superRefine((value, context) => {
  const keys = value.specifications.map((item) => item.key);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: ['specifications'], message: 'Specification keys must be unique.' });
});
export const itemFamilyUpdateSchema = itemFamilyCreateSchema.extend(versionedMasterSchema.shape);

export const itemCreateSchema = z.object({
  code: codeSchema(50),
  name: z.string().trim().min(2).max(160),
  specification: optionalText(2_000),
  familyId: z.uuid(),
  model: optionalText(120),
  specificationValues: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
  categoryId: z.uuid().optional(),
  unitId: z.uuid(),
  brandIds: z.array(z.uuid()).max(50).default([])
    .refine((values) => new Set(values).size === values.length, 'Choose each brand/make only once.'),
});
export const itemUpdateSchema = itemCreateSchema.extend(versionedMasterSchema.shape);

export const itemOfferingParamsSchema = z.object({ id: z.uuid(), offeringId: z.uuid() });
export const itemOfferingCreateSchema = z.object({
  brandId: z.uuid().optional(),
  manufacturerModel: z.string().trim().min(1).max(120),
  manufacturerSku: optionalText(100),
  isPreferred: z.boolean().default(false),
});
export const itemOfferingUpdateSchema = itemOfferingCreateSchema.extend(versionedMasterSchema.shape);

export const itemRateCreateSchema = z.object({
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('INR'),
  effectiveFrom: z.iso.date(),
  supplyRate: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/),
  labourRate: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/),
  miscellaneousRate: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/),
  miscellaneousNote: optionalText(1_000),
});

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
export type BrandCreateInput = z.infer<typeof brandCreateSchema>;
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;
export type ItemFamilyCreateInput = z.infer<typeof itemFamilyCreateSchema>;
export type ItemFamilyUpdateInput = z.infer<typeof itemFamilyUpdateSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type ItemOfferingCreateInput = z.infer<typeof itemOfferingCreateSchema>;
export type ItemOfferingUpdateInput = z.infer<typeof itemOfferingUpdateSchema>;
export type ItemRateCreateInput = z.infer<typeof itemRateCreateSchema>;
export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
