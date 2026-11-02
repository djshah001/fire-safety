import { z } from 'zod';

const uuid = z.uuid();
const expectedVersion = z.coerce.number().int().positive();

export const designJobParamsSchema = z.object({ jobId: uuid });
export const revisionParamsSchema = z.object({ jobId: uuid, revisionId: uuid });
export const designFileParamsSchema = z.object({ jobId: uuid, revisionId: uuid, fileId: uuid });
export const surveyRevisionParamsSchema = z.object({ jobId: uuid, surveyRevisionId: uuid });
export const surveyFileParamsSchema = z.object({ jobId: uuid, surveyRevisionId: uuid, fileId: uuid });

export const designJobListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['awaiting_designer', 'authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['title', 'status', 'updatedAt']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const assignDesignerSchema = z.object({
  designerUserId: uuid,
  expectedVersion,
});

export const useDesignBufferSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  expectedVersion,
});

export const createRevisionSchema = z.object({
  title: z.string().trim().min(2).max(200),
  changeSummary: z.string().trim().min(2).max(1_000),
  expectedJobVersion: expectedVersion,
});

export const createSurveyRevisionSchema = z.object({
  title: z.string().trim().min(2).max(200),
  changeSummary: z.string().trim().min(2).max(1_000),
  surveyedOn: z.iso.date(),
});

export const finalizeSurveyRevisionSchema = z.object({ expectedVersion });

export const submitRevisionSchema = z.object({ expectedVersion });

export const reviewRevisionSchema = z.object({
  decision: z.enum(['approved', 'returned']),
  reason: z.string().trim().max(1_000).optional(),
  expectedVersion,
}).superRefine((value, context) => {
  if (value.decision === 'returned' && !value.reason) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A return reason is required.' });
  }
});

export const sendToCustomerSchema = z.object({ expectedVersion });

export const customerDecisionSchema = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  evidenceReference: z.string().trim()
    .min(3, 'Enter a traceable evidence reference of at least 3 characters.')
    .max(1_000, 'Evidence reference must be 1,000 characters or fewer.'),
  notes: z.string().trim().max(1_000, 'Notes must be 1,000 characters or fewer.').optional(),
  expectedVersion,
});
