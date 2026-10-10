import { z } from 'zod';

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional()
  .transform((value) => value || undefined);

const contactMethodFields = {
  phone: optionalText(30),
  email: z.union([z.email().max(254), z.literal('')]).optional().transform((value) => value || undefined),
};

export const contactInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  jobTitle: optionalText(100),
  ...contactMethodFields,
  isPrimary: z.boolean().default(false),
}).refine((value) => value.phone || value.email, {
  message: 'Provide a phone number or email address.',
  path: ['phone'],
});

export const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: optionalText(200),
  city: z.string().trim().min(2).max(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
});

export const siteInputSchema = addressInputSchema.omit({ label: true }).extend({
  name: z.string().trim().min(2).max(120),
});

export const customerInputSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  legalName: optionalText(200),
  contacts: z.array(contactInputSchema).min(1).max(20),
  addresses: z.array(addressInputSchema).max(20).default([]),
  sites: z.array(siteInputSchema).max(50).default([]),
});

export const customerListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const serviceCategoryInputSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
});

export const idParamsSchema = z.object({ id: z.uuid() });
export const customerChildParamsSchema = z.object({ customerId: z.uuid() });
export const versionedReasonSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const leadInputSchema = z.object({
  inquiryName: z.string().trim().min(2).max(160),
  companyName: optionalText(200),
  contactName: z.string().trim().min(2).max(120),
  ...contactMethodFields,
  address: optionalText(500),
  source: z.string().trim().min(2).max(100),
  serviceCategoryId: z.uuid(),
  ownerUserId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  primaryContactId: z.uuid().optional(),
  siteId: z.uuid().optional(),
}).refine((value) => value.phone || value.email, {
  message: 'Provide a phone number or email address.',
  path: ['phone'],
}).refine((value) => !value.primaryContactId || value.customerId, {
  message: 'A customer is required when linking a contact.',
  path: ['customerId'],
}).refine((value) => !value.siteId || value.customerId, {
  message: 'A customer is required when linking a site.',
  path: ['customerId'],
});

export const leadListQuerySchema = z.object({
  stage: z.enum(['new', 'contacted', 'qualified', 'design_authorized', 'commercial_negotiation', 'won', 'lost', 'on_hold']).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const leadStageInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  stage: z.enum(['contacted', 'on_hold', 'lost']),
  reason: optionalText(500),
}).refine((value) => value.stage !== 'lost' || value.reason, {
  message: 'A lost reason is required.',
  path: ['reason'],
});

export const qualifyLeadInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  customerId: z.uuid(),
  primaryContactId: z.uuid(),
  siteId: z.uuid().optional(),
  title: z.string().trim().min(2).max(200),
  qualificationNotes: z.string().trim().min(3).max(1000),
});

export const opportunityListQuerySchema = z.object({
  state: z.enum(['unawarded', 'quoted', 'awarded', 'lost', 'on_hold']).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
