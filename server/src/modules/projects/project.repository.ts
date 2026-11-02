import { administratorScope } from '../../core/security/administrator.js';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqRevisions, companies, customers, designCustomerDecisions, designJobs, designPackageRevisions, documentCounters,
  idempotencyRecords, opportunities, projectCommercialBaselines, projectDesignBaselines, projectMembers,
  projects, quotationCustomerDecisions, quotationRevisions, sites, users,
} from '../../infrastructure/database/schema/index.js';

const listFields = {
  id: projects.id, projectNumber: projects.projectNumber, title: projects.title, status: projects.status,
  startDate: projects.startDate, targetCompletionDate: projects.targetCompletionDate, rowVersion: projects.rowVersion,
  commercialState: opportunities.commercialState, customerName: customers.displayName, siteName: sites.name,
  updatedAt: projects.updatedAt,
};

export function createProjectRepository(executor: DatabaseExecutor) {
  return {
    async list(companyId: string, userId: string, input: { search?: string; status?: string; commercialState?: string; limit: number; offset: number; sort: 'projectNumber' | 'title' | 'status' | 'startDate' | 'targetCompletionDate'; direction: 'asc' | 'desc' }) {
      const filters = [eq(projects.companyId, companyId), or(eq(projectMembers.userId, userId), administratorScope(companyId, userId))!];
      if (input.status) filters.push(eq(projects.status, input.status));
      if (input.commercialState) filters.push(eq(opportunities.commercialState, input.commercialState as never));
      if (input.search) filters.push(or(ilike(projects.projectNumber, `%${input.search}%`), ilike(projects.title, `%${input.search}%`), ilike(customers.displayName, `%${input.search}%`), ilike(sites.name, `%${input.search}%`))!);
      const where = and(...filters);
      const sortColumn = input.sort === 'projectNumber' ? projects.projectNumber : input.sort === 'title' ? projects.title : input.sort === 'status' ? projects.status : input.sort === 'targetCompletionDate' ? projects.targetCompletionDate : projects.startDate;
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);
      const base = () => executor.select(listFields).from(projects)
        .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.companyId, companyId), eq(projectMembers.userId, userId)))
        .innerJoin(opportunities, eq(opportunities.id, projects.opportunityId))
        .innerJoin(customers, eq(customers.id, projects.customerId)).innerJoin(sites, eq(sites.id, projects.siteId));
      const [items, totals] = await Promise.all([
        base().where(where).orderBy(order, asc(projects.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(projects)
          .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.companyId, companyId), eq(projectMembers.userId, userId)))
          .innerJoin(opportunities, eq(opportunities.id, projects.opportunityId))
          .innerJoin(customers, eq(customers.id, projects.customerId)).innerJoin(sites, eq(sites.id, projects.siteId)).where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async find(companyId: string, userId: string, projectId: string) {
      const [row] = await executor.select({ ...listFields, opportunityId: projects.opportunityId, customerId: projects.customerId, siteId: projects.siteId, startReason: projects.startReason, startedByUserId: projects.startedByUserId, createdAt: projects.createdAt })
        .from(projects).leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
        .innerJoin(opportunities, eq(opportunities.id, projects.opportunityId)).innerJoin(customers, eq(customers.id, projects.customerId)).innerJoin(sites, eq(sites.id, projects.siteId))
        .where(and(eq(projects.companyId, companyId), eq(projects.id, projectId), or(eq(projectMembers.userId, userId), administratorScope(companyId, userId)))).limit(1);
      return row;
    },

    async detailParts(companyId: string, projectId: string) {
      const [members, baseline, commercial] = await Promise.all([
        executor.select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name, email: users.email, createdAt: projectMembers.createdAt })
          .from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(and(eq(projectMembers.companyId, companyId), eq(projectMembers.projectId, projectId))).orderBy(asc(users.name)),
        executor.select({ id: projectDesignBaselines.id, designJobId: projectDesignBaselines.designJobId, designRevisionId: projectDesignBaselines.designRevisionId, designRevisionNumber: designPackageRevisions.revisionNumber, designTitle: designPackageRevisions.title, boqRevisionId: projectDesignBaselines.boqRevisionId, customerEvidence: projectDesignBaselines.customerEvidenceSnapshot, createdAt: projectDesignBaselines.createdAt })
          .from(projectDesignBaselines).innerJoin(designPackageRevisions, eq(designPackageRevisions.id, projectDesignBaselines.designRevisionId)).where(and(eq(projectDesignBaselines.companyId, companyId), eq(projectDesignBaselines.projectId, projectId))).limit(1),
        executor.select({ id: projectCommercialBaselines.id, quotationRevisionId: projectCommercialBaselines.quotationRevisionId, quotationRevisionNumber: quotationRevisions.revisionNumber, customerEvidence: projectCommercialBaselines.customerEvidenceSnapshot, customerOrderReference: projectCommercialBaselines.customerOrderReference, acceptedAt: projectCommercialBaselines.acceptedAt })
          .from(projectCommercialBaselines).innerJoin(quotationRevisions, eq(quotationRevisions.id, projectCommercialBaselines.quotationRevisionId)).where(and(eq(projectCommercialBaselines.companyId, companyId), eq(projectCommercialBaselines.projectId, projectId))).limit(1),
      ]);
      return { members, designBaseline: baseline[0] ?? null, commercialBaseline: commercial[0] ?? null };
    },

    async startContext(companyId: string, designJobId: string) {
      const [context] = await executor.select({ designJobId: designJobs.id, opportunityId: opportunities.id, customerId: opportunities.customerId, siteId: opportunities.siteId, siteCustomerId: sites.customerId, siteName: sites.name, siteStatus: sites.status, customerName: customers.displayName, title: designJobs.title, commercialState: opportunities.commercialState, timezone: companies.timezone })
        .from(designJobs).innerJoin(companies, eq(companies.id, designJobs.companyId)).innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId)).innerJoin(customers, eq(customers.id, opportunities.customerId)).leftJoin(sites, eq(sites.id, opportunities.siteId))
        .where(and(eq(designJobs.companyId, companyId), eq(designJobs.id, designJobId))).limit(1);
      return context;
    },

    listApprovedDesigns(companyId: string, designJobId: string) {
      return executor.select({ id: designPackageRevisions.id, revisionNumber: designPackageRevisions.revisionNumber, title: designPackageRevisions.title, decisionId: designCustomerDecisions.id, evidenceReference: designCustomerDecisions.evidenceReference })
        .from(designPackageRevisions).innerJoin(designCustomerDecisions, and(eq(designCustomerDecisions.revisionId, designPackageRevisions.id), eq(designCustomerDecisions.decision, 'approved')))
        .where(and(eq(designPackageRevisions.companyId, companyId), eq(designPackageRevisions.designJobId, designJobId), eq(designPackageRevisions.status, 'customer_approved'))).orderBy(desc(designPackageRevisions.revisionNumber));
    },

    listApprovedBoqs(companyId: string, designJobId: string) {
      return executor.select({ id: boqRevisions.id, revisionNumber: boqRevisions.revisionNumber, title: boqRevisions.title, designRevisionId: boqRevisions.designRevisionId })
        .from(boqRevisions).where(and(eq(boqRevisions.companyId, companyId), eq(boqRevisions.designJobId, designJobId), eq(boqRevisions.status, 'approved'))).orderBy(desc(boqRevisions.revisionNumber));
    },

    async allocateNumber(companyId: string, now: Date) {
      const periodKey = String(now.getUTCFullYear());
      const [counter] = await executor.insert(documentCounters).values({ companyId, documentType: 'PROJECT', periodKey, nextValue: 2, updatedAt: now }).onConflictDoUpdate({ target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey], set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now } }).returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });
      return `FS-PRJ-${periodKey}-${String(counter!.allocated).padStart(6, '0')}`;
    },

    async create(input: typeof projects.$inferInsert) { const [row] = await executor.insert(projects).values(input).returning(); return row!; },
    createMembers(inputs: Array<typeof projectMembers.$inferInsert>) { return executor.insert(projectMembers).values(inputs).returning(); },
    async createDesignBaseline(input: typeof projectDesignBaselines.$inferInsert) { const [row] = await executor.insert(projectDesignBaselines).values(input).returning(); return row!; },
    async findByOpportunity(companyId: string, opportunityId: string) { const [row] = await executor.select().from(projects).where(and(eq(projects.companyId, companyId), eq(projects.opportunityId, opportunityId))).limit(1); return row; },
    async findByOpportunityUnscoped(companyId: string, opportunityId: string) { const [row] = await executor.select().from(projects).where(and(eq(projects.companyId, companyId), eq(projects.opportunityId, opportunityId))).limit(1); return row; },
    listMemberIds(companyId: string, projectId: string) { return executor.select({ userId: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.companyId, companyId), eq(projectMembers.projectId, projectId))); },

    async reserveIdempotency(input: typeof idempotencyRecords.$inferInsert) { const [row] = await executor.insert(idempotencyRecords).values(input).onConflictDoNothing().returning(); return row; },
    async findIdempotency(companyId: string, actorUserId: string, key: string) { const [row] = await executor.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.companyId, companyId), eq(idempotencyRecords.actorUserId, actorUserId), eq(idempotencyRecords.action, 'project.start'), eq(idempotencyRecords.idempotencyKey, key))).limit(1); return row; },
    async completeIdempotency(id: string, projectId: string) { await executor.update(idempotencyRecords).set({ responseStatus: 201, responseBody: { projectId } }).where(eq(idempotencyRecords.id, id)); },

    async attachCommercialBaseline(input: typeof projectCommercialBaselines.$inferInsert) { const [row] = await executor.insert(projectCommercialBaselines).values(input).onConflictDoNothing().returning(); return row; },
    async acceptedQuotation(companyId: string, opportunityId: string) {
      const [row] = await executor.select({ revisionId: quotationRevisions.id, decisionId: quotationCustomerDecisions.id, evidenceReference: quotationCustomerDecisions.evidenceReference, customerOrderReference: quotationCustomerDecisions.customerOrderReference, recordedAt: quotationCustomerDecisions.recordedAt, recordedByUserId: quotationCustomerDecisions.recordedByUserId })
        .from(quotationRevisions).innerJoin(quotationCustomerDecisions, and(eq(quotationCustomerDecisions.quotationRevisionId, quotationRevisions.id), eq(quotationCustomerDecisions.decision, 'accepted')))
        .innerJoin(boqRevisions, eq(boqRevisions.id, quotationRevisions.boqRevisionId)).innerJoin(designJobs, eq(designJobs.id, boqRevisions.designJobId))
        .where(and(eq(quotationRevisions.companyId, companyId), eq(designJobs.opportunityId, opportunityId))).orderBy(desc(quotationCustomerDecisions.recordedAt)).limit(1);
      return row;
    },
  };
}
