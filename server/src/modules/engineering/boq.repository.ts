import { and, asc, desc, eq, ilike, inArray, max, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqLines,
  boqReviewActions,
  boqRevisionContributors,
  boqRevisions,
  boqTemplateItems,
  boqTemplates,
  designJobs,
  designPackageRevisions,
  estimateCostLines,
  itemCategories,
  itemFamilies,
  items,
  leads,
  marketSectors,
  units,
  users,
} from '../../infrastructure/database/schema/index.js';

export function createBoqRepository(executor: DatabaseExecutor) {
  return {
    listTemplates(companyId: string) {
      return executor.select({
        id: boqTemplates.id,
        sectorId: boqTemplates.sectorId,
        sectorName: marketSectors.name,
        name: boqTemplates.name,
        costingUserId: boqTemplates.costingUserId,
        costingUserName: sql<string>`(select ${users.name} from ${users} where ${users.id} = ${boqTemplates.costingUserId})`,
        purchaseHeadUserId: boqTemplates.purchaseHeadUserId,
        purchaseHeadUserName: sql<string>`(select ${users.name} from ${users} where ${users.id} = ${boqTemplates.purchaseHeadUserId})`,
        adminApproverUserId: boqTemplates.adminApproverUserId,
        adminApproverUserName: sql<string>`(select ${users.name} from ${users} where ${users.id} = ${boqTemplates.adminApproverUserId})`,
        status: boqTemplates.status,
        rowVersion: boqTemplates.rowVersion,
        updatedAt: boqTemplates.updatedAt,
      }).from(boqTemplates)
        .innerJoin(marketSectors, eq(marketSectors.id, boqTemplates.sectorId))
        .where(eq(boqTemplates.companyId, companyId))
        .orderBy(asc(marketSectors.name));
    },

    async findTemplate(companyId: string, templateId: string) {
      const [row] = await executor.select().from(boqTemplates).where(and(
        eq(boqTemplates.companyId, companyId), eq(boqTemplates.id, templateId),
      )).limit(1);
      return row;
    },

    async findTemplateBySector(companyId: string, sectorId: string) {
      const [row] = await executor.select().from(boqTemplates).where(and(
        eq(boqTemplates.companyId, companyId), eq(boqTemplates.sectorId, sectorId),
      )).limit(1);
      return row;
    },

    async findActiveTemplateForJob(companyId: string, jobId: string) {
      const [row] = await executor.select({ template: boqTemplates, sectorName: marketSectors.name })
        .from(designJobs)
        .innerJoin(leads, eq(leads.id, designJobs.leadId))
        .innerJoin(marketSectors, eq(marketSectors.id, leads.sectorId))
        .innerJoin(boqTemplates, and(eq(boqTemplates.sectorId, leads.sectorId), eq(boqTemplates.status, 'active')))
        .where(and(eq(designJobs.companyId, companyId), eq(designJobs.id, jobId), eq(boqTemplates.companyId, companyId)))
        .limit(1);
      return row;
    },

    listTemplateItems(companyId: string, templateId: string) {
      return executor.select({
        id: boqTemplateItems.id,
        itemId: boqTemplateItems.itemId,
        section: boqTemplateItems.section,
        sortOrder: boqTemplateItems.sortOrder,
        itemCode: items.code,
        itemName: items.name,
        specification: items.specification,
        itemStatus: items.status,
        unitId: units.id,
        unitSymbol: units.symbol,
        unitStatus: units.status,
        allowFractional: units.allowFractional,
      }).from(boqTemplateItems)
        .innerJoin(items, eq(items.id, boqTemplateItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .where(and(eq(boqTemplateItems.companyId, companyId), eq(boqTemplateItems.templateId, templateId)))
        .orderBy(asc(boqTemplateItems.sortOrder));
    },

    async createTemplate(input: typeof boqTemplates.$inferInsert) {
      const [row] = await executor.insert(boqTemplates).values(input).returning();
      return row!;
    },

    async updateTemplate(companyId: string, templateId: string, expectedVersion: number, values: Partial<typeof boqTemplates.$inferInsert>) {
      const [row] = await executor.update(boqTemplates).set({
        ...values, rowVersion: sql`${boqTemplates.rowVersion} + 1`, updatedAt: new Date(),
      }).where(and(eq(boqTemplates.companyId, companyId), eq(boqTemplates.id, templateId),
        eq(boqTemplates.rowVersion, expectedVersion))).returning();
      return row;
    },

    async replaceTemplateItems(companyId: string, templateId: string, values: Array<{ itemId: string; section: string }>) {
      await executor.delete(boqTemplateItems).where(and(
        eq(boqTemplateItems.companyId, companyId), eq(boqTemplateItems.templateId, templateId),
      ));
      await executor.insert(boqTemplateItems).values(values.map((value, index) => ({
        companyId, templateId, itemId: value.itemId, section: value.section, sortOrder: index + 1,
      })));
    },
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

    async listActiveTemplatesSummary(companyId: string) {
      const templates = await executor.select({
        id: boqTemplates.id,
        sectorId: boqTemplates.sectorId,
        sectorName: marketSectors.name,
        name: boqTemplates.name,
      }).from(boqTemplates)
        .innerJoin(marketSectors, eq(marketSectors.id, boqTemplates.sectorId))
        .where(and(eq(boqTemplates.companyId, companyId), eq(boqTemplates.status, 'active')))
        .orderBy(asc(marketSectors.name), asc(boqTemplates.name));
      if (templates.length === 0) return [];
      const counts = await executor.select({
        templateId: boqTemplateItems.templateId,
        count: sql<number>`count(*)::int`,
      }).from(boqTemplateItems)
        .where(and(eq(boqTemplateItems.companyId, companyId), inArray(boqTemplateItems.templateId, templates.map((t) => t.id))))
        .groupBy(boqTemplateItems.templateId);
      const countMap = new Map(counts.map((c) => [c.templateId, Number(c.count)]));
      return templates.map((t) => ({ ...t, itemCount: countMap.get(t.id) ?? 0 }));
    },

    async listActiveItems(companyId: string, search?: string) {
      return executor.select({
        id: items.id,
        code: items.code,
        name: items.name,
        specification: items.specification,
        categoryId: itemCategories.id,
        categoryName: itemCategories.name,
        familyId: itemFamilies.id,
        familyName: itemFamilies.name,
        unitId: units.id,
        unitName: units.name,
        unitSymbol: units.symbol,
        allowFractional: units.allowFractional,
      }).from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
        .leftJoin(itemFamilies, eq(itemFamilies.id, items.familyId))
        .where(and(
          eq(items.companyId, companyId), eq(items.status, 'active'), eq(units.status, 'active'),
          search ? or(ilike(items.code, `%${search}%`), ilike(items.name, `%${search}%`), ilike(items.specification, `%${search}%`), ilike(itemCategories.name, `%${search}%`), ilike(itemFamilies.name, `%${search}%`)) : undefined,
        )).orderBy(asc(items.name), asc(items.id)).limit(search ? 150 : 300);
    },

    async findActiveItem(companyId: string, itemId: string) {
      const [item] = await executor.select({
        id: items.id,
        code: items.code,
        name: items.name,
        specification: items.specification,
        categoryName: itemCategories.name,
        familyName: itemFamilies.name,
        unitId: units.id,
        unitName: units.name,
        unitSymbol: units.symbol,
        allowFractional: units.allowFractional,
      }).from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
        .leftJoin(itemFamilies, eq(itemFamilies.id, items.familyId))
        .where(and(
          eq(items.companyId, companyId), eq(items.id, itemId), eq(items.status, 'active'), eq(units.status, 'active'),
        )).limit(1);
      return item;
    },

    async findRevisionById(companyId: string, boqId: string) {
      const [revision] = await executor.select().from(boqRevisions).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.id, boqId),
      )).limit(1);
      return revision;
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

    async addContributor(companyId: string, boqId: string, userId: string, contribution: 'quantity' | 'costing') {
      await executor.insert(boqRevisionContributors).values({
        companyId, boqRevisionId: boqId, userId, contribution,
      }).onConflictDoUpdate({
        target: [boqRevisionContributors.boqRevisionId, boqRevisionContributors.userId],
        set: { contribution },
      });
    },

    async hasContributor(companyId: string, boqId: string, userId: string) {
      const [row] = await executor.select({ userId: boqRevisionContributors.userId })
        .from(boqRevisionContributors).where(and(
          eq(boqRevisionContributors.companyId, companyId),
          eq(boqRevisionContributors.boqRevisionId, boqId),
          eq(boqRevisionContributors.userId, userId),
        )).limit(1);
      return Boolean(row);
    },

    listLines(companyId: string, boqId: string) {
      return executor.select().from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId))).orderBy(asc(boqLines.sortOrder), asc(boqLines.id));
    },

    async listLineMeta(companyId: string, boqId: string) {
      return executor.select({
        lineId: boqLines.id,
        categoryId: itemCategories.id,
        categoryName: itemCategories.name,
        familyName: itemFamilies.name,
        allowFractional: units.allowFractional,
      }).from(boqLines)
        .innerJoin(items, eq(items.id, boqLines.itemId))
        .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
        .innerJoin(units, eq(units.id, boqLines.unitId))
        .leftJoin(itemFamilies, eq(itemFamilies.id, items.familyId))
        .where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId)));
    },

    async listUnitsByIds(companyId: string, unitIds: string[]) {
      if (unitIds.length === 0) return [];
      return executor.select().from(units).where(and(eq(units.companyId, companyId), inArray(units.id, unitIds)));
    },

    async findLine(companyId: string, boqId: string, lineId: string) {
      const [line] = await executor.select().from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId))).limit(1);
      return line;
    },

    async nextLineNumber(companyId: string, boqId: string) {
      const [row] = await executor.select({
        lineNumber: max(boqLines.lineNumber),
        sortOrder: max(boqLines.sortOrder),
      }).from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId)));
      return Math.max(Number(row?.lineNumber ?? 0), Number(row?.sortOrder ?? 0)) + 1;
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

    async updateLineUnchecked(companyId: string, boqId: string, lineId: string, values: Partial<typeof boqLines.$inferInsert>) {
      const [row] = await executor.update(boqLines).set({ ...values, rowVersion: sql`${boqLines.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId),
      )).returning();
      return row;
    },

    async deleteLine(companyId: string, boqId: string, lineId: string, expectedVersion: number) {
      const [row] = await executor.delete(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId), eq(boqLines.rowVersion, expectedVersion))).returning();
      return row;
    },

    async deleteLineById(companyId: string, boqId: string, lineId: string) {
      const [row] = await executor.delete(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, lineId))).returning();
      return row;
    },

    async deleteLinesByIds(companyId: string, boqId: string, lineIds: string[]) {
      if (lineIds.length === 0) return [];
      return executor.delete(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), inArray(boqLines.id, lineIds))).returning();
    },

    async deleteAllLines(companyId: string, boqId: string) {
      await executor.delete(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId)));
    },

    async renumberLines(companyId: string, boqId: string, orderedIds?: string[]) {
      const current = await executor.select({ id: boqLines.id }).from(boqLines)
        .where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId)))
        .orderBy(asc(boqLines.sortOrder), asc(boqLines.id));
      const ids = orderedIds ?? current.map((row) => row.id);
      if (ids.length === 0) return;
      await executor.update(boqLines).set({
        lineNumber: sql`${boqLines.lineNumber} + 1000000`,
        sortOrder: sql`${boqLines.sortOrder} + 1000000`,
      }).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId)));
      const now = new Date();
      for (const [index, id] of ids.entries()) {
        await executor.update(boqLines).set({
          lineNumber: index + 1,
          sortOrder: index + 1,
          rowVersion: sql`${boqLines.rowVersion} + 1`,
          updatedAt: now,
        }).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqId), eq(boqLines.id, id)));
      }
    },

    async listEstimateLines(companyId: string, boqId: string) {
      const rows = await executor.select({ line: estimateCostLines })
        .from(estimateCostLines)
        .leftJoin(boqLines, eq(boqLines.id, estimateCostLines.boqLineId))
        .where(and(eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId)))
        .orderBy(
          asc(sql`coalesce(${boqLines.sortOrder}, ${estimateCostLines.lineNumber})`),
          asc(estimateCostLines.lineNumber),
          desc(estimateCostLines.isPreferredOfferingSnapshot),
          asc(estimateCostLines.brandNameSnapshot),
          asc(estimateCostLines.manufacturerModelSnapshot),
        );
      return rows.map((row) => row.line);
    },

    async deleteEstimateLinesForRevision(companyId: string, boqId: string) {
      await executor.delete(estimateCostLines).where(and(eq(estimateCostLines.companyId, companyId), eq(estimateCostLines.boqRevisionId, boqId)));
    },

    async updateRevisionMetadata(companyId: string, boqId: string, expectedVersion: number, status: 'draft' | 'costing', values: Partial<typeof boqRevisions.$inferInsert>) {
      const [row] = await executor.update(boqRevisions).set({ ...values, rowVersion: sql`${boqRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.id, boqId), eq(boqRevisions.rowVersion, expectedVersion), eq(boqRevisions.status, status),
      )).returning();
      return row;
    },

    async updateRevisionChain(
      companyId: string,
      boqId: string,
      expectedVersion: number,
      values: Pick<typeof boqRevisions.$inferInsert, 'costingUserId' | 'purchaseHeadUserId' | 'adminApproverUserId'>,
    ) {
      const [row] = await executor.update(boqRevisions).set({
        ...values,
        rowVersion: sql`${boqRevisions.rowVersion} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(boqRevisions.companyId, companyId),
        eq(boqRevisions.id, boqId),
        eq(boqRevisions.rowVersion, expectedVersion),
        sql`${boqRevisions.status} <> 'approved'`,
      )).returning();
      return row;
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

    async bumpRevision(companyId: string, boqId: string, expectedVersion: number, status: 'draft' | 'costing') {
      const [row] = await executor.update(boqRevisions).set({ rowVersion: sql`${boqRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.id, boqId), eq(boqRevisions.rowVersion, expectedVersion), eq(boqRevisions.status, status),
      )).returning();
      return row;
    },

    async transitionRevision(companyId: string, boqId: string, expectedVersion: number, from: typeof boqRevisions.$inferSelect.status, values: Partial<typeof boqRevisions.$inferInsert>) {
      const [row] = await executor.update(boqRevisions).set({ ...values, rowVersion: sql`${boqRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.id, boqId), eq(boqRevisions.rowVersion, expectedVersion), eq(boqRevisions.status, from),
      )).returning();
      return row;
    },

    async createReview(input: typeof boqReviewActions.$inferInsert) {
      const [row] = await executor.insert(boqReviewActions).values(input).returning();
      return row!;
    },

    listReviews(companyId: string, boqId: string) {
      return executor.select().from(boqReviewActions).where(and(
        eq(boqReviewActions.companyId, companyId), eq(boqReviewActions.boqRevisionId, boqId),
      )).orderBy(asc(boqReviewActions.actedAt));
    },
  };
}
