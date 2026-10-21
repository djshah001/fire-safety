import { z } from 'zod';

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional()
  .transform((value) => value || undefined);

const timezoneSchema = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Choose a valid IANA timezone.');

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
  sort: z.enum(['name', 'status', 'updatedAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const serviceCategoryInputSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
});
export const classificationInputSchema = serviceCategoryInputSchema;
export const classificationTypeParamsSchema = z.object({
  type: z.enum(['lead-purposes', 'market-sectors']),
});

export const idParamsSchema = z.object({ id: z.uuid() });
export const crmImportTypeSchema = z.enum(['customers', 'open_leads']);
export const crmImportTypeParamsSchema = z.object({ type: crmImportTypeSchema });
export const commitImportSchema = z.object({ expectedVersion: z.number().int().positive() });
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
  purposeId: z.uuid(),
  sectorId: z.uuid(),
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
  sort: z.enum(['leadNumber', 'inquiryName', 'stage', 'updatedAt']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
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

export const authorizeDesignInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(2).max(200),
  designHeadUserId: z.uuid(),
  surveyRequested: z.boolean().default(false),
  authorizationNotes: z.string().trim().min(3).max(1_000),
});

export const designAssigneeQuerySchema = z.object({
  role: z.enum(['designer', 'design_head']),
});

export const opportunityListQuerySchema = z.object({
  state: z.enum(['unawarded', 'quoted', 'awarded', 'lost', 'on_hold']).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['title', 'customerName', 'state', 'updatedAt']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const leadChildParamsSchema = z.object({ leadId: z.uuid() });
export const leadAttachmentParamsSchema = z.object({ leadId: z.uuid(), attachmentId: z.uuid() });

export const activityInputSchema = z.object({
  type: z.enum(['call', 'meeting', 'note']),
  summary: z.string().trim().min(3).max(2_000),
  occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
}).refine((value) => value.occurredAt.getTime() <= Date.now() + 5 * 60_000, {
  message: 'Activity time cannot be more than five minutes in the future.',
  path: ['occurredAt'],
});

export const reminderInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  assigneeUserId: z.uuid().optional(),
  timezone: timezoneSchema,
  dueAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
}).refine((value) => value.dueAt.getTime() >= Date.now() + 60_000, {
  message: 'Reminder must be due at least one minute in the future.',
  path: ['dueAt'],
});

const bulkLeadTargetsSchema = z.array(z.object({
  id: z.uuid(),
  expectedVersion: z.number().int().positive(),
})).min(1).max(100).superRefine((targets, context) => {
  const seen = new Set<string>();
  targets.forEach((target, index) => {
    if (seen.has(target.id)) {
      context.addIssue({ code: 'custom', message: 'A lead can only appear once.', path: [index, 'id'] });
    }
    seen.add(target.id);
  });
});

export const bulkLeadAssignmentSchema = z.object({
  targets: bulkLeadTargetsSchema,
  assigneeUserId: z.uuid(),
});

export const bulkReminderInputSchema = z.object({
  targets: bulkLeadTargetsSchema,
  title: z.string().trim().min(3).max(200),
  assigneeUserId: z.uuid().optional(),
  timezone: timezoneSchema,
  dueAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
}).refine((value) => value.dueAt.getTime() >= Date.now() + 60_000, {
  message: 'Reminder must be due at least one minute in the future.',
  path: ['dueAt'],
});

export const reminderListQuerySchema = z.object({
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['dueAt', 'title', 'status']).default('dueAt'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const completeReminderSchema = z.object({ expectedVersion: z.number().int().positive() });
