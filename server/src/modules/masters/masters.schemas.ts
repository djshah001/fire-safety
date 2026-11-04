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
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  sort: z.enum(['code', 'name', 'status', 'updatedAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  approvalStatus: z.string().optional(),
  isArchived: z.preprocess((val) => val === 'true' ? true : val === 'false' ? false : val, z.boolean().optional()),
  vendorType: z.string().optional(),
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

export const vendorTypes = [
  'material_supplier',
  'manufacturer',
  'distributor_dealer',
  'service_provider',
  'installation_contractor',
  'labour_contractor',
  'transport_logistics',
  'other',
] as const;

export const vendorContactInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  jobTitle: optionalText(100),
  phone: z.string().trim().min(7).max(30),
  alternatePhone: optionalText(30),
  email: z.union([z.email().max(254), z.literal('')]).optional().transform((val) => val || undefined),
  isPrimary: z.boolean().default(false),
});

export const vendorAddressInputSchema = z.object({
  id: z.uuid().optional(),
  addressType: z.string().trim().min(1).max(50).default('office'),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalText(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().min(1).max(100).default('India'),
  isDefault: z.boolean().default(false),
});

export const vendorBankAccountInputSchema = z.object({
  id: z.uuid().optional(),
  accountHolderName: z.string().trim().min(2).max(160),
  accountNumber: z.string().trim().min(6).max(50),
  confirmAccountNumber: z.string().trim().min(6).max(50).optional(),
  ifscCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC code (e.g. SBIN0001234).'),
  bankName: z.string().trim().min(2).max(160),
  branch: optionalText(160),
  upiId: optionalText(100),
  isDefault: z.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.confirmAccountNumber && data.accountNumber !== data.confirmAccountNumber) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmAccountNumber'],
      message: 'Account numbers do not match.',
    });
  }
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

export const vendorBaseSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores only.').transform((v) => v.toUpperCase()).optional(),
  displayName: z.string().trim().min(2).max(160),
  tradeName: optionalText(200),
  vendorType: z.enum(vendorTypes).default('material_supplier'),
  supplierCategories: z.array(z.string().trim().min(1).max(100)).min(1, 'Select at least one supplier category.').default(['General']),
  website: optionalText(255),
  companyDescription: optionalText(2000),

  // Primary Contact & Additional Contacts
  primaryContact: vendorContactInputSchema,
  additionalContacts: z.array(vendorContactInputSchema).default([]),

  // Address
  addressLine1: z.string().trim().min(1).max(200).default('Registered Address'),
  addressLine2: optionalText(200),
  city: z.string().trim().min(1).max(100).default('City'),
  state: z.string().trim().min(1).max(100).default('State'),
  postalCode: z.string().trim().min(3).max(20).default('380001'),
  country: z.string().trim().min(1).max(100).default('India'),
  additionalAddresses: z.array(vendorAddressInputSchema).default([]),

  // Tax details
  gstStatus: z.enum(['registered', 'unregistered']).default('unregistered'),
  gstin: optionalText(15),
  legalName: optionalText(200),
  pan: optionalText(10),
  taxIdentifier: optionalText(40),

  // Supply details
  brandsSupplied: z.array(z.string().trim().min(1).max(100)).default([]),
  deliveryLocations: optionalText(1000),
  typicalLeadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  minimumOrderValue: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,2})?$/).optional(),

  // Commercial terms
  paymentTerms: optionalText(500),
  creditPeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  creditLimit: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,2})?$/).optional(),
  preferredCurrency: z.string().trim().regex(/^[A-Z]{3}$/).default('INR'),

  // Bank details
  bankAccounts: z.array(vendorBankAccountInputSchema).default([]),

  // Internal details
  assignedBuyerUserId: z.uuid().optional(),
  internalNotes: optionalText(2000),
  approvalStatus: z.enum(['draft', 'pending_approval', 'active', 'rejected']).default('active'),
});

const refineVendorTaxDetails = (data: { gstStatus?: string; gstin?: string | null; legalName?: string | null; pan?: string | null }, ctx: z.RefinementCtx) => {
  if (data.gstStatus === 'registered') {
    if (!data.gstin || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(data.gstin)) {
      ctx.addIssue({
        code: 'custom',
        path: ['gstin'],
        message: 'Provide a valid 15-character GSTIN (e.g. 24ABCDE1234F1Z5).',
      });
    }
    if (!data.legalName) {
      ctx.addIssue({
        code: 'custom',
        path: ['legalName'],
        message: 'Registered legal name is required when GST registered.',
      });
    }
  }
  if (data.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.pan)) {
    ctx.addIssue({
      code: 'custom',
      path: ['pan'],
      message: 'Provide a valid 10-character PAN (e.g. ABCDE1234F).',
    });
  }
};

export const vendorCreateSchema = vendorBaseSchema.superRefine(refineVendorTaxDetails);

export const vendorUpdateSchema = vendorBaseSchema.extend(versionedMasterSchema.shape).extend({
  bankAccounts: z.array(vendorBankAccountInputSchema).optional(),
  additionalContacts: z.array(vendorContactInputSchema).optional(),
  additionalAddresses: z.array(vendorAddressInputSchema).optional(),
}).superRefine(refineVendorTaxDetails);

export const vendorDuplicateCheckSchema = z.object({
  displayName: optionalText(160),
  gstin: optionalText(15),
  phone: optionalText(30),
  excludeVendorId: z.uuid().optional(),
});

export const createVendorInvitationSchema = z.object({
  whatsappNumber: z.string().trim().min(7).max(30),
  contactName: z.string().trim().min(2).max(120),
  companyName: optionalText(160),
  validDays: z.coerce.number().int().min(1).max(30).default(14),
  sendViaMsg91: z.boolean().optional(),
});

export const onboardingTokenParamsSchema = z.object({
  token: z.string().trim().min(10).max(64),
});

export const vendorPriceListCreateSchema = z.object({
  itemId: z.uuid().optional(),
  vendorProductCode: optionalText(100),
  vendorProductName: z.string().trim().min(2).max(200),
  description: optionalText(1000),
  unitRate: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('INR'),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  minimumOrderQuantity: z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/).default('1'),
  effectiveFrom: z.iso.date(),
});

export const vendorPriceListUpdateSchema = vendorPriceListCreateSchema;

export const vendorPriceListParamsSchema = z.object({
  id: z.uuid(),
  priceListId: z.uuid(),
});

export const archiveVendorSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: optionalText(500),
});

export const approveVendorSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

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
export type VendorDuplicateCheckInput = z.infer<typeof vendorDuplicateCheckSchema>;
export type CreateVendorInvitationInput = z.infer<typeof createVendorInvitationSchema>;
export type VendorPriceListCreateInput = z.infer<typeof vendorPriceListCreateSchema>;
export type VendorPriceListUpdateInput = z.infer<typeof vendorPriceListUpdateSchema>;
export type ArchiveVendorInput = z.infer<typeof archiveVendorSchema>;
export type ApproveVendorInput = z.infer<typeof approveVendorSchema>;
