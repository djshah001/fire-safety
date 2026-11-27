import { administratorScope } from '../../core/security/administrator.js';
import { and, asc, count, desc, eq, exists, gt, gte, ilike, isNull, lt, lte, max, notInArray, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqRevisions,
  customers,
  designDeadlineExtensions,
  designCustomerDecisions,
  designJobs,
  designPackageRevisions,
  designRevisionFiles,
  designReviewActions,
  leadMembers,
  leads,
  marketSectors,
  opportunities,
  opportunityMembers,
  outboxJobs,
  serviceCategories,
  surveyRevisionFiles,
  surveyRevisions,
  users,
} from '../../infrastructure/database/schema/index.js';

export type DesignJobAccess = { companyId: string; userId: string };

function accessCondition(executor: DatabaseExecutor, access: DesignJobAccess) {
  return or(
    administratorScope(access.companyId, access.userId),
    eq(designJobs.designerUserId, access.userId),
    eq(designJobs.designHeadUserId, access.userId),
    exists(executor.select({ value: sql`1` }).from(leadMembers).where(and(
      eq(leadMembers.leadId, designJobs.leadId), eq(leadMembers.companyId, access.companyId), eq(leadMembers.userId, access.userId),
    ))),
    exists(executor.select({ value: sql`1` }).from(opportunityMembers).where(and(
      eq(opportunityMembers.opportunityId, designJobs.opportunityId), eq(opportunityMembers.companyId, access.companyId), eq(opportunityMembers.userId, access.userId),
    ))),
    exists(executor.select({ value: sql`1` }).from(boqRevisions).where(and(
      eq(boqRevisions.designJobId, designJobs.id),
      eq(boqRevisions.companyId, access.companyId),
      or(
        eq(boqRevisions.costingUserId, access.userId),
        eq(boqRevisions.purchaseHeadUserId, access.userId),
        eq(boqRevisions.adminApproverUserId, access.userId),
      ),
    ))),
  );
}

const jobFields = {
  id: designJobs.id,
  leadId: designJobs.leadId,
  opportunityId: designJobs.opportunityId,
  title: designJobs.title,
  status: designJobs.status,
  previousStatus: designJobs.previousStatus,
  closedReason: designJobs.closedReason,
  closedAt: designJobs.closedAt,
  designerUserId: designJobs.designerUserId,
  designerName: sql<string | null>`designer.name`,
  designerIsOnLeave: sql<boolean | null>`designer.is_on_leave`,
  designHeadUserId: designJobs.designHeadUserId,
  designHeadName: sql<string>`design_head.name`,
  designHeadIsOnLeave: sql<boolean>`design_head.is_on_leave`,
  authorizedByUserId: designJobs.authorizedByUserId,
  authorizedByName: sql<string>`authorized_user.name`,
  lastModifiedByUserId: sql<string>`coalesce(${designJobs.updatedByUserId}, ${designJobs.authorizedByUserId})`,
  lastModifiedByName: sql<string>`coalesce(updated_user.name, authorized_user.name)`,
  designerAssignedAt: designJobs.designerAssignedAt,
  designDueAt: designJobs.designDueAt,
  bufferExtensionsUsed: designJobs.bufferExtensionsUsed,
  designerCompletedAt: designJobs.designerCompletedAt,
  surveyRequested: designJobs.surveyRequested,
  authorizationNotes: designJobs.authorizationNotes,
  authorizedAt: designJobs.authorizedAt,
  rowVersion: designJobs.rowVersion,
  updatedAt: designJobs.updatedAt,
  leadNumber: leads.leadNumber,
  customerName: customers.displayName,
  sectorId: leads.sectorId,
  sectorName: marketSectors.name,
  serviceCategoryId: leads.serviceCategoryId,
  serviceCategoryName: serviceCategories.name,
};

export function createEngineeringRepository(executor: DatabaseExecutor) {
  return {
    async listFilterOptions(access: DesignJobAccess) {
      const [activeUsers, sectors, categories] = await Promise.all([
        executor
          .select({ id: users.id, name: users.name, email: users.email, isOnLeave: users.isOnLeave })
          .from(users)
          .where(and(eq(users.companyId, access.companyId), eq(users.status, 'active')))
          .orderBy(asc(users.name)),
        executor
          .select({ id: marketSectors.id, name: marketSectors.name })
          .from(marketSectors)
          .where(and(eq(marketSectors.companyId, access.companyId), eq(marketSectors.status, 'active')))
          .orderBy(asc(marketSectors.name)),
        executor
          .select({ id: serviceCategories.id, name: serviceCategories.name })
          .from(serviceCategories)
          .where(and(eq(serviceCategories.companyId, access.companyId), eq(serviceCategories.status, 'active')))
          .orderBy(asc(serviceCategories.name)),
      ]);
      return { users: activeUsers, sectors, serviceCategories: categories };
    },

    async listJobs(access: DesignJobAccess, input: {
      search?: string;
      status?: string;
      designerUserId?: string;
      designHeadUserId?: string;
      surveyRequested?: 'yes' | 'no';
      deadlineState?: 'overdue' | 'due_soon' | 'on_track' | 'completed' | 'unassigned';
      sectorId?: string;
      serviceCategoryId?: string;
      updatedByUserId?: string;
      authorizedFrom?: string;
      authorizedTo?: string;
      updatedFrom?: string;
      updatedTo?: string;
      limit: number;
      offset: number;
      sort: 'title' | 'status' | 'updatedAt' | 'authorizedAt' | 'designDueAt' | 'customerName';
      direction: 'asc' | 'desc';
    }) {
      const now = new Date();
      const soonCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
      const dayAfter = (dateString: string) => new Date(new Date(`${dateString}T00:00:00.000Z`).getTime() + 86_400_000);
      const filters = [eq(designJobs.companyId, access.companyId), accessCondition(executor, access)];
      if (input.status) filters.push(eq(designJobs.status, input.status));
      if (input.designerUserId === 'unassigned') filters.push(isNull(designJobs.designerUserId));
      else if (input.designerUserId) filters.push(eq(designJobs.designerUserId, input.designerUserId));
      if (input.designHeadUserId) filters.push(eq(designJobs.designHeadUserId, input.designHeadUserId));
      if (input.surveyRequested) filters.push(eq(designJobs.surveyRequested, input.surveyRequested === 'yes'));
      if (input.sectorId) filters.push(eq(leads.sectorId, input.sectorId));
      if (input.serviceCategoryId) filters.push(eq(leads.serviceCategoryId, input.serviceCategoryId));
      if (input.updatedByUserId) {
        filters.push(sql`coalesce(${designJobs.updatedByUserId}, ${designJobs.authorizedByUserId}) = ${input.updatedByUserId}`);
      }
      if (input.authorizedFrom) filters.push(gte(designJobs.authorizedAt, new Date(`${input.authorizedFrom}T00:00:00.000Z`)));
      if (input.authorizedTo) filters.push(lt(designJobs.authorizedAt, dayAfter(input.authorizedTo)));
      if (input.updatedFrom) filters.push(gte(designJobs.updatedAt, new Date(`${input.updatedFrom}T00:00:00.000Z`)));
      if (input.updatedTo) filters.push(lt(designJobs.updatedAt, dayAfter(input.updatedTo)));
      if (input.deadlineState === 'unassigned') {
        filters.push(isNull(designJobs.designerUserId));
      } else if (input.deadlineState === 'completed') {
        filters.push(sql`${designJobs.designerCompletedAt} is not null`);
      } else if (input.deadlineState === 'overdue') {
        filters.push(
          isNull(designJobs.designerCompletedAt),
          lt(designJobs.designDueAt, now),
          notInArray(designJobs.status, ['paused', 'cancelled', 'abandoned']),
        );
      } else if (input.deadlineState === 'due_soon') {
        filters.push(
          isNull(designJobs.designerCompletedAt),
          gte(designJobs.designDueAt, now),
          lte(designJobs.designDueAt, soonCutoff),
          notInArray(designJobs.status, ['paused', 'cancelled', 'abandoned']),
        );
      } else if (input.deadlineState === 'on_track') {
        filters.push(
          isNull(designJobs.designerCompletedAt),
          gt(designJobs.designDueAt, soonCutoff),
          notInArray(designJobs.status, ['paused', 'cancelled', 'abandoned']),
        );
      }
      if (input.search) {
        filters.push(or(
          ilike(designJobs.title, `%${input.search}%`),
          ilike(leads.leadNumber, `%${input.search}%`),
          ilike(customers.displayName, `%${input.search}%`),
          ilike(designJobs.authorizationNotes, `%${input.search}%`),
        )!);
      }
      const sortExpr = {
        title: designJobs.title,
        status: designJobs.status,
        updatedAt: designJobs.updatedAt,
        authorizedAt: designJobs.authorizedAt,
        designDueAt: designJobs.designDueAt,
        customerName: customers.displayName,
      }[input.sort];
      const order = input.direction === 'asc' ? asc(sortExpr) : desc(sortExpr);
      const where = and(...filters);
      const [items, totals] = await Promise.all([
        executor.select(jobFields).from(designJobs)
          .innerJoin(leads, eq(leads.id, designJobs.leadId))
          .innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId))
          .innerJoin(customers, eq(customers.id, opportunities.customerId))
          .innerJoin(marketSectors, eq(marketSectors.id, leads.sectorId))
          .innerJoin(serviceCategories, eq(serviceCategories.id, leads.serviceCategoryId))
          .leftJoin(sql`${users} designer`, sql`designer.id = ${designJobs.designerUserId}`)
          .innerJoin(sql`${users} design_head`, sql`design_head.id = ${designJobs.designHeadUserId}`)
          .innerJoin(sql`${users} authorized_user`, sql`authorized_user.id = ${designJobs.authorizedByUserId}`)
          .leftJoin(sql`${users} updated_user`, sql`updated_user.id = ${designJobs.updatedByUserId}`)
          .where(where).orderBy(order, asc(designJobs.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(designJobs)
          .innerJoin(leads, eq(leads.id, designJobs.leadId))
          .innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId))
          .innerJoin(customers, eq(customers.id, opportunities.customerId))
          .where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async findJob(access: DesignJobAccess, jobId: string) {
      const [job] = await executor.select(jobFields).from(designJobs)
        .innerJoin(leads, eq(leads.id, designJobs.leadId))
        .innerJoin(opportunities, eq(opportunities.id, designJobs.opportunityId))
        .innerJoin(customers, eq(customers.id, opportunities.customerId))
        .innerJoin(marketSectors, eq(marketSectors.id, leads.sectorId))
        .innerJoin(serviceCategories, eq(serviceCategories.id, leads.serviceCategoryId))
        .leftJoin(sql`${users} designer`, sql`designer.id = ${designJobs.designerUserId}`)
        .innerJoin(sql`${users} design_head`, sql`design_head.id = ${designJobs.designHeadUserId}`)
        .innerJoin(sql`${users} authorized_user`, sql`authorized_user.id = ${designJobs.authorizedByUserId}`)
        .leftJoin(sql`${users} updated_user`, sql`updated_user.id = ${designJobs.updatedByUserId}`)
        .where(and(eq(designJobs.id, jobId), eq(designJobs.companyId, access.companyId), accessCondition(executor, access))).limit(1);
      return job;
    },

    async touchJobUpdatedBy(companyId: string, jobId: string, userId: string, now: Date) {
      await executor.update(designJobs).set({
        updatedByUserId: userId,
        updatedAt: now,
      }).where(and(eq(designJobs.companyId, companyId), eq(designJobs.id, jobId)));
    },

    async listRevisions(companyId: string, jobId: string) {
      return executor.select().from(designPackageRevisions).where(and(
        eq(designPackageRevisions.companyId, companyId), eq(designPackageRevisions.designJobId, jobId),
      )).orderBy(desc(designPackageRevisions.revisionNumber));
    },

    async listDeadlineExtensions(companyId: string, jobId: string) {
      return executor.select().from(designDeadlineExtensions).where(and(
        eq(designDeadlineExtensions.companyId, companyId), eq(designDeadlineExtensions.designJobId, jobId),
      )).orderBy(desc(designDeadlineExtensions.sequenceNumber));
    },

    async listSurveyRevisions(companyId: string, jobId: string) {
      return executor.select().from(surveyRevisions).where(and(
        eq(surveyRevisions.companyId, companyId), eq(surveyRevisions.designJobId, jobId),
      )).orderBy(desc(surveyRevisions.revisionNumber));
    },

    async findSurveyRevision(companyId: string, jobId: string, surveyRevisionId: string) {
      const [revision] = await executor.select().from(surveyRevisions).where(and(
        eq(surveyRevisions.companyId, companyId),
        eq(surveyRevisions.designJobId, jobId),
        eq(surveyRevisions.id, surveyRevisionId),
      )).limit(1);
      return revision;
    },

    async findDraftSurveyRevision(companyId: string, jobId: string) {
      const [revision] = await executor.select().from(surveyRevisions).where(and(
        eq(surveyRevisions.companyId, companyId),
        eq(surveyRevisions.designJobId, jobId),
        eq(surveyRevisions.status, 'draft'),
      )).limit(1);
      return revision;
    },

    async lockJob(companyId: string, jobId: string) {
      const [job] = await executor.select({ id: designJobs.id }).from(designJobs).where(and(
        eq(designJobs.companyId, companyId), eq(designJobs.id, jobId),
      )).for('update');
      return job;
    },

    async lockSurveyRevision(companyId: string, jobId: string, surveyRevisionId: string) {
      const [revision] = await executor.select().from(surveyRevisions).where(and(
        eq(surveyRevisions.companyId, companyId),
        eq(surveyRevisions.designJobId, jobId),
        eq(surveyRevisions.id, surveyRevisionId),
      )).for('update');
      return revision;
    },

    async nextSurveyRevisionNumber(companyId: string, jobId: string) {
      const [row] = await executor.select({ value: max(surveyRevisions.revisionNumber) }).from(surveyRevisions).where(and(
        eq(surveyRevisions.companyId, companyId), eq(surveyRevisions.designJobId, jobId),
      ));
      return Number(row?.value ?? 0) + 1;
    },

    async createSurveyRevision(input: typeof surveyRevisions.$inferInsert) {
      const [revision] = await executor.insert(surveyRevisions).values(input).onConflictDoNothing().returning();
      return revision;
    },

    async listSurveyFiles(companyId: string, surveyRevisionId: string) {
      return executor.select().from(surveyRevisionFiles).where(and(
        eq(surveyRevisionFiles.companyId, companyId),
        eq(surveyRevisionFiles.surveyRevisionId, surveyRevisionId),
      )).orderBy(asc(surveyRevisionFiles.createdAt), asc(surveyRevisionFiles.id));
    },

    async createSurveyFile(input: typeof surveyRevisionFiles.$inferInsert) {
      const [file] = await executor.insert(surveyRevisionFiles).values(input).returning();
      return file;
    },

    async findSurveyFile(companyId: string, surveyRevisionId: string, fileId: string) {
      const [file] = await executor.select().from(surveyRevisionFiles).where(and(
        eq(surveyRevisionFiles.companyId, companyId),
        eq(surveyRevisionFiles.surveyRevisionId, surveyRevisionId),
        eq(surveyRevisionFiles.id, fileId),
      )).limit(1);
      return file;
    },

    async finalizeSurveyRevision(companyId: string, surveyRevisionId: string, expectedVersion: number, userId: string, now: Date) {
      const [revision] = await executor.update(surveyRevisions).set({
        status: 'finalized',
        finalizedByUserId: userId,
        finalizedAt: now,
        rowVersion: sql`${surveyRevisions.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(surveyRevisions.companyId, companyId),
        eq(surveyRevisions.id, surveyRevisionId),
        eq(surveyRevisions.status, 'draft'),
        eq(surveyRevisions.rowVersion, expectedVersion),
      )).returning();
      return revision;
    },

    async nextRevisionNumber(companyId: string, jobId: string) {
      const [row] = await executor.select({ value: max(designPackageRevisions.revisionNumber) }).from(designPackageRevisions).where(and(
        eq(designPackageRevisions.companyId, companyId), eq(designPackageRevisions.designJobId, jobId),
      ));
      return Number(row?.value ?? 0) + 1;
    },

    async createRevision(input: typeof designPackageRevisions.$inferInsert) {
      const [revision] = await executor.insert(designPackageRevisions).values(input).returning();
      return revision;
    },

    async findRevision(companyId: string, jobId: string, revisionId: string) {
      const [revision] = await executor.select().from(designPackageRevisions).where(and(
        eq(designPackageRevisions.companyId, companyId), eq(designPackageRevisions.designJobId, jobId), eq(designPackageRevisions.id, revisionId),
      )).limit(1);
      return revision;
    },

    async listFiles(companyId: string, revisionId: string) {
      return executor.select().from(designRevisionFiles).where(and(
        eq(designRevisionFiles.companyId, companyId), eq(designRevisionFiles.revisionId, revisionId),
      )).orderBy(asc(designRevisionFiles.kind), asc(designRevisionFiles.createdAt));
    },

    async createFile(input: typeof designRevisionFiles.$inferInsert) {
      const [file] = await executor.insert(designRevisionFiles).values(input).returning();
      return file;
    },

    async findFile(companyId: string, revisionId: string, fileId: string) {
      const [file] = await executor.select().from(designRevisionFiles).where(and(
        eq(designRevisionFiles.companyId, companyId), eq(designRevisionFiles.revisionId, revisionId), eq(designRevisionFiles.id, fileId),
      )).limit(1);
      return file;
    },

    async updateJobStatus(companyId: string, jobId: string, expectedVersion: number, status: string, now: Date, updatedByUserId?: string) {
      const [job] = await executor.update(designJobs).set({ status, ...(updatedByUserId ? { updatedByUserId } : {}), rowVersion: sql`${designJobs.rowVersion} + 1`, updatedAt: now }).where(and(
        eq(designJobs.companyId, companyId), eq(designJobs.id, jobId), eq(designJobs.rowVersion, expectedVersion),
      )).returning();
      return job;
    },

    async assignDesigner(companyId: string, jobId: string, expectedVersion: number, designerUserId: string, now: Date, dueAt: Date, updatedByUserId?: string) {
      const [job] = await executor.update(designJobs).set({
        designerUserId,
        designerAssignedAt: now,
        designDueAt: dueAt,
        bufferExtensionsUsed: 0,
        designerCompletedAt: null,
        status: 'authorized',
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
        eq(designJobs.rowVersion, expectedVersion),
        eq(designJobs.status, 'awaiting_designer'),
        sql`${designJobs.designerUserId} is null`,
      )).returning();
      return job;
    },

    async reassignAssignees(
      companyId: string,
      jobId: string,
      expectedVersion: number,
      values: Partial<typeof designJobs.$inferInsert>,
      now: Date,
    ) {
      const [job] = await executor.update(designJobs).set({
        ...values,
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
        eq(designJobs.rowVersion, expectedVersion),
        notInArray(designJobs.status, ['paused', 'cancelled', 'abandoned']),
      )).returning();
      return job;
    },

    async useDeadlineBuffer(companyId: string, jobId: string, designerUserId: string, expectedVersion: number, now: Date) {
      const [job] = await executor.update(designJobs).set({
        designDueAt: sql`${designJobs.designDueAt} + interval '3 days'`,
        bufferExtensionsUsed: sql`${designJobs.bufferExtensionsUsed} + 1`,
        updatedByUserId: designerUserId,
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
        or(eq(designJobs.designerUserId, designerUserId), administratorScope(companyId, designerUserId)),
        eq(designJobs.rowVersion, expectedVersion),
        sql`${designJobs.designerCompletedAt} is null`,
        sql`${designJobs.designDueAt} is not null`,
        sql`${designJobs.bufferExtensionsUsed} < 3`,
      )).returning();
      return job;
    },

    async createDeadlineExtension(input: typeof designDeadlineExtensions.$inferInsert) {
      const [extension] = await executor.insert(designDeadlineExtensions).values(input).returning();
      return extension;
    },

    async enqueueDeadline(companyId: string, jobId: string, dueAt: Date) {
      const epoch = Math.floor(dueAt.getTime() / 1_000);
      const [job] = await executor.insert(outboxJobs).values({
        companyId,
        type: 'engineering.design_deadline',
        payload: { jobId, dueAt: dueAt.toISOString() },
        dedupKey: `design-deadline:${jobId}:${epoch}`,
        dueAt,
      }).onConflictDoNothing().returning();
      return job;
    },

    async submitJobForReview(companyId: string, jobId: string, expectedVersion: number, now: Date, updatedByUserId?: string) {
      const [job] = await executor.update(designJobs).set({
        status: 'under_review',
        designerCompletedAt: sql`coalesce(${designJobs.designerCompletedAt}, ${now})`,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId), eq(designJobs.id, jobId), eq(designJobs.rowVersion, expectedVersion),
      )).returning();
      return job;
    },

    async transitionRevision(companyId: string, revisionId: string, expectedVersion: number, from: string, values: Partial<typeof designPackageRevisions.$inferInsert>) {
      const [revision] = await executor.update(designPackageRevisions).set({ ...values, rowVersion: sql`${designPackageRevisions.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(designPackageRevisions.companyId, companyId), eq(designPackageRevisions.id, revisionId), eq(designPackageRevisions.rowVersion, expectedVersion), eq(designPackageRevisions.status, from as never),
      )).returning();
      return revision;
    },

    createReviewAction(input: typeof designReviewActions.$inferInsert) {
      return executor.insert(designReviewActions).values(input).returning().then((rows) => rows[0]);
    },

    createCustomerDecision(input: typeof designCustomerDecisions.$inferInsert) {
      return executor.insert(designCustomerDecisions).values(input).returning().then((rows) => rows[0]);
    },

    async findReview(companyId: string, revisionId: string) {
      const [row] = await executor.select().from(designReviewActions).where(and(eq(designReviewActions.companyId, companyId), eq(designReviewActions.revisionId, revisionId))).limit(1);
      return row;
    },

    async findCustomerDecision(companyId: string, revisionId: string) {
      const [row] = await executor.select().from(designCustomerDecisions).where(and(eq(designCustomerDecisions.companyId, companyId), eq(designCustomerDecisions.revisionId, revisionId))).limit(1);
      return row;
    },

    async abandonJob(companyId: string, jobId: string, expectedVersion: number, reason: string, now: Date, updatedByUserId?: string) {
      const [job] = await executor.update(designJobs).set({
        status: 'abandoned',
        previousStatus: null,
        closedReason: reason,
        closedAt: now,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
        eq(designJobs.rowVersion, expectedVersion),
      )).returning();
      return job;
    },

    async cancelPendingDeadlineJobs(companyId: string, jobId: string, now: Date) {
      await executor.update(outboxJobs).set({
        status: 'cancelled',
        updatedAt: now,
      }).where(and(
        eq(outboxJobs.companyId, companyId),
        eq(outboxJobs.type, 'engineering.design_deadline'),
        eq(outboxJobs.status, 'pending'),
        sql`${outboxJobs.payload}->>'jobId' = ${jobId}`,
      ));
    },

    async markLeadAndOpportunityLost(
      companyId: string,
      leadId: string,
      opportunityId: string,
      reason: string,
      now: Date,
      updatedByUserId?: string,
    ) {
      await executor.update(leads).set({
        stage: 'lost',
        previousStage: null,
        lostReason: reason,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${leads.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(leads.companyId, companyId), eq(leads.id, leadId)));

      await executor.update(opportunities).set({
        commercialState: 'lost',
        previousCommercialState: null,
        rowVersion: sql`${opportunities.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(opportunities.companyId, companyId), eq(opportunities.id, opportunityId)));
    },

    async listDesignAndSalesRecipients(companyId: string, leadId: string, opportunityId: string) {
      const [leadRows, oppRows] = await Promise.all([
        executor.select({ userId: leadMembers.userId }).from(leadMembers).where(and(
          eq(leadMembers.companyId, companyId), eq(leadMembers.leadId, leadId),
        )),
        executor.select({ userId: opportunityMembers.userId }).from(opportunityMembers).where(and(
          eq(opportunityMembers.companyId, companyId), eq(opportunityMembers.opportunityId, opportunityId),
        )),
      ]);
      return [...new Set([...leadRows.map((r) => r.userId), ...oppRows.map((r) => r.userId)])];
    },
  };
}
