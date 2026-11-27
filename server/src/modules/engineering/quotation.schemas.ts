import { Decimal } from 'decimal.js';
import { z } from 'zod';

const uuid = z.uuid();
const version = z.coerce.number().int().positive();
const money = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places.');
const nonNegativeDecimal = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/, 'Enter a non-negative rate with at most four decimal places.');
const signedMoney = z.string().trim().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/, 'Enter an amount with at most two decimal places.');
const percentage = z.string().trim().regex(/^\d{1,3}(?:\.\d{1,2})?$/, 'Enter a percentage with at most two decimal places.').refine((value) => new Decimal(value).lte(100), 'Percentage must be between 0 and 100.');
const markup = z.string().trim().regex(/^\d{1,4}(?:\.\d{1,4})?$/, 'Enter a markup percentage from 0 to 1000 with at most four decimal places.').refine((value) => new Decimal(value).lte(1000), 'Markup must not exceed 1000%.');

export const quotationListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'submitted', 'returned', 'approved', 'issued', 'accepted', 'declined']).optional(),
  commercialState: z.enum(['unawarded', 'quoted', 'awarded', 'lost', 'on_hold']).optional(),
  sectorId: uuid.optional(),
  assigneeUserId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['quotationNumber', 'title', 'status', 'updatedAt', 'grandTotal']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const quotationParamsSchema = z.object({ jobId: uuid, revisionId: uuid });
export const quotationLineParamsSchema = quotationParamsSchema.extend({ lineId: uuid });
export const quotationDocumentParamsSchema = quotationParamsSchema.extend({ documentId: uuid });

export const quotationDocumentDetailsSchema = z.object({
  expectedVersion: version,
  details: z.object({
    senderName: z.string().trim().max(160).optional(),
    senderTagline: z.string().trim().max(200).optional(),
    senderAddress: z.string().trim().max(600).optional(),
    senderContact: z.string().trim().max(200).optional(),
    senderGstin: z.string().trim().max(40).optional(),
    recipientAddress: z.string().trim().max(600).optional(),
    recipientGstin: z.string().trim().max(40).optional(),
    recipientContact: z.string().trim().max(160).optional(),
    recipientPhone: z.string().trim().max(40).optional(),
    documentDate: z.iso.date().optional(),
    bankDetails: z.string().trim().max(1000).optional(),
    signatory: z.string().trim().max(160).optional(),
  }).strict(),
}).strict();

export const createQuotationRevisionSchema = z.object({
  boqRevisionId: uuid,
  sourceRevisionId: uuid.optional(),
  title: z.string().trim().min(2).max(200),
  exclusions: z.string().trim().min(2).max(4_000),
  deliveryTerms: z.string().trim().min(2).max(2_000),
  paymentTerms: z.string().trim().min(2).max(2_000),
});

export const quotationHeaderSchema = z.object({
  title: z.string().trim().min(2).max(200),
  validityDays: z.coerce.number().int().min(1).max(365),
  exclusions: z.string().trim().min(2).max(4_000),
  deliveryTerms: z.string().trim().min(2).max(2_000),
  paymentTerms: z.string().trim().min(2).max(2_000),
  additionalDiscount: money,
  taxLabel: z.string().trim().max(120).optional(),
  taxAmount: money,
  roundingAdjustment: signedMoney,
  expectedVersion: version,
}).superRefine((value, context) => {
  if (new Decimal(value.taxAmount).gt(0) && !value.taxLabel) {
    context.addIssue({ code: 'custom', path: ['taxLabel'], message: 'Describe the tax amount when it is greater than zero.' });
  }
});

export const quotationLineSchema = z.object({
  offeringId: uuid,
  supplyRate: nonNegativeDecimal.optional(),
  labourRate: nonNegativeDecimal.optional(),
  miscellaneousRate: nonNegativeDecimal.optional(),
  markupPercent: markup.optional(),
  notes: z.string().trim().max(1_000).optional(),
  expectedRevisionVersion: version,
  expectedLineVersion: version,
}).strict();

export const quotationLinesBatchPricingSchema = z.object({
  expectedVersion: version,
  updates: z.array(z.object({
    lineId: uuid,
    expectedLineVersion: version.optional(),
    offeringId: uuid.optional(),
    supplyRate: nonNegativeDecimal.optional(),
    labourRate: nonNegativeDecimal.optional(),
    miscellaneousRate: nonNegativeDecimal.optional(),
    markupPercent: markup.optional(),
    notes: z.string().trim().max(1_000).nullable().optional(),
  }).strict()).min(1).max(1_000).refine(
    (updates) => new Set(updates.map((u) => u.lineId)).size === updates.length,
    'Each quotation line may appear once in a pricing batch.',
  ),
}).strict();

export const paymentPlanSchema = z.object({
  cashPercentage: percentage,
  nonCashPercentage: percentage,
  expectedVersion: version,
}).superRefine((value, context) => {
  if (!new Decimal(value.cashPercentage).plus(value.nonCashPercentage).eq(100)) {
    context.addIssue({ code: 'custom', path: ['nonCashPercentage'], message: 'Cash and non-cash percentages must total exactly 100.' });
  }
});

export const quotationVersionSchema = z.object({ expectedVersion: version });
export const quotationReviewSchema = z.object({
  decision: z.enum(['approved', 'returned']),
  reason: z.string().trim().max(1_000).optional(),
  expectedVersion: version,
}).superRefine((value, context) => {
  if (value.decision === 'returned' && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'A return reason is required.' });
});

export const quotationCustomerDecisionSchema = z.object({
  decision: z.enum(['accepted', 'declined']),
  leadOutcome: z.enum(['keep_negotiating', 'mark_lost', 'put_on_hold']).optional(),
  evidenceReference: z.string().trim().min(3).max(1_000),
  customerOrderReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1_000).optional(),
  expectedVersion: version,
}).superRefine((value, context) => {
  if (value.decision === 'declined' && !value.leadOutcome) {
    context.addIssue({
      code: 'custom',
      path: ['leadOutcome'],
      message: 'Select how to update the lead/opportunity after customer decline.',
    });
  }
});
