import { z } from 'zod';

export const notificationParamsSchema = z.object({ notificationId: z.uuid() });

export const notificationListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'unread', 'read']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['createdAt', 'severity']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const markNotificationReadSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});
