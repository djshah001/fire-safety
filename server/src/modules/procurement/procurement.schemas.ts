import { Decimal } from 'decimal.js';
import { z } from 'zod';

const uuid = z.uuid();
const version = z.coerce.number().int().positive();
const date = z.iso.date();
const quantity = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/, 'Enter a positive quantity with at most four decimal places.')
  .refine((value) => new Decimal(value).gt(0), 'Quantity must be greater than zero.');
const money = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places.');

export const requisitionListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['open', 'sourcing', 'selected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['requisitionNumber', 'title', 'status', 'requiredBy', 'updatedAt']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const projectParamsSchema = z.object({ projectId: uuid });
export const requisitionParamsSchema = z.object({ requisitionId: uuid });

export const createRequisitionSchema = z.object({
  projectId: uuid,
  boqRevisionId: uuid,
  title: z.string().trim().min(2).max(200),
  purchaseManagerUserId: uuid,
  requiredBy: date,
  deliveryLocation: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2_000).optional(),
  lines: z.array(z.object({ boqLineId: uuid, quantity })).min(1).max(200),
}).superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.boqLineId)).size !== value.lines.length) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Each BOQ line can appear only once.' });
  }
});

export const createRfqSchema = z.object({
  vendorIds: z.array(uuid).min(1).max(20),
  responseDueDate: date,
  commercialTerms: z.string().trim().min(3).max(2_000),
  expectedVersion: version,
}).superRefine((value, context) => {
  if (new Set(value.vendorIds).size !== value.vendorIds.length) {
    context.addIssue({ code: 'custom', path: ['vendorIds'], message: 'Choose each vendor only once.' });
  }
});

const offerLineSchema = z.object({
  rfqLineId: uuid,
  unitRate: money,
  brandOffered: z.string().trim().min(1).max(160),
  specificationOffered: z.string().trim().min(2).max(2_000),
  equivalence: z.enum(['equivalent', 'deviation', 'unknown']),
  deviationNotes: z.string().trim().max(1_000).optional(),
}).superRefine((value, context) => {
  if (value.equivalence === 'deviation' && !value.deviationNotes) {
    context.addIssue({ code: 'custom', path: ['deviationNotes'], message: 'Describe every technical deviation.' });
  }
});

export const createVendorOfferSchema = z.object({
  vendorId: uuid,
  vendorReference: z.string().trim().min(2).max(160),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.'),
  taxBasis: z.string().trim().min(2).max(500),
  freightAmount: money,
  leadTimeDays: z.coerce.number().int().min(0).max(3_650).optional(),
  paymentTerms: z.string().trim().min(2).max(1_000),
  warranty: z.string().trim().min(2).max(500),
  validUntil: date.optional(),
  lines: z.array(offerLineSchema).min(1).max(200),
}).superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.rfqLineId)).size !== value.lines.length) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Each RFQ line can appear only once.' });
  }
});

export const selectVendorOfferSchema = z.object({
  offerId: uuid,
  selectionReason: z.string().trim().min(3).max(2_000),
  singleSourceExceptionReason: z.string().trim().min(3).max(2_000).optional(),
  expectedVersion: version,
});

export const substitutionReviewListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['requisitionNumber', 'vendorName', 'itemName', 'status', 'updatedAt']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const substitutionReviewParamsSchema = z.object({ requisitionId: uuid, offerLineId: uuid });

export const substitutionDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(3).max(2_000),
});
