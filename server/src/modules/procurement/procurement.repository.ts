import { administratorScope } from '../../core/security/administrator.js';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqLines,
  boqRevisions,
  designJobs,
  documentCounters,
  procurementRequisitionLines,
  procurementRequisitions,
  procurementRfqs,
  procurementRfqLines,
  procurementRfqVendors,
  procurementSelectionDecisions,
  procurementSubstitutionReviews,
  projectDesignBaselines,
  projectMembers,
  projects,
  purchaseComparisons,
  users,
  vendorOfferLines,
  vendorOffers,
  vendors,
} from '../../infrastructure/database/schema/index.js';

const access = (companyId: string, userId: string) => and(
  eq(procurementRequisitions.companyId, companyId),
  or(administratorScope(companyId, userId), eq(procurementRequisitions.buyerUserId, userId), eq(procurementRequisitions.purchaseManagerUserId, userId)),
);

const listFields = {
  id: procurementRequisitions.id,
  requisitionNumber: procurementRequisitions.requisitionNumber,
  title: procurementRequisitions.title,
  status: procurementRequisitions.status,
  projectId: procurementRequisitions.projectId,
  projectNumber: projects.projectNumber,
  projectTitle: projects.title,
  buyerUserId: procurementRequisitions.buyerUserId,
  purchaseManagerUserId: procurementRequisitions.purchaseManagerUserId,
  requiredBy: procurementRequisitions.requiredBy,
  deliveryLocation: procurementRequisitions.deliveryLocation,
  rowVersion: procurementRequisitions.rowVersion,
  updatedAt: procurementRequisitions.updatedAt,
  rfqId: procurementRfqs.id,
  rfqNumber: procurementRfqs.rfqNumber,
  rfqStatus: procurementRfqs.status,
  offerCount: sql<number>`(select count(*)::int from vendor_offers offer where offer.rfq_id = ${procurementRfqs.id})`,
};

export function createProcurementRepository(executor: DatabaseExecutor) {
  return {
    async list(companyId: string, userId: string, input: { search?: string; status?: string; limit: number; offset: number; sort: 'requisitionNumber' | 'title' | 'status' | 'requiredBy' | 'updatedAt'; direction: 'asc' | 'desc' }) {
      const filters = [access(companyId, userId)];
      if (input.status) filters.push(eq(procurementRequisitions.status, input.status as never));
      if (input.search) filters.push(or(
        ilike(procurementRequisitions.requisitionNumber, `%${input.search}%`),
        ilike(procurementRequisitions.title, `%${input.search}%`),
        ilike(projects.projectNumber, `%${input.search}%`),
        ilike(projects.title, `%${input.search}%`),
      )!);
      const sortColumn = input.sort === 'requisitionNumber' ? procurementRequisitions.requisitionNumber
        : input.sort === 'title' ? procurementRequisitions.title
          : input.sort === 'status' ? procurementRequisitions.status
            : input.sort === 'requiredBy' ? procurementRequisitions.requiredBy : procurementRequisitions.updatedAt;
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);
      const where = and(...filters);
      const base = () => executor.select(listFields).from(procurementRequisitions)
        .innerJoin(projects, eq(projects.id, procurementRequisitions.projectId))
        .leftJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id));
      const [items, totals] = await Promise.all([
        base().where(where).orderBy(order, asc(procurementRequisitions.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(procurementRequisitions)
          .innerJoin(projects, eq(projects.id, procurementRequisitions.projectId))
          .leftJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id))
          .where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async find(companyId: string, userId: string, requisitionId: string) {
      const [row] = await executor.select({
        ...listFields,
        boqRevisionId: procurementRequisitions.boqRevisionId,
        notes: procurementRequisitions.notes,
        createdAt: procurementRequisitions.createdAt,
        buyerName: sql<string>`buyer.name`,
        purchaseManagerName: sql<string>`purchase_manager.name`,
      }).from(procurementRequisitions)
        .innerJoin(projects, eq(projects.id, procurementRequisitions.projectId))
        .leftJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id))
        .innerJoin(sql`${users} buyer`, sql`buyer.id = ${procurementRequisitions.buyerUserId}`)
        .innerJoin(sql`${users} purchase_manager`, sql`purchase_manager.id = ${procurementRequisitions.purchaseManagerUserId}`)
        .where(and(access(companyId, userId), eq(procurementRequisitions.id, requisitionId))).limit(1);
      return row;
    },

    listProjectBoqOptions(companyId: string, userId: string) {
      return executor.select({
        projectId: projects.id,
        projectNumber: projects.projectNumber,
        projectTitle: projects.title,
        boqRevisionId: boqRevisions.id,
        boqRevisionNumber: boqRevisions.revisionNumber,
        boqTitle: boqRevisions.title,
      }).from(projects)
        .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId), eq(projectMembers.companyId, companyId)))
        .innerJoin(projectDesignBaselines, and(eq(projectDesignBaselines.projectId, projects.id), eq(projectDesignBaselines.companyId, companyId)))
        .innerJoin(boqRevisions, and(
          eq(boqRevisions.designJobId, projectDesignBaselines.designJobId),
          eq(boqRevisions.designRevisionId, projectDesignBaselines.designRevisionId),
          eq(boqRevisions.status, 'approved'),
        ))
        .where(and(eq(projects.companyId, companyId), eq(projects.status, 'started'), or(eq(projectMembers.userId, userId), administratorScope(companyId, userId))))
        .orderBy(asc(projects.projectNumber), desc(boqRevisions.revisionNumber));
    },

    async findProjectBoq(companyId: string, userId: string, projectId: string, boqRevisionId: string) {
      const [row] = await executor.select({ projectId: projects.id, projectNumber: projects.projectNumber, projectTitle: projects.title, boqRevisionId: boqRevisions.id })
        .from(projects)
        .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId), eq(projectMembers.companyId, companyId)))
        .innerJoin(projectDesignBaselines, and(eq(projectDesignBaselines.projectId, projects.id), eq(projectDesignBaselines.companyId, companyId)))
        .innerJoin(boqRevisions, and(
          eq(boqRevisions.id, boqRevisionId),
          eq(boqRevisions.designJobId, projectDesignBaselines.designJobId),
          eq(boqRevisions.designRevisionId, projectDesignBaselines.designRevisionId),
          eq(boqRevisions.status, 'approved'),
        ))
        .where(and(eq(projects.companyId, companyId), eq(projects.id, projectId), eq(projects.status, 'started'), or(eq(projectMembers.userId, userId), administratorScope(companyId, userId)))).limit(1);
      return row;
    },

    listProjectMemberIds(companyId: string, projectId: string) {
      return executor.select({ userId: projectMembers.userId }).from(projectMembers).where(and(
        eq(projectMembers.companyId, companyId), eq(projectMembers.projectId, projectId),
      ));
    },

    async findEngineeringReviewer(companyId: string, requisitionId: string) {
      const [row] = await executor.select({ userId: designJobs.designHeadUserId }).from(procurementRequisitions)
        .innerJoin(projectDesignBaselines, and(eq(projectDesignBaselines.projectId, procurementRequisitions.projectId), eq(projectDesignBaselines.companyId, companyId)))
        .innerJoin(designJobs, eq(designJobs.id, projectDesignBaselines.designJobId))
        .innerJoin(projectMembers, and(
          eq(projectMembers.projectId, procurementRequisitions.projectId),
          eq(projectMembers.companyId, companyId),
          eq(projectMembers.userId, designJobs.designHeadUserId),
        ))
        .where(and(eq(procurementRequisitions.companyId, companyId), eq(procurementRequisitions.id, requisitionId))).limit(1);
      return row;
    },

    listBoqLines(companyId: string, boqRevisionId: string) {
      return executor.select({
        id: boqLines.id,
        lineNumber: boqLines.lineNumber,
        itemId: boqLines.itemId,
        itemCode: boqLines.itemCodeSnapshot,
        itemName: boqLines.itemNameSnapshot,
        specification: boqLines.specificationSnapshot,
        unitId: boqLines.unitId,
        unitSymbol: boqLines.unitSymbolSnapshot,
        quantity: boqLines.quantity,
      }).from(boqLines).where(and(eq(boqLines.companyId, companyId), eq(boqLines.boqRevisionId, boqRevisionId))).orderBy(asc(boqLines.lineNumber));
    },

    async allocateNumber(companyId: string, type: 'REQUISITION' | 'RFQ', prefix: 'REQ' | 'RFQ', now: Date) {
      const periodKey = String(now.getUTCFullYear());
      const [counter] = await executor.insert(documentCounters).values({ companyId, documentType: type, periodKey, nextValue: 2, updatedAt: now })
        .onConflictDoUpdate({ target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey], set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now } })
        .returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });
      return `FS-${prefix}-${periodKey}-${String(counter!.allocated).padStart(6, '0')}`;
    },

    async createRequisition(input: typeof procurementRequisitions.$inferInsert) {
      const [row] = await executor.insert(procurementRequisitions).values(input).returning();
      return row!;
    },
    createRequisitionLines(inputs: Array<typeof procurementRequisitionLines.$inferInsert>) {
      return executor.insert(procurementRequisitionLines).values(inputs).returning();
    },
    listRequisitionLines(companyId: string, requisitionId: string) {
      return executor.select().from(procurementRequisitionLines).where(and(
        eq(procurementRequisitionLines.companyId, companyId), eq(procurementRequisitionLines.requisitionId, requisitionId),
      )).orderBy(asc(procurementRequisitionLines.lineNumber));
    },

    listActiveVendors(companyId: string) {
      return executor.select({ id: vendors.id, code: vendors.code, name: vendors.displayName })
        .from(vendors).where(and(eq(vendors.companyId, companyId), eq(vendors.status, 'active'))).orderBy(asc(vendors.displayName));
    },
    findActiveVendors(companyId: string, vendorIds: string[]) {
      return executor.select({ id: vendors.id }).from(vendors).where(and(
        eq(vendors.companyId, companyId), eq(vendors.status, 'active'), inArray(vendors.id, vendorIds),
      ));
    },
    async findRfq(companyId: string, requisitionId: string) {
      const [row] = await executor.select().from(procurementRfqs).where(and(
        eq(procurementRfqs.companyId, companyId), eq(procurementRfqs.requisitionId, requisitionId),
      )).limit(1);
      return row;
    },
    async createRfq(input: typeof procurementRfqs.$inferInsert) {
      const [row] = await executor.insert(procurementRfqs).values(input).onConflictDoNothing().returning();
      return row;
    },
    createRfqVendors(inputs: Array<typeof procurementRfqVendors.$inferInsert>) { return executor.insert(procurementRfqVendors).values(inputs).returning(); },
    createRfqLines(inputs: Array<typeof procurementRfqLines.$inferInsert>) { return executor.insert(procurementRfqLines).values(inputs).returning(); },
    async createComparison(input: typeof purchaseComparisons.$inferInsert) { const [row] = await executor.insert(purchaseComparisons).values(input).returning(); return row!; },
    async transitionRequisition(companyId: string, requisitionId: string, expectedVersion: number, from: 'open' | 'sourcing', to: 'sourcing' | 'selected') {
      const [row] = await executor.update(procurementRequisitions).set({ status: to, rowVersion: sql`${procurementRequisitions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(procurementRequisitions.companyId, companyId), eq(procurementRequisitions.id, requisitionId), eq(procurementRequisitions.status, from), eq(procurementRequisitions.rowVersion, expectedVersion),
      )).returning();
      return row;
    },

    listRfqLines(companyId: string, rfqId: string) {
      return executor.select().from(procurementRfqLines).where(and(eq(procurementRfqLines.companyId, companyId), eq(procurementRfqLines.rfqId, rfqId))).orderBy(asc(procurementRfqLines.lineNumber));
    },
    listRfqVendors(companyId: string, rfqId: string) {
      return executor.select({ id: vendors.id, code: vendors.code, name: vendors.displayName })
        .from(procurementRfqVendors).innerJoin(vendors, eq(vendors.id, procurementRfqVendors.vendorId))
        .where(and(eq(procurementRfqVendors.companyId, companyId), eq(procurementRfqVendors.rfqId, rfqId))).orderBy(asc(vendors.displayName));
    },
    async isInvitedVendor(companyId: string, rfqId: string, vendorId: string) {
      const [row] = await executor.select({ vendorId: procurementRfqVendors.vendorId }).from(procurementRfqVendors).where(and(
        eq(procurementRfqVendors.companyId, companyId), eq(procurementRfqVendors.rfqId, rfqId), eq(procurementRfqVendors.vendorId, vendorId),
      )).limit(1);
      return Boolean(row);
    },
    async createOffer(input: typeof vendorOffers.$inferInsert) {
      const [row] = await executor.insert(vendorOffers).values(input).onConflictDoNothing().returning();
      return row;
    },
    createOfferLines(inputs: Array<typeof vendorOfferLines.$inferInsert>) { return executor.insert(vendorOfferLines).values(inputs).returning(); },
    listOffers(companyId: string, rfqId: string) {
      return executor.select({
        id: vendorOffers.id, vendorId: vendorOffers.vendorId, vendorName: vendors.displayName, vendorCode: vendors.code,
        vendorReference: vendorOffers.vendorReference, currency: vendorOffers.currency, taxBasis: vendorOffers.taxBasis,
        freightAmount: vendorOffers.freightAmount, leadTimeDays: vendorOffers.leadTimeDays,
        paymentTerms: vendorOffers.paymentTerms, warranty: vendorOffers.warranty, validUntil: vendorOffers.validUntil,
        subtotal: vendorOffers.subtotal, total: vendorOffers.total, status: vendorOffers.status,
        recordedByUserId: vendorOffers.recordedByUserId, submittedAt: vendorOffers.submittedAt,
      }).from(vendorOffers).innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
        .where(and(eq(vendorOffers.companyId, companyId), eq(vendorOffers.rfqId, rfqId))).orderBy(asc(vendors.displayName));
    },
    listOfferLines(companyId: string, offerIds: string[]) {
      if (offerIds.length === 0) return Promise.resolve([]);
      return executor.select().from(vendorOfferLines).where(and(eq(vendorOfferLines.companyId, companyId), inArray(vendorOfferLines.vendorOfferId, offerIds))).orderBy(asc(vendorOfferLines.lineNumber));
    },
    async findComparison(companyId: string, rfqId: string) {
      const [row] = await executor.select().from(purchaseComparisons).where(and(eq(purchaseComparisons.companyId, companyId), eq(purchaseComparisons.rfqId, rfqId))).limit(1);
      return row;
    },
    async lockComparison(companyId: string, comparisonId: string) {
      const [row] = await executor.select().from(purchaseComparisons).where(and(eq(purchaseComparisons.companyId, companyId), eq(purchaseComparisons.id, comparisonId))).for('update');
      return row;
    },
    async transitionComparison(companyId: string, comparisonId: string, expectedVersion: number) {
      const [row] = await executor.update(purchaseComparisons).set({ status: 'selected', rowVersion: sql`${purchaseComparisons.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(purchaseComparisons.companyId, companyId), eq(purchaseComparisons.id, comparisonId), eq(purchaseComparisons.status, 'open'), eq(purchaseComparisons.rowVersion, expectedVersion),
      )).returning();
      return row;
    },
    async transitionRfq(companyId: string, rfqId: string, expectedVersion: number) {
      const [row] = await executor.update(procurementRfqs).set({ status: 'selected', rowVersion: sql`${procurementRfqs.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(procurementRfqs.companyId, companyId), eq(procurementRfqs.id, rfqId), eq(procurementRfqs.status, 'open'), eq(procurementRfqs.rowVersion, expectedVersion),
      )).returning();
      return row;
    },
    async createSelection(input: typeof procurementSelectionDecisions.$inferInsert) { const [row] = await executor.insert(procurementSelectionDecisions).values(input).returning(); return row!; },
    async findSelection(companyId: string, comparisonId: string) {
      const [row] = await executor.select().from(procurementSelectionDecisions).where(and(eq(procurementSelectionDecisions.companyId, companyId), eq(procurementSelectionDecisions.comparisonId, comparisonId))).limit(1);
      return row;
    },

    async listSubstitutionReviewQueue(companyId: string, userId: string, input: { search?: string; status?: 'pending' | 'approved' | 'rejected'; limit: number; offset: number; sort: 'requisitionNumber' | 'vendorName' | 'itemName' | 'status' | 'updatedAt'; direction: 'asc' | 'desc' }) {
      const filters = [
        eq(procurementRequisitions.companyId, companyId),
        or(eq(designJobs.designHeadUserId, userId), administratorScope(companyId, userId))!,
        or(eq(projectMembers.userId, userId), administratorScope(companyId, userId))!,
        ne(vendorOfferLines.equivalence, 'equivalent'),
      ];
      if (input.status === 'pending') filters.push(isNull(procurementSubstitutionReviews.id));
      if (input.status === 'approved') filters.push(eq(procurementSubstitutionReviews.decision, 'approved'));
      if (input.status === 'rejected') filters.push(eq(procurementSubstitutionReviews.decision, 'rejected'));
      if (input.search) filters.push(or(
        ilike(procurementRequisitions.requisitionNumber, `%${input.search}%`),
        ilike(projects.projectNumber, `%${input.search}%`),
        ilike(vendors.displayName, `%${input.search}%`),
        ilike(procurementRfqLines.itemNameSnapshot, `%${input.search}%`),
        ilike(vendorOfferLines.brandOffered, `%${input.search}%`),
      )!);
      const status = sql<string>`case when ${procurementSubstitutionReviews.id} is null then 'pending' else ${procurementSubstitutionReviews.decision}::text end`;
      const updatedAt = sql<Date>`coalesce(${procurementSubstitutionReviews.reviewedAt}, ${vendorOffers.submittedAt})`;
      const sortColumn = input.sort === 'requisitionNumber' ? procurementRequisitions.requisitionNumber
        : input.sort === 'vendorName' ? vendors.displayName
          : input.sort === 'itemName' ? procurementRfqLines.itemNameSnapshot
            : input.sort === 'status' ? status : updatedAt;
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);
      const fields = {
        id: vendorOfferLines.id,
        requisitionId: procurementRequisitions.id,
        requisitionNumber: procurementRequisitions.requisitionNumber,
        projectNumber: projects.projectNumber,
        projectTitle: projects.title,
        vendorName: vendors.displayName,
        itemName: procurementRfqLines.itemNameSnapshot,
        itemCode: procurementRfqLines.itemCodeSnapshot,
        offeredBrand: vendorOfferLines.brandOffered,
        equivalence: vendorOfferLines.equivalence,
        status,
        updatedAt,
      };
      const where = and(...filters);
      const [items, totals] = await Promise.all([
        executor.select(fields).from(procurementRequisitions)
          .innerJoin(projects, eq(projects.id, procurementRequisitions.projectId))
          .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.companyId, companyId), eq(projectMembers.userId, userId)))
          .innerJoin(projectDesignBaselines, eq(projectDesignBaselines.projectId, projects.id))
          .innerJoin(designJobs, eq(designJobs.id, projectDesignBaselines.designJobId))
          .innerJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id))
          .innerJoin(vendorOffers, eq(vendorOffers.rfqId, procurementRfqs.id))
          .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
          .innerJoin(vendorOfferLines, eq(vendorOfferLines.vendorOfferId, vendorOffers.id))
          .innerJoin(procurementRfqLines, eq(procurementRfqLines.id, vendorOfferLines.rfqLineId))
          .leftJoin(procurementSubstitutionReviews, eq(procurementSubstitutionReviews.vendorOfferLineId, vendorOfferLines.id))
          .where(where).orderBy(order, asc(vendorOfferLines.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(procurementRequisitions)
          .innerJoin(projects, eq(projects.id, procurementRequisitions.projectId))
          .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.companyId, companyId), eq(projectMembers.userId, userId)))
          .innerJoin(projectDesignBaselines, eq(projectDesignBaselines.projectId, projects.id))
          .innerJoin(designJobs, eq(designJobs.id, projectDesignBaselines.designJobId))
          .innerJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id))
          .innerJoin(vendorOffers, eq(vendorOffers.rfqId, procurementRfqs.id))
          .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
          .innerJoin(vendorOfferLines, eq(vendorOfferLines.vendorOfferId, vendorOffers.id))
          .innerJoin(procurementRfqLines, eq(procurementRfqLines.id, vendorOfferLines.rfqLineId))
          .leftJoin(procurementSubstitutionReviews, eq(procurementSubstitutionReviews.vendorOfferLineId, vendorOfferLines.id))
          .where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async findTechnicalReviewContext(companyId: string, userId: string, requisitionId: string) {
      const [row] = await executor.select({
        requisitionId: procurementRequisitions.id,
        requisitionNumber: procurementRequisitions.requisitionNumber,
        requisitionTitle: procurementRequisitions.title,
        requisitionStatus: procurementRequisitions.status,
        projectId: projects.id,
        projectNumber: projects.projectNumber,
        projectTitle: projects.title,
        designJobId: designJobs.id,
        designTitle: designJobs.title,
        buyerUserId: procurementRequisitions.buyerUserId,
        purchaseManagerUserId: procurementRequisitions.purchaseManagerUserId,
      }).from(procurementRequisitions)
        .innerJoin(projects, eq(projects.id, procurementRequisitions.projectId))
        .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.companyId, companyId), eq(projectMembers.userId, userId)))
        .innerJoin(projectDesignBaselines, eq(projectDesignBaselines.projectId, projects.id))
        .innerJoin(designJobs, and(eq(designJobs.id, projectDesignBaselines.designJobId), or(eq(designJobs.designHeadUserId, userId), administratorScope(companyId, userId))!))
        .where(and(eq(procurementRequisitions.companyId, companyId), eq(procurementRequisitions.id, requisitionId), or(eq(projectMembers.userId, userId), administratorScope(companyId, userId)))).limit(1);
      return row;
    },

    listTechnicalReviewItems(companyId: string, requisitionId: string) {
      return executor.select({
        offerLineId: vendorOfferLines.id,
        offerId: vendorOffers.id,
        vendorName: vendors.displayName,
        vendorCode: vendors.code,
        vendorReference: vendorOffers.vendorReference,
        lineNumber: vendorOfferLines.lineNumber,
        itemCode: procurementRfqLines.itemCodeSnapshot,
        itemName: procurementRfqLines.itemNameSnapshot,
        approvedSpecification: procurementRfqLines.specificationSnapshot,
        offeredBrand: vendorOfferLines.brandOffered,
        offeredSpecification: vendorOfferLines.specificationOffered,
        equivalence: vendorOfferLines.equivalence,
        deviationNotes: vendorOfferLines.deviationNotes,
        recordedByUserId: vendorOffers.recordedByUserId,
        decision: procurementSubstitutionReviews.decision,
        reviewReason: procurementSubstitutionReviews.reason,
        reviewedByUserId: procurementSubstitutionReviews.reviewedByUserId,
        reviewedByName: sql<string | null>`reviewer.name`,
        reviewedAt: procurementSubstitutionReviews.reviewedAt,
      }).from(procurementRequisitions)
        .innerJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id))
        .innerJoin(vendorOffers, eq(vendorOffers.rfqId, procurementRfqs.id))
        .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
        .innerJoin(vendorOfferLines, eq(vendorOfferLines.vendorOfferId, vendorOffers.id))
        .innerJoin(procurementRfqLines, eq(procurementRfqLines.id, vendorOfferLines.rfqLineId))
        .leftJoin(procurementSubstitutionReviews, eq(procurementSubstitutionReviews.vendorOfferLineId, vendorOfferLines.id))
        .leftJoin(sql`${users} reviewer`, sql`reviewer.id = ${procurementSubstitutionReviews.reviewedByUserId}`)
        .where(and(
          eq(procurementRequisitions.companyId, companyId), eq(procurementRequisitions.id, requisitionId),
          ne(vendorOfferLines.equivalence, 'equivalent'),
        )).orderBy(asc(vendors.displayName), asc(vendorOfferLines.lineNumber));
    },

    async findOfferLineForReview(companyId: string, requisitionId: string, offerLineId: string) {
      const [row] = await executor.select({
        offerLineId: vendorOfferLines.id,
        equivalence: vendorOfferLines.equivalence,
        recordedByUserId: vendorOffers.recordedByUserId,
        vendorName: vendors.displayName,
        itemName: procurementRfqLines.itemNameSnapshot,
      }).from(procurementRequisitions)
        .innerJoin(procurementRfqs, eq(procurementRfqs.requisitionId, procurementRequisitions.id))
        .innerJoin(vendorOffers, eq(vendorOffers.rfqId, procurementRfqs.id))
        .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
        .innerJoin(vendorOfferLines, eq(vendorOfferLines.vendorOfferId, vendorOffers.id))
        .innerJoin(procurementRfqLines, eq(procurementRfqLines.id, vendorOfferLines.rfqLineId))
        .where(and(eq(procurementRequisitions.companyId, companyId), eq(procurementRequisitions.id, requisitionId), eq(vendorOfferLines.id, offerLineId))).limit(1);
      return row;
    },

    listSubstitutionReviews(companyId: string, offerLineIds: string[]) {
      if (offerLineIds.length === 0) return Promise.resolve([]);
      return executor.select({
        id: procurementSubstitutionReviews.id,
        vendorOfferLineId: procurementSubstitutionReviews.vendorOfferLineId,
        decision: procurementSubstitutionReviews.decision,
        reason: procurementSubstitutionReviews.reason,
        reviewedByUserId: procurementSubstitutionReviews.reviewedByUserId,
        reviewedByName: users.name,
        reviewedAt: procurementSubstitutionReviews.reviewedAt,
      }).from(procurementSubstitutionReviews)
        .innerJoin(users, eq(users.id, procurementSubstitutionReviews.reviewedByUserId))
        .where(and(eq(procurementSubstitutionReviews.companyId, companyId), inArray(procurementSubstitutionReviews.vendorOfferLineId, offerLineIds)));
    },

    async createSubstitutionReview(input: typeof procurementSubstitutionReviews.$inferInsert) {
      const [row] = await executor.insert(procurementSubstitutionReviews).values(input).onConflictDoNothing().returning();
      return row;
    },
  };
}
