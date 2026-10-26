import { and, asc, count, desc, eq, exists, ilike, max, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqRevisions,
  designDeadlineExtensions,
  designCustomerDecisions,
  designJobs,
  designPackageRevisions,
  designRevisionFiles,
  designReviewActions,
  leadMembers,
  leads,
  opportunityMembers,
  outboxJobs,
  surveyRevisionFiles,
  surveyRevisions,
  users,
} from '../../infrastructure/database/schema/index.js';

export type DesignJobAccess = { companyId: string; userId: string };

function accessCondition(executor: DatabaseExecutor, access: DesignJobAccess) {
  return or(
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
  designerUserId: designJobs.designerUserId,
  designHeadUserId: designJobs.designHeadUserId,
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
};

export function createEngineeringRepository(executor: DatabaseExecutor) {
  return {
    async listJobs(access: DesignJobAccess, input: { search?: string; status?: string; limit: number; offset: number; sort: 'title' | 'status' | 'updatedAt'; direction: 'asc' | 'desc' }) {
      const filters = [eq(designJobs.companyId, access.companyId), accessCondition(executor, access)];
      if (input.status) filters.push(eq(designJobs.status, input.status));
      if (input.search) filters.push(or(ilike(designJobs.title, `%${input.search}%`), ilike(leads.leadNumber, `%${input.search}%`))!);
      const sortColumn = input.sort === 'title' ? designJobs.title : input.sort === 'status' ? designJobs.status : designJobs.updatedAt;
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);
      const where = and(...filters);
      const [items, totals] = await Promise.all([
        executor.select(jobFields).from(designJobs).innerJoin(leads, eq(leads.id, designJobs.leadId)).where(where).orderBy(order, asc(designJobs.id)).limit(input.limit).offset(input.offset),
        executor.select({ value: count() }).from(designJobs).innerJoin(leads, eq(leads.id, designJobs.leadId)).where(where),
      ]);
      return { items, total: Number(totals[0]?.value ?? 0) };
    },

    async findJob(access: DesignJobAccess, jobId: string) {
      const [job] = await executor.select({
        ...jobFields,
        designerName: sql<string | null>`designer.name`,
        designHeadName: sql<string>`design_head.name`,
      }).from(designJobs)
        .innerJoin(leads, eq(leads.id, designJobs.leadId))
        .leftJoin(sql`${users} designer`, sql`designer.id = ${designJobs.designerUserId}`)
        .innerJoin(sql`${users} design_head`, sql`design_head.id = ${designJobs.designHeadUserId}`)
        .where(and(eq(designJobs.id, jobId), eq(designJobs.companyId, access.companyId), accessCondition(executor, access))).limit(1);
      return job;
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

    async updateJobStatus(companyId: string, jobId: string, expectedVersion: number, status: string, now: Date) {
      const [job] = await executor.update(designJobs).set({ status, rowVersion: sql`${designJobs.rowVersion} + 1`, updatedAt: now }).where(and(
        eq(designJobs.companyId, companyId), eq(designJobs.id, jobId), eq(designJobs.rowVersion, expectedVersion),
      )).returning();
      return job;
    },

    async assignDesigner(companyId: string, jobId: string, expectedVersion: number, designerUserId: string, now: Date, dueAt: Date) {
      const [job] = await executor.update(designJobs).set({
        designerUserId,
        designerAssignedAt: now,
        designDueAt: dueAt,
        bufferExtensionsUsed: 0,
        designerCompletedAt: null,
        status: 'authorized',
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

    async useDeadlineBuffer(companyId: string, jobId: string, designerUserId: string, expectedVersion: number, now: Date) {
      const [job] = await executor.update(designJobs).set({
        designDueAt: sql`${designJobs.designDueAt} + interval '3 days'`,
        bufferExtensionsUsed: sql`${designJobs.bufferExtensionsUsed} + 1`,
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
        eq(designJobs.designerUserId, designerUserId),
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

    async submitJobForReview(companyId: string, jobId: string, expectedVersion: number, now: Date) {
      const [job] = await executor.update(designJobs).set({
        status: 'under_review',
        designerCompletedAt: sql`coalesce(${designJobs.designerCompletedAt}, ${now})`,
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
  };
}
