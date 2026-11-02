import { administratorScope } from '../../core/security/administrator.js';
import { and, asc, count, desc, eq, exists, ilike, inArray, max, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqLines,
  boqRevisions,
  customers,
  companies,
  designJobs,
  documentCounters,
  estimateCostLines,
  leads,
  leadMembers,
  opportunities,
  opportunityMembers,
  quotationCustomerDecisions,
  quotationIssueDocuments,
  quotationLines,
  quotationReviewActions,
  quotationRevisionContributors,
  quotationRevisions,
  quotations,
} from '../../infrastructure/database/schema/index.js';

export function createQuotationRepository(executor: DatabaseExecutor) {
  return {
    async listQueue(access: { companyId: string; userId: string }, input: { search?: string; status?: typeof quotationRevisions.$inferSelect.status; limit: number; offset: number; sort: 'quotationNumber' | 'title' | 'status' | 'updatedAt' | 'grandTotal'; direction: 'asc' | 'desc' }) {
      const latestNumbers = executor.select({
        quotationId: quotationRevisions.quotationId,
        revisionNumber: max(quotationRevisions.revisionNumber).as('latest_revision_number'),
      }).from(quotationRevisions).groupBy(quotationRevisions.quotationId).as('latest_quotation_numbers');
      const latest = alias(quotationRevisions, 'latest_quotation_revision');
      const accessFilter = or(
        administratorScope(access.companyId, access.userId),
        exists(executor.select({ value: sql`1` }).from(boqRevisions).where(and(eq(boqRevisions.designJobId, designJobs.id), eq(boqRevisions.companyId, access.companyId), or(eq(boqRevisions.costingUserId, access.userId), eq(boqRevisions.purchaseHeadUserId, access.userId))))),
        eq(designJobs.designerUserId, access.userId),
        eq(designJobs.designHeadUserId, access.userId),
        exists(executor.select({ value: sql`1` }).from(leadMembers).where(and(
          eq(leadMembers.leadId, designJobs.leadId), eq(leadMembers.companyId, access.companyId), eq(leadMembers.userId, access.userId),
        ))),
        exists(executor.select({ value: sql`1` }).from(opportunityMembers).where(and(
          eq(opportunityMembers.opportunityId, designJobs.opportunityId), eq(opportunityMembers.companyId, access.companyId), eq(opportunityMembers.userId, access.userId),
        ))),
      );
      const filters = [eq(designJobs.companyId, access.companyId), accessFilter!];
      if (input.status) filters.push(eq(latest.status, input.status));
      if (input.search) filters.push(or(
        ilike(designJobs.title, `%${input.search}%`), ilike(leads.leadNumber, `%${input.search}%`), ilike(quotations.quotationNumber, `%${input.search}%`),
      )!);
      const where = and(...filters);
      const sortColumn = input.sort === 'quotationNumber' ? quotations.quotationNumber
        : input.sort === 'title' ? designJobs.title
          : input.sort === 'status' ? latest.status
            : input.sort === 'grandTotal' ? latest.grandTotal
              : latest.updatedAt;
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);
      const baseFields = {
        jobId: designJobs.id,
        jobTitle: designJobs.title,
        leadNumber: leads.leadNumber,
        opportunityCommercialState: opportunities.commercialState,
        quotationId: quotations.id,
        quotationNumber: quotations.quotationNumber,
        revisionId: latest.id,
        revisionNumber: latest.revisionNumber,
        status: latest.status,
        currency: latest.currency,
        grandTotal: latest.grandTotal,
        updatedAt: latest.updatedAt,
      };
      const from = () => executor.select(baseFields).from(designJobs)
        .innerJoin(leads, eq(leads.id, designJobs.leadId))
        .innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId))
        .leftJoin(quotations, eq(quotations.designJobId, designJobs.id))
        .leftJoin(latestNumbers, eq(latestNumbers.quotationId, quotations.id))
        .leftJoin(latest, and(eq(latest.quotationId, latestNumbers.quotationId), eq(latest.revisionNumber, latestNumbers.revisionNumber)));
      const [items, totals] = await Promise.all([
        from().where(where).orderBy(order, asc(designJobs.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(designJobs)
          .innerJoin(leads, eq(leads.id, designJobs.leadId))
          .innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId))
          .leftJoin(quotations, eq(quotations.designJobId, designJobs.id))
          .leftJoin(latestNumbers, eq(latestNumbers.quotationId, quotations.id))
          .leftJoin(latest, and(eq(latest.quotationId, latestNumbers.quotationId), eq(latest.revisionNumber, latestNumbers.revisionNumber)))
          .where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async findContext(companyId: string, jobId: string) {
      const [row] = await executor.select({
        jobId: designJobs.id,
        jobTitle: designJobs.title,
        opportunityId: opportunities.id,
        opportunityCommercialState: opportunities.commercialState,
        leadId: leads.id,
        leadNumber: leads.leadNumber,
        leadStage: leads.stage,
        customerId: customers.id,
        customerName: customers.displayName,
        companyName: companies.name,
      }).from(designJobs)
        .innerJoin(companies, eq(companies.id, designJobs.companyId))
        .innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId))
        .innerJoin(leads, eq(leads.id, designJobs.leadId))
        .innerJoin(customers, eq(customers.id, opportunities.customerId))
        .where(and(eq(designJobs.companyId, companyId), eq(designJobs.id, jobId))).limit(1);
      return row;
    },

    listApprovedBoqs(companyId: string, jobId: string) {
      return executor.select({
        id: boqRevisions.id,
        revisionNumber: boqRevisions.revisionNumber,
        title: boqRevisions.title,
        designRevisionId: boqRevisions.designRevisionId,
      }).from(boqRevisions).where(and(
        eq(boqRevisions.companyId, companyId),
        eq(boqRevisions.designJobId, jobId),
        eq(boqRevisions.status, 'approved'),
      )).orderBy(desc(boqRevisions.revisionNumber));
    },

    async findApprovedBoq(companyId: string, jobId: string, boqRevisionId: string) {
      const [row] = await executor.select().from(boqRevisions).where(and(
        eq(boqRevisions.companyId, companyId), eq(boqRevisions.designJobId, jobId),
        eq(boqRevisions.id, boqRevisionId), eq(boqRevisions.status, 'approved'),
      )).limit(1);
      return row;
    },

    listBoqLines(companyId: string, boqRevisionId: string) {
      return executor.select().from(boqLines).where(and(
        eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqRevisionId),
      )).orderBy(asc(boqLines.lineNumber));
    },

    listApprovedBoqCostLines(companyId: string, boqRevisionId: string) {
      return executor.select({
        boqLineId: boqLines.id, lineNumber: boqLines.lineNumber, section: boqLines.section,
        itemCodeSnapshot: boqLines.itemCodeSnapshot, itemNameSnapshot: boqLines.itemNameSnapshot,
        specificationSnapshot: boqLines.specificationSnapshot, unitSymbolSnapshot: boqLines.unitSymbolSnapshot,
        quantity: boqLines.quantity, supplyRate: estimateCostLines.supplyRate, labourRate: estimateCostLines.labourRate,
        miscellaneousRate: estimateCostLines.miscellaneousRate, markupPercent: estimateCostLines.markupPercent,
        markupAmount: estimateCostLines.markupAmount, quotedUnitRate: estimateCostLines.quotedUnitRate,
        lineTotal: estimateCostLines.lineTotal, costOptionId: estimateCostLines.id,
        offeringId: estimateCostLines.offeringId, brandId: estimateCostLines.brandIdSnapshot,
        brandName: estimateCostLines.brandNameSnapshot, manufacturerModel: estimateCostLines.manufacturerModelSnapshot,
        manufacturerSku: estimateCostLines.manufacturerSkuSnapshot,
        isPreferred: estimateCostLines.isPreferredOfferingSnapshot,
      }).from(boqLines).innerJoin(estimateCostLines, and(
        eq(estimateCostLines.boqLineId, boqLines.id), eq(estimateCostLines.boqRevisionId, boqRevisionId),
      )).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqRevisionId)))
        .orderBy(asc(boqLines.lineNumber));
    },

    listCostOptionsForBoqLines(companyId: string, boqLineIds: string[]) {
      if (boqLineIds.length === 0) return Promise.resolve([]);
      return executor.select({
        id: estimateCostLines.id, boqLineId: estimateCostLines.boqLineId,
        offeringId: estimateCostLines.offeringId, brandId: estimateCostLines.brandIdSnapshot,
        brandName: estimateCostLines.brandNameSnapshot, manufacturerModel: estimateCostLines.manufacturerModelSnapshot,
        manufacturerSku: estimateCostLines.manufacturerSkuSnapshot,
        isPreferred: estimateCostLines.isPreferredOfferingSnapshot,
        supplyRate: estimateCostLines.supplyRate, labourRate: estimateCostLines.labourRate,
        miscellaneousRate: estimateCostLines.miscellaneousRate, markupPercent: estimateCostLines.markupPercent,
        markupAmount: estimateCostLines.markupAmount, quotedUnitRate: estimateCostLines.quotedUnitRate,
        lineTotal: estimateCostLines.lineTotal,
      }).from(estimateCostLines)
        .where(and(eq(estimateCostLines.companyId, companyId), inArray(estimateCostLines.boqLineId, boqLineIds)))
        .orderBy(desc(estimateCostLines.isPreferredOfferingSnapshot), asc(estimateCostLines.brandNameSnapshot), asc(estimateCostLines.manufacturerModelSnapshot));
    },

    async allocateQuotationNumber(companyId: string, now: Date) {
      const periodKey = String(now.getUTCFullYear());
      const [counter] = await executor.insert(documentCounters).values({
        companyId, documentType: 'QUOTATION', periodKey, nextValue: 2, updatedAt: now,
      }).onConflictDoUpdate({
        target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey],
        set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now },
      }).returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });
      return `FS-QUO-${periodKey}-${String(counter!.allocated).padStart(6, '0')}`;
    },

    async findQuotation(companyId: string, jobId: string) {
      const [row] = await executor.select().from(quotations).where(and(
        eq(quotations.companyId, companyId), eq(quotations.designJobId, jobId),
      )).limit(1);
      return row;
    },

    async createQuotation(input: typeof quotations.$inferInsert) {
      const [row] = await executor.insert(quotations).values(input).returning();
      return row!;
    },

    listRevisions(companyId: string, quotationId: string) {
      return executor.select().from(quotationRevisions).where(and(
        eq(quotationRevisions.companyId, companyId), eq(quotationRevisions.quotationId, quotationId),
      )).orderBy(desc(quotationRevisions.revisionNumber));
    },

    async nextRevisionNumber(companyId: string, quotationId: string) {
      const [row] = await executor.select({ value: max(quotationRevisions.revisionNumber) }).from(quotationRevisions).where(and(
        eq(quotationRevisions.companyId, companyId), eq(quotationRevisions.quotationId, quotationId),
      ));
      return Number(row?.value ?? 0) + 1;
    },

    async createRevision(input: typeof quotationRevisions.$inferInsert) {
      const [row] = await executor.insert(quotationRevisions).values(input).returning();
      return row!;
    },

    async findRevision(companyId: string, jobId: string, revisionId: string) {
      const [row] = await executor.select({ revision: quotationRevisions, quotation: quotations }).from(quotationRevisions)
        .innerJoin(quotations, eq(quotations.id, quotationRevisions.quotationId))
        .where(and(eq(quotationRevisions.companyId, companyId), eq(quotations.designJobId, jobId), eq(quotationRevisions.id, revisionId))).limit(1);
      return row;
    },

    async createLine(input: typeof quotationLines.$inferInsert) {
      const [row] = await executor.insert(quotationLines).values(input).returning();
      return row!;
    },

    listLines(companyId: string, revisionId: string) {
      return executor.select().from(quotationLines).where(and(
        eq(quotationLines.companyId, companyId), eq(quotationLines.quotationRevisionId, revisionId),
      )).orderBy(asc(quotationLines.lineNumber));
    },

    async findLine(companyId: string, revisionId: string, lineId: string) {
      const [row] = await executor.select().from(quotationLines).where(and(
        eq(quotationLines.companyId, companyId), eq(quotationLines.quotationRevisionId, revisionId), eq(quotationLines.id, lineId),
      )).limit(1);
      return row;
    },

    async updateLine(companyId: string, revisionId: string, lineId: string, expectedVersion: number, values: Partial<typeof quotationLines.$inferInsert>) {
      const [row] = await executor.update(quotationLines).set({ ...values, rowVersion: sql`${quotationLines.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(quotationLines.companyId, companyId), eq(quotationLines.quotationRevisionId, revisionId),
        eq(quotationLines.id, lineId), eq(quotationLines.rowVersion, expectedVersion),
      )).returning();
      return row;
    },

    async updateAcceptedPaymentPlan(companyId: string, revisionId: string, expectedVersion: number, values: Pick<typeof quotationRevisions.$inferInsert, 'cashPercentage' | 'nonCashPercentage'>) {
      const [row] = await executor.update(quotationRevisions).set({ ...values, rowVersion: sql`${quotationRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(quotationRevisions.companyId, companyId), eq(quotationRevisions.id, revisionId),
        eq(quotationRevisions.rowVersion, expectedVersion), eq(quotationRevisions.status, 'accepted'),
      )).returning();
      return row;
    },

    async updateDraft(companyId: string, revisionId: string, expectedVersion: number, values: Partial<typeof quotationRevisions.$inferInsert>) {
      const [row] = await executor.update(quotationRevisions).set({ ...values, rowVersion: sql`${quotationRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(quotationRevisions.companyId, companyId), eq(quotationRevisions.id, revisionId),
        eq(quotationRevisions.rowVersion, expectedVersion), eq(quotationRevisions.status, 'draft'),
      )).returning();
      return row;
    },

    async transition(companyId: string, revisionId: string, expectedVersion: number, from: typeof quotationRevisions.$inferSelect.status, values: Partial<typeof quotationRevisions.$inferInsert>) {
      const [row] = await executor.update(quotationRevisions).set({ ...values, rowVersion: sql`${quotationRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(quotationRevisions.companyId, companyId), eq(quotationRevisions.id, revisionId),
        eq(quotationRevisions.rowVersion, expectedVersion), eq(quotationRevisions.status, from),
      )).returning();
      return row;
    },

    async addContributor(companyId: string, revisionId: string, userId: string) {
      await executor.insert(quotationRevisionContributors).values({ companyId, quotationRevisionId: revisionId, userId }).onConflictDoNothing();
    },

    async hasContributor(companyId: string, revisionId: string, userId: string) {
      const [row] = await executor.select({ userId: quotationRevisionContributors.userId }).from(quotationRevisionContributors).where(and(
        eq(quotationRevisionContributors.companyId, companyId),
        eq(quotationRevisionContributors.quotationRevisionId, revisionId),
        eq(quotationRevisionContributors.userId, userId),
      )).limit(1);
      return Boolean(row);
    },

    async createReview(input: typeof quotationReviewActions.$inferInsert) {
      const [row] = await executor.insert(quotationReviewActions).values(input).returning();
      return row!;
    },

    async findReview(companyId: string, revisionId: string) {
      const [row] = await executor.select().from(quotationReviewActions).where(and(
        eq(quotationReviewActions.companyId, companyId), eq(quotationReviewActions.quotationRevisionId, revisionId),
      )).limit(1);
      return row;
    },

    async createIssueDocument(input: typeof quotationIssueDocuments.$inferInsert) {
      const [row] = await executor.insert(quotationIssueDocuments).values(input).returning();
      return row!;
    },

    async findIssueDocument(companyId: string, revisionId: string, documentId?: string) {
      const filters = [eq(quotationIssueDocuments.companyId, companyId), eq(quotationIssueDocuments.quotationRevisionId, revisionId)];
      if (documentId) filters.push(eq(quotationIssueDocuments.id, documentId));
      const [row] = await executor.select().from(quotationIssueDocuments).where(and(...filters)).limit(1);
      return row;
    },

    async createCustomerDecision(input: typeof quotationCustomerDecisions.$inferInsert) {
      const [row] = await executor.insert(quotationCustomerDecisions).values(input).returning();
      return row!;
    },

    async findCustomerDecision(companyId: string, revisionId: string) {
      const [row] = await executor.select().from(quotationCustomerDecisions).where(and(
        eq(quotationCustomerDecisions.companyId, companyId), eq(quotationCustomerDecisions.quotationRevisionId, revisionId),
      )).limit(1);
      return row;
    },

    async setCommercialState(companyId: string, opportunityId: string, state: 'quoted' | 'awarded') {
      const allowed = state === 'quoted' ? ['unawarded'] as const : ['unawarded', 'quoted'] as const;
      const [row] = await executor.update(opportunities).set({ commercialState: state, rowVersion: sql`${opportunities.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(opportunities.companyId, companyId), eq(opportunities.id, opportunityId), inArray(opportunities.commercialState, allowed),
      )).returning();
      return row;
    },

    async setLeadStage(companyId: string, leadId: string, stage: 'commercial_negotiation' | 'won') {
      const allowed = stage === 'commercial_negotiation' ? ['qualified', 'design_authorized'] as const : ['qualified', 'design_authorized', 'commercial_negotiation'] as const;
      const [row] = await executor.update(leads).set({ stage, rowVersion: sql`${leads.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(leads.companyId, companyId), eq(leads.id, leadId), inArray(leads.stage, allowed),
      )).returning();
      return row;
    },
  };
}
