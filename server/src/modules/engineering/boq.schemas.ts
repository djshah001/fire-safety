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

export const boqLineInputSchema = z.object({
  itemId: uuid,
  section: z.string().trim().min(1).max(120),
  specification: z.string().trim().min(1).max(2_000),
  brand: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  quantity: decimal,
  drawingReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1_000).optional(),
  expectedBoqVersion: version,
  expectedLineVersion: version.optional(),
});
export const boqLineUpdateSchema = boqLineInputSchema.extend({ expectedLineVersion: version });

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

export const itemCatalogQuerySchema = z.object({ search: z.string().trim().max(120).optional() });
