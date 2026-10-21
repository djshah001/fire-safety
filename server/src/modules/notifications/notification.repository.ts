import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import { notifications } from '../../infrastructure/database/schema/index.js';

export type CreateNotificationInput = typeof notifications.$inferInsert;

export function createNotificationRepository(executor: DatabaseExecutor) {
  return {
    async create(input: CreateNotificationInput) {
      const [notification] = await executor.insert(notifications).values(input).onConflictDoNothing().returning();
      return notification;
    },

    async createMany(inputs: CreateNotificationInput[]) {
      if (inputs.length === 0) return [];
      return executor.insert(notifications).values(inputs).onConflictDoNothing().returning();
    },

    async list(companyId: string, recipientUserId: string, input: {
      search?: string; status: 'all' | 'unread' | 'read'; limit: number; offset: number;
      sort: 'createdAt' | 'severity'; direction: 'asc' | 'desc';
    }) {
      const filters = [eq(notifications.companyId, companyId), eq(notifications.recipientUserId, recipientUserId)];
      if (input.status === 'unread') filters.push(isNull(notifications.readAt));
      if (input.status === 'read') filters.push(isNotNull(notifications.readAt));
      if (input.search) filters.push(or(ilike(notifications.title, `%${input.search}%`), ilike(notifications.message, `%${input.search}%`))!);
      const where = and(...filters);
      const sortColumn = input.sort === 'severity' ? notifications.severity : notifications.createdAt;
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);
      const [items, totals] = await Promise.all([
        executor.select().from(notifications).where(where).orderBy(order, desc(notifications.createdAt), desc(notifications.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(notifications).where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async summary(companyId: string, recipientUserId: string) {
      const scope = and(eq(notifications.companyId, companyId), eq(notifications.recipientUserId, recipientUserId));
      const [latest, unread] = await Promise.all([
        executor.select().from(notifications).where(scope).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(8),
        executor.select({ value: count() }).from(notifications).where(and(scope, isNull(notifications.readAt))),
      ]);
      return { items: latest, unreadCount: Number(unread[0]?.value ?? 0) };
    },

    async markRead(companyId: string, recipientUserId: string, id: string, expectedVersion: number, now: Date) {
      const [updated] = await executor.update(notifications).set({
        readAt: now,
        rowVersion: sql`${notifications.rowVersion} + 1`,
      }).where(and(
        eq(notifications.companyId, companyId),
        eq(notifications.recipientUserId, recipientUserId),
        eq(notifications.id, id),
        eq(notifications.rowVersion, expectedVersion),
      )).returning();
      return updated;
    },

    async markAllRead(companyId: string, recipientUserId: string, now: Date) {
      return executor.update(notifications).set({
        readAt: now,
        rowVersion: sql`${notifications.rowVersion} + 1`,
      }).where(and(
        eq(notifications.companyId, companyId),
        eq(notifications.recipientUserId, recipientUserId),
        isNull(notifications.readAt),
      )).returning({ id: notifications.id });
    },
  };
}
