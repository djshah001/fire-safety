import { z } from 'zod';

const uuid = z.uuid();
const date = z.iso.date();

export const projectParamsSchema = z.object({ projectId: uuid });
export const projectStartOptionsParamsSchema = z.object({ jobId: uuid });

export const projectListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['started', 'on_hold', 'completed', 'cancelled']).optional(),
  commercialState: z.enum(['unawarded', 'quoted', 'awarded', 'lost', 'on_hold']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['projectNumber', 'title', 'status', 'startDate', 'targetCompletionDate']).default('startDate'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const startProjectSchema = z.object({
  title: z.string().trim().min(3).max(200),
  designRevisionId: uuid,
  boqRevisionId: uuid.optional(),
  projectManagerUserId: uuid,
  memberUserIds: z.array(uuid).max(25).default([]),
  startDate: date,
  targetCompletionDate: date,
  startReason: z.string().trim().min(5).max(1_000),
  idempotencyKey: z.uuid(),
}).superRefine((value, context) => {
  if (value.targetCompletionDate < value.startDate) {
    context.addIssue({ code: 'custom', path: ['targetCompletionDate'], message: 'Target completion cannot be before the start date.' });
  }
  if (new Set(value.memberUserIds).size !== value.memberUserIds.length) {
    context.addIssue({ code: 'custom', path: ['memberUserIds'], message: 'Project members must be unique.' });
  }
});
