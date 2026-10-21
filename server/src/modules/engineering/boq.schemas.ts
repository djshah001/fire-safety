import { z } from 'zod';

const uuid = z.uuid();
const version = z.coerce.number().int().positive();
const decimal = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/, 'Enter a positive decimal with at most four decimal places.').refine((value) => Number(value) > 0, 'Value must be greater than zero.');
const money = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places.');

export const boqParamsSchema = z.object({ jobId: uuid, boqId: uuid });
export const boqLineParamsSchema = z.object({ jobId: uuid, boqId: uuid, lineId: uuid });

export const createBoqSchema = z.object({
  designRevisionId: uuid,
  sourceBoqRevisionId: uuid.optional(),
  title: z.string().trim().min(2).max(200),
  changeSummary: z.string().trim().min(2).max(1_000),
});

export const boqQuantityInputSchema = z.object({
  quantity: decimal,
  expectedBoqVersion: version,
  expectedLineVersion: version,
});

export const estimateLineInputSchema = z.object({
  boqLineId: uuid.optional(),
  category: z.enum(['material', 'labour', 'transport', 'subcontracting', 'overhead', 'wastage', 'margin']),
  description: z.string().trim().min(2).max(300),
  quantity: decimal,
  unitRate: money,
  notes: z.string().trim().max(1_000).optional(),
  expectedBoqVersion: version,
  expectedLineVersion: version.optional(),
});
export const estimateLineUpdateSchema = estimateLineInputSchema.extend({ expectedLineVersion: version });

export const versionInputSchema = z.object({ expectedVersion: version });
export const deleteLineSchema = z.object({ expectedBoqVersion: version, expectedLineVersion: version });
export const boqReviewSchema = z.object({
  decision: z.enum(['approved', 'returned']),
  reason: z.string().trim().max(1_000).optional(),
  expectedVersion: version,
}).superRefine((value, context) => {
  if (value.decision === 'returned' && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'A return reason is required.' });
});

export const boqTemplateParamsSchema = z.object({ templateId: uuid });
export const boqTemplateInputSchema = z.object({
  sectorId: uuid,
  name: z.string().trim().min(2).max(160),
  costingUserId: uuid,
  purchaseHeadUserId: uuid,
  adminApproverUserId: uuid,
  expectedVersion: version.optional(),
  items: z.array(z.object({
    itemId: uuid,
    section: z.string().trim().min(1).max(120),
  })).min(1).max(200),
}).superRefine((value, context) => {
  const people = [value.costingUserId, value.purchaseHeadUserId, value.adminApproverUserId];
  if (new Set(people).size !== people.length) {
    context.addIssue({ code: 'custom', path: ['costingUserId'], message: 'Costing, purchase approval and final approval must use different employees.' });
  }
  const itemIds = value.items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Each inventory item may appear once in a sector template.' });
  }
});

export const itemCatalogQuerySchema = z.object({ search: z.string().trim().max(120).optional() });
