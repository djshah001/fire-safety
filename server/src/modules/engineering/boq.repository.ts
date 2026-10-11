import { and, asc, desc, eq, ilike, max, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqLines,
  boqReviewActions,
  boqRevisions,
  designPackageRevisions,
  estimateCostLines,
  items,
  units,
} from '../../infrastructure/database/schema/index.js';

export function createBoqRepository(executor: DatabaseExecutor) {
  return {
    listEligibleDesignRevisions(companyId: string, jobId: string) {
      return executor.select({
        id: designPackageRevisions.id,
        revisionNumber: designPackageRevisions.revisionNumber,
        title: designPackageRevisions.title,
        status: designPackageRevisions.status,
      }).from(designPackageRevisions).where(and(
        eq(designPackageRevisions.companyId, companyId),
        eq(designPackageRevisions.designJobId, jobId),
        eq(designPackageRevisions.status, 'customer_approved'),
      )).orderBy(desc(designPackageRevisions.revisionNumber));
    },

    async listActiveItems(companyId: string, search?: string) {
      return executor.select({
        id: items.id, code: items.code, name: items.name, specification: items.specification,
        unitId: units.id, unitName: units.name, unitSymbol: units.symbol,
      }).from(items).innerJoin(units, eq(units.id, items.unitId)).where(and(
        eq(items.companyId, companyId), eq(items.status, 'active'), eq(units.status, 'active'),
        search ? or(ilike(items.code, `%${search}%`), ilike(items.name, `%${search}%`), ilike(items.specification, `%${search}%`)) : undefined,
      )).orderBy(asc(items.name), asc(items.id)).limit(100);
    },

    async findActiveItem(companyId: string, itemId: string) {
      const [item] = await executor.select({
        id: items.id, code: items.code, name: items.name, specification: items.specification,
        unitId: units.id, unitSymbol: units.symbol,
      }).from(items).innerJoin(units, eq(units.id, items.unitId)).where(and(
        eq(items.companyId, companyId), eq(items.id, itemId), eq(items.status, 'active'), eq(units.status, 'active'),
      )).limit(1);
      return item;
    },

    listRevisions(companyId: string, jobId: string) {
      return executor.select().from(boqRevisions).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.designJobId, jobId),
      )).orderBy(desc(boqRevisions.revisionNumber));
    },

    async findRevision(companyId: string, jobId: string, boqId: string) {
      const [revision] = await executor.select().from(boqRevisions).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.designJobId, jobId), eq(boqRevisions.id, boqId),
      )).limit(1);
      return revision;
    },

    async nextRevisionNumber(companyId: string, jobId: string) {
      const [row] = await executor.select({ value: max(boqRevisions.revisionNumber) }).from(boqRevisions).where(and(eq(boqRevisions.companyId, companyId), eq(boqRevisions.designJobId, jobId)));
      return Number(row?.value ?? 0) + 1;
    },

    async createRevision(input: typeof boqRevisions.$inferInsert) {
      const [row] = await executor.insert(boqRevisions).values(input).returning();
      return row!;
    },

    listLines(companyId: string, boqId: string) {
      return executor.select().from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId))).orderBy(asc(boqLines.lineNumber));
    },

    async findLine(companyId: string, boqId: string, lineId: string) {
      const [line] = await executor.select().from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId))).limit(1);
      return line;
    },

    async nextLineNumber(companyId: string, boqId: string) {
      const [row] = await executor.select({ value: max(boqLines.lineNumber) }).from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId)));
      return Number(row?.value ?? 0) + 1;
    },

    async createLine(input: typeof boqLines.$inferInsert) {
      const [row] = await executor.insert(boqLines).values(input).returning();
      return row!;
    },

    async updateLine(companyId: string, boqId: string, lineId: string, expectedVersion: number, values: Partial<typeof boqLines.$inferInsert>) {
      const [row] = await executor.update(boqLines).set({ ...values, rowVersion: sql`${boqLines.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId), eq(boqLines.rowVersion, expectedVersion),
      )).returning();
      return row;
    },

    async deleteLine(companyId: string, boqId: string, lineId: string, expectedVersion: number) {
      const [row] = await executor.delete(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId), eq(boqLines.rowVersion, expectedVersion))).returning();
      return row;
    },

    listEstimateLines(companyId: string, boqId: string) {
      return executor.select().from(estimateCostLines).where(and(eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId))).orderBy(asc(estimateCostLines.lineNumber));
    },

    async findEstimateLine(companyId: string, boqId: string, lineId: string) {
      const [line] = await executor.select().from(estimateCostLines).where(and(eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId), eq(estimateCostLines.id, lineId))).limit(1);
      return line;
    },

    async hasEstimateForBoqLine(companyId: string, boqId: string, boqLineId: string) {
      const [line] = await executor.select({ id: estimateCostLines.id }).from(estimateCostLines).where(and(
        eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId), eq(estimateCostLines.boqLineId, boqLineId),
      )).limit(1);
      return Boolean(line);
    },

    async nextEstimateLineNumber(companyId: string, boqId: string) {
      const [row] = await executor.select({ value: max(estimateCostLines.lineNumber) }).from(estimateCostLines).where(and(eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId)));
      return Number(row?.value ?? 0) + 1;
    },

    async createEstimateLine(input: typeof estimateCostLines.$inferInsert) {
      const [row] = await executor.insert(estimateCostLines).values(input).returning();
      return row!;
    },

    async updateEstimateLine(companyId: string, boqId: string, lineId: string, expectedVersion: number, values: Partial<typeof estimateCostLines.$inferInsert>) {
      const [row] = await executor.update(estimateCostLines).set({ ...values, rowVersion: sql`${estimateCostLines.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId), eq(estimateCostLines.id, lineId), eq(estimateCostLines.rowVersion, expectedVersion),
      )).returning();
      return row;
    },

    async deleteEstimateLine(companyId: string, boqId: string, lineId: string, expectedVersion: number) {
      const [row] = await executor.delete(estimateCostLines).where(and(eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId), eq(estimateCostLines.id, lineId), eq(estimateCostLines.rowVersion, expectedVersion))).returning();
      return row;
    },

    async bumpRevision(companyId: string, boqId: string, expectedVersion: number) {
      const [row] = await executor.update(boqRevisions).set({ rowVersion: sql`${boqRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.id, boqId), eq(boqRevisions.rowVersion, expectedVersion), eq(boqRevisions.status, 'draft'),
      )).returning();
      return row;
    },

    async transitionRevision(companyId: string, boqId: string, expectedVersion: number, from: 'draft' | 'submitted', values: Partial<typeof boqRevisions.$inferInsert>) {
      const [row] = await executor.update(boqRevisions).set({ ...values, rowVersion: sql`${boqRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.id, boqId), eq(boqRevisions.rowVersion, expectedVersion), eq(boqRevisions.status, from),
      )).returning();
      return row;
    },

    async createReview(input: typeof boqReviewActions.$inferInsert) {
      const [row] = await executor.insert(boqReviewActions).values(input).returning();
      return row!;
    },

    async findReview(companyId: string, boqId: string) {
      const [row] = await executor.select().from(boqReviewActions).where(and(eq(boqReviewActions.companyId, companyId), eq(boqReviewActions.boqRevisionId, boqId))).limit(1);
      return row;
    },
  };
}
