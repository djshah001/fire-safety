import { createHash } from 'node:crypto';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createCrmRepository } from '../crm/crm.repository.js';
import { createEngineeringRepository } from '../engineering/engineering.repository.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createProjectRepository } from './project.repository.js';

type StartInput = {
  title: string; designRevisionId: string; boqRevisionId?: string; projectManagerUserId: string;
  memberUserIds: string[]; startDate: string; targetCompletionDate: string; startReason: string; idempotencyKey: string;
};

function payloadHash(input: StartInput) {
  return createHash('sha256').update(JSON.stringify({ ...input, memberUserIds: [...input.memberUserIds].sort() })).digest('hex');
}

function isOpportunityConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505' && 'constraint' in error && error.constraint === 'projects_company_opportunity_uidx');
}

function currentDateIn(timezone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export class ProjectService {
  constructor(private readonly database: Database = db) {}

  private assert(principal: AuthenticatedPrincipal, permission: 'project.read' | 'project.start') {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    if (!hasPermission(principal, permission)) throw new ForbiddenError();
  }

  async list(principal: AuthenticatedPrincipal, input: { search?: string; status?: string; commercialState?: string; page: number; pageSize: number; sort: 'projectNumber' | 'title' | 'status' | 'startDate' | 'targetCompletionDate'; direction: 'asc' | 'desc' }) {
    this.assert(principal, 'project.read');
    const result = await createProjectRepository(this.database).list(principal.companyId, principal.userId, { ...input, limit: input.pageSize, offset: (input.page - 1) * input.pageSize });
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async get(principal: AuthenticatedPrincipal, projectId: string) {
    this.assert(principal, 'project.read');
    const repository = createProjectRepository(this.database);
    const project = await repository.find(principal.companyId, principal.userId, projectId);
    if (!project) throw new NotFoundError('Project not found.');
    return { project, ...await repository.detailParts(principal.companyId, projectId) };
  }

  private async scopedJob(principal: AuthenticatedPrincipal, jobId: string) {
    this.assert(principal, 'project.start');
    this.assert(principal, 'project.read');
    const job = await createEngineeringRepository(this.database).findJob({ companyId: principal.companyId, userId: principal.userId }, jobId);
    if (!job) throw new NotFoundError('Design job not found in your assigned scope.');
    return job;
  }

  async startOptions(principal: AuthenticatedPrincipal, jobId: string) {
    await this.scopedJob(principal, jobId);
    const repository = createProjectRepository(this.database);
    const context = await repository.startContext(principal.companyId, jobId);
    if (!context) throw new NotFoundError('Design job not found.');
    const [designRevisions, boqRevisions, eligibleMembers, existing] = await Promise.all([
      repository.listApprovedDesigns(principal.companyId, jobId), repository.listApprovedBoqs(principal.companyId, jobId),
      createCrmRepository(this.database).listEligibleUsers(principal.companyId, 'project.read'),
      repository.findByOpportunity(principal.companyId, context.opportunityId),
    ]);
    return { context, designRevisions, boqRevisions, eligibleMembers, existingProjectId: existing?.id ?? null };
  }

  async start(principal: AuthenticatedPrincipal, jobId: string, input: StartInput, requestId: string) {
    await this.scopedJob(principal, jobId);
    const repository = createProjectRepository(this.database);
    const context = await repository.startContext(principal.companyId, jobId);
    if (!context) throw new NotFoundError('Design job not found.');
    if (!context.siteId || !context.siteName || context.siteStatus !== 'active' || context.siteCustomerId !== context.customerId) throw new AppError('VALIDATION_ERROR', 'An active site belonging to the opportunity customer is required before project start.', 422);
    if (input.startDate > currentDateIn(context.timezone)) throw new AppError('VALIDATION_ERROR', 'Actual project start date cannot be in the future.', 422);
    const designs = await repository.listApprovedDesigns(principal.companyId, jobId);
    const design = designs.find((item) => item.id === input.designRevisionId);
    if (!design) throw new AppError('VALIDATION_ERROR', 'Choose an exact customer-approved design revision.', 422);
    const boqs = await repository.listApprovedBoqs(principal.companyId, jobId);
    const boq = input.boqRevisionId ? boqs.find((item) => item.id === input.boqRevisionId) : undefined;
    if (input.boqRevisionId && (!boq || boq.designRevisionId !== design.id)) throw new AppError('VALIDATION_ERROR', 'The approved BOQ must belong to the selected design revision.', 422);

    const requestedMembers = [...new Set([input.projectManagerUserId, ...input.memberUserIds, principal.userId])];
    const eligible = await Promise.all(requestedMembers.map((userId) => createCrmRepository(this.database).findEligibleUser(principal.companyId, userId, 'project.read')));
    if (eligible.some((user) => !user)) throw new AppError('VALIDATION_ERROR', 'Every project member must be an active employee eligible for project access.', 422);
    const hash = payloadHash(input);

    try {
      const projectId = await this.database.transaction(async (transaction) => {
        const tx = createProjectRepository(transaction);
        const reservation = await tx.reserveIdempotency({ companyId: principal.companyId, actorUserId: principal.userId, action: 'project.start', idempotencyKey: input.idempotencyKey, payloadHash: hash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000) });
        if (!reservation) {
          const existingRequest = await tx.findIdempotency(principal.companyId, principal.userId, input.idempotencyKey);
          if (!existingRequest || existingRequest.payloadHash !== hash) throw new ConflictError('This project-start key was already used with different details.');
          const existingId = existingRequest.responseBody?.projectId;
          if (typeof existingId !== 'string') throw new ConflictError('The matching project start is still being processed. Retry shortly.');
          return existingId;
        }
        if (await tx.findByOpportunity(principal.companyId, context.opportunityId)) throw new ConflictError('This opportunity already has a project.');
        const now = new Date();
        const project = await tx.create({ companyId: principal.companyId, projectNumber: await tx.allocateNumber(principal.companyId, now), opportunityId: context.opportunityId, customerId: context.customerId, siteId: context.siteId!, title: input.title, startDate: input.startDate, targetCompletionDate: input.targetCompletionDate, startReason: input.startReason, startedByUserId: principal.userId });
        await tx.createMembers(requestedMembers.map((userId) => ({ companyId: principal.companyId, projectId: project.id, userId, assignedByUserId: principal.userId, role: userId === input.projectManagerUserId ? 'project_manager' : userId === principal.userId ? 'sales' : 'member' })));
        await tx.createDesignBaseline({ companyId: principal.companyId, projectId: project.id, designJobId: jobId, designRevisionId: design.id, designCustomerDecisionId: design.decisionId, boqRevisionId: boq?.id, customerEvidenceSnapshot: design.evidenceReference, createdByUserId: principal.userId });
        const accepted = await tx.acceptedQuotation(principal.companyId, context.opportunityId);
        if (accepted) await tx.attachCommercialBaseline({ companyId: principal.companyId, projectId: project.id, quotationRevisionId: accepted.revisionId, quotationCustomerDecisionId: accepted.decisionId, customerEvidenceSnapshot: accepted.evidenceReference, customerOrderReference: accepted.customerOrderReference, acceptedAt: accepted.recordedAt, createdByUserId: principal.userId });
        await createNotificationRepository(transaction).createMany(requestedMembers.filter((userId) => userId !== principal.userId).map((recipientUserId) => ({ companyId: principal.companyId, recipientUserId, type: 'project.started', severity: 'success' as const, title: 'Project started', message: `${project.projectNumber} · ${project.title} was assigned to you.`, link: `/projects/${project.id}`, targetType: 'project', targetId: project.id, dedupKey: `project-started:${project.id}` })));
        await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: context.commercialState === 'awarded' ? 'project.started' : 'project.started_before_award', targetType: 'project', targetId: project.id, requestId, metadata: { opportunityId: context.opportunityId, designRevisionId: design.id, boqRevisionId: boq?.id, commercialStateAtStart: context.commercialState, startDate: input.startDate, targetCompletionDate: input.targetCompletionDate } });
        await tx.completeIdempotency(reservation.id, project.id);
        return project.id;
      });
      return this.get(principal, projectId);
    } catch (error) {
      if (isOpportunityConflict(error)) throw new ConflictError('This opportunity already has a project.');
      throw error;
    }
  }
}

export const projectService = new ProjectService();
