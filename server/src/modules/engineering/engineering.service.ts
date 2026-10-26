import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { removePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createCrmRepository } from '../crm/crm.repository.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createEngineeringRepository } from './engineering.repository.js';

type ListInput = { search?: string; status?: string; page: number; pageSize: number; sort: 'title' | 'status' | 'updatedAt'; direction: 'asc' | 'desc' };

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function safeName(value: string) {
  return Array.from(path.basename(value)).map((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? '_' : character;
  }).join('').slice(0, 255);
}

function addCalendarDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}

function canOpenEngineering(principal: AuthenticatedPrincipal) {
  return ['engineering.design.write', 'engineering.design.assign_engineer', 'engineering.design.review', 'engineering.design.customer_decision', 'engineering.estimate.read', 'engineering.boq.purchase_review', 'engineering.boq.final_review', 'engineering.quotation.read', 'project.start']
    .some((permission) => hasPermission(principal, permission));
}

function designFileDto(file: {
  id: string; kind: 'cad' | 'pdf'; originalName: string; mimeType: string; sizeBytes: number;
  checksumSha256: string; createdByUserId: string; createdAt: Date;
}) {
  return {
    id: file.id, kind: file.kind, originalName: file.originalName, mimeType: file.mimeType,
    sizeBytes: file.sizeBytes, checksumSha256: file.checksumSha256,
    createdByUserId: file.createdByUserId, createdAt: file.createdAt,
  };
}

function surveyFileDto(file: {
  id: string; originalName: string; mimeType: string; sizeBytes: number;
  checksumSha256: string; createdByUserId: string; createdAt: Date;
}) {
  return {
    id: file.id, originalName: file.originalName, mimeType: file.mimeType,
    sizeBytes: file.sizeBytes, checksumSha256: file.checksumSha256,
    createdByUserId: file.createdByUserId, createdAt: file.createdAt,
  };
}

export class EngineeringService {
  constructor(private readonly database: Database = db) {}

  private assertFeature(principal: AuthenticatedPrincipal) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    if (!canOpenEngineering(principal)) throw new ForbiddenError();
  }

  private async job(principal: AuthenticatedPrincipal, jobId: string) {
    this.assertFeature(principal);
    const job = await createEngineeringRepository(this.database).findJob({ companyId: principal.companyId, userId: principal.userId }, jobId);
    if (!job) throw new NotFoundError('Design job not found.');
    return job;
  }

  async listJobs(principal: AuthenticatedPrincipal, input: ListInput) {
    this.assertFeature(principal);
    const result = await createEngineeringRepository(this.database).listJobs(
      { companyId: principal.companyId, userId: principal.userId },
      { ...input, limit: input.pageSize, offset: (input.page - 1) * input.pageSize },
    );
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async getJob(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.job(principal, jobId);
    const repository = createEngineeringRepository(this.database);
    const revisions = await repository.listRevisions(principal.companyId, jobId);
    const surveyRevisions = await repository.listSurveyRevisions(principal.companyId, jobId);
    return {
      job,
      deadlineExtensions: await repository.listDeadlineExtensions(principal.companyId, jobId),
      surveyRevisions: await Promise.all(surveyRevisions.map(async (revision) => ({
        ...revision,
        files: (await repository.listSurveyFiles(principal.companyId, revision.id)).map(surveyFileDto),
      }))),
      revisions: await Promise.all(revisions.map(async (revision) => ({
        ...revision,
        files: (await repository.listFiles(principal.companyId, revision.id)).map(designFileDto),
        review: await repository.findReview(principal.companyId, revision.id) ?? null,
        customerDecision: await repository.findCustomerDecision(principal.companyId, revision.id) ?? null,
      }))),
    };
  }

  async listEligibleDesigners(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.job(principal, jobId);
    if (!hasPermission(principal, 'engineering.design.assign_engineer') || job.designHeadUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned design head can choose the design engineer.');
    }
    return createCrmRepository(this.database).listEligibleUsers(principal.companyId, 'engineering.design.write');
  }

  async assignDesigner(
    principal: AuthenticatedPrincipal,
    jobId: string,
    input: { designerUserId: string; expectedVersion: number },
    requestId: string,
  ) {
    const job = await this.job(principal, jobId);
    if (!hasPermission(principal, 'engineering.design.assign_engineer') || job.designHeadUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned design head can choose the design engineer.');
    }
    if (input.designerUserId === principal.userId) {
      throw new AppError('VALIDATION_ERROR', 'The design engineer must be different from the design head.', 422);
    }
    const designer = await createCrmRepository(this.database).findEligibleUser(
      principal.companyId, input.designerUserId, 'engineering.design.write',
    );
    if (!designer) throw new AppError('VALIDATION_ERROR', 'Choose an active employee eligible for design work.', 422);
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const dueAt = addCalendarDays(now, 2);
      const updated = await createEngineeringRepository(transaction).assignDesigner(
        principal.companyId, jobId, input.expectedVersion, input.designerUserId, now, dueAt,
      );
      if (!updated) throw new ConflictError('The design job changed or already has a design engineer.');
      await createEngineeringRepository(transaction).enqueueDeadline(principal.companyId, jobId, dueAt);
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: input.designerUserId,
        type: 'engineering.design_assigned',
        severity: 'info',
        title: 'Design task assigned',
        message: `${job.title} is due in 2 calendar days.`,
        link: `/engineering/design-jobs/${jobId}`,
        targetType: 'design_job',
        targetId: jobId,
        dedupKey: `design-assigned:${jobId}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.design_engineer_assigned',
        targetType: 'design_job',
        targetId: jobId,
        requestId,
        metadata: { designerUserId: input.designerUserId },
      });
      return updated;
    });
  }

  async useDeadlineBuffer(
    principal: AuthenticatedPrincipal,
    jobId: string,
    input: { reason: string; expectedVersion: number },
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designerUserId !== principal.userId) throw new ForbiddenError('Only the assigned designer can use this buffer.');
    if (job.designerCompletedAt) throw new ConflictError('The design completion clock stopped when the first revision was submitted.');
    if (!job.designDueAt || job.bufferExtensionsUsed >= 3) throw new ConflictError('No design buffer extensions remain.');
    const currentDueAt = job.designDueAt;

    return this.database.transaction(async (transaction) => {
      const repository = createEngineeringRepository(transaction);
      const updated = await repository.useDeadlineBuffer(
        principal.companyId, jobId, principal.userId, input.expectedVersion, new Date(),
      );
      if (!updated || !updated.designDueAt) throw new ConflictError('The design job changed or no buffer extensions remain.');
      const sequenceNumber = updated.bufferExtensionsUsed;
      await repository.createDeadlineExtension({
        companyId: principal.companyId,
        designJobId: jobId,
        sequenceNumber,
        previousDueAt: currentDueAt,
        newDueAt: updated.designDueAt,
        reason: input.reason,
        requestedByUserId: principal.userId,
      });
      await repository.enqueueDeadline(principal.companyId, jobId, updated.designDueAt);
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: job.designHeadUserId,
        type: 'engineering.design_buffer_used',
        severity: 'warning',
        title: 'Designer used a 3-day buffer',
        message: `${job.title}: extension ${sequenceNumber} of 3. Reason: ${input.reason}`,
        link: `/engineering/design-jobs/${jobId}`,
        targetType: 'design_job',
        targetId: jobId,
        dedupKey: `design-buffer:${jobId}:${sequenceNumber}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.design_deadline_extended',
        targetType: 'design_job',
        targetId: jobId,
        requestId,
        metadata: { sequenceNumber, previousDueAt: currentDueAt.toISOString(), newDueAt: updated.designDueAt.toISOString(), reason: input.reason },
      });
      return updated;
    });
  }

  async createRevision(principal: AuthenticatedPrincipal, jobId: string, input: { title: string; changeSummary: string; expectedJobVersion: number }, requestId: string) {
    if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
    const current = await this.job(principal, jobId);
    if (current.designerUserId !== principal.userId) throw new ForbiddenError('Only the assigned designer can create a revision.');
    if (!['authorized', 'returned', 'changes_requested'].includes(current.status)) throw new ConflictError('A new revision cannot be created in the current design state.');
    if (current.rowVersion !== input.expectedJobVersion) throw new ConflictError('The design job changed. Refresh and try again.');

    return this.database.transaction(async (transaction) => {
      const repository = createEngineeringRepository(transaction);
      const revision = await repository.createRevision({
        companyId: principal.companyId,
        designJobId: jobId,
        revisionNumber: await repository.nextRevisionNumber(principal.companyId, jobId),
        title: input.title,
        changeSummary: input.changeSummary,
        createdByUserId: principal.userId,
      });
      const updatedJob = await repository.updateJobStatus(principal.companyId, jobId, input.expectedJobVersion, 'draft', new Date());
      if (!updatedJob) throw new ConflictError('The design job changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.revision_created',
        targetType: 'design_revision', targetId: revision!.id, requestId,
        metadata: { designJobId: jobId, revisionNumber: revision!.revisionNumber },
      });
      return revision!;
    });
  }

  async createSurveyRevision(
    principal: AuthenticatedPrincipal,
    jobId: string,
    input: { title: string; changeSummary: string; surveyedOn: string },
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designerUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned designer can create a survey revision.');
    }

    return this.database.transaction(async (transaction) => {
      const repository = createEngineeringRepository(transaction);
      if (!await repository.lockJob(principal.companyId, jobId)) throw new NotFoundError('Design job not found.');
      if (await repository.findDraftSurveyRevision(principal.companyId, jobId)) {
        throw new ConflictError('Finalize the current survey draft before creating another revision.');
      }
      const revisionNumber = await repository.nextSurveyRevisionNumber(principal.companyId, jobId);
      const revision = await repository.createSurveyRevision({
        companyId: principal.companyId,
        designJobId: jobId,
        revisionNumber,
        title: input.title,
        changeSummary: input.changeSummary,
        surveyedOn: input.surveyedOn,
        createdByUserId: principal.userId,
      });
      if (!revision) throw new ConflictError('A survey draft already exists. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.survey_revision_created',
        targetType: 'survey_revision',
        targetId: revision.id,
        requestId,
        metadata: { designJobId: jobId, revisionNumber, surveyedOn: input.surveyedOn },
      });
      return revision;
    });
  }

  async uploadSurveyFile(
    principal: AuthenticatedPrincipal,
    jobId: string,
    surveyRevisionId: string,
    file: Express.Multer.File,
    requestId: string,
  ) {
    try {
      if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
      const job = await this.job(principal, jobId);
      if (job.designerUserId !== principal.userId) {
        throw new ForbiddenError('Only the assigned designer can upload survey files.');
      }
      const extension = path.extname(file.originalname).toLowerCase();
      if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
        throw new AppError('VALIDATION_ERROR', 'Survey files must be PDF, JPG, PNG, or WebP.', 422);
      }
      const originalName = safeName(file.originalname);
      if (!originalName) throw new AppError('VALIDATION_ERROR', 'The uploaded file must have a name.', 422);
      const checksumSha256 = await sha256File(file.path);

      return await this.database.transaction(async (transaction) => {
        const repository = createEngineeringRepository(transaction);
        const revision = await repository.lockSurveyRevision(principal.companyId, jobId, surveyRevisionId);
        if (!revision) throw new NotFoundError('Survey revision not found.');
        if (revision.status !== 'draft') {
          throw new ConflictError('Finalized survey revisions are immutable. Create a new revision to add files.');
        }
        const files = await repository.listSurveyFiles(principal.companyId, surveyRevisionId);
        if (files.length >= 25) throw new AppError('VALIDATION_ERROR', 'A survey revision can contain at most 25 files.', 422);
        const created = await repository.createSurveyFile({
          companyId: principal.companyId,
          surveyRevisionId,
          originalName,
          storageName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          createdByUserId: principal.userId,
        });
        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'engineering.survey_file_uploaded',
          targetType: 'survey_revision_file',
          targetId: created!.id,
          requestId,
          metadata: { designJobId: jobId, surveyRevisionId, sizeBytes: file.size },
        });
        return surveyFileDto(created!);
      });
    } catch (error) {
      await removePrivateFile(file.filename);
      throw error;
    }
  }

  async finalizeSurveyRevision(
    principal: AuthenticatedPrincipal,
    jobId: string,
    surveyRevisionId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designerUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned designer can finalize this survey revision.');
    }

    return this.database.transaction(async (transaction) => {
      const repository = createEngineeringRepository(transaction);
      const revision = await repository.lockSurveyRevision(principal.companyId, jobId, surveyRevisionId);
      if (!revision) throw new NotFoundError('Survey revision not found.');
      if (revision.status !== 'draft' || revision.rowVersion !== expectedVersion) {
        throw new ConflictError('The survey revision changed or is already finalized.');
      }
      const files = await repository.listSurveyFiles(principal.companyId, surveyRevisionId);
      if (files.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Upload at least one survey file before finalizing the revision.', 422);
      }
      const finalized = await repository.finalizeSurveyRevision(
        principal.companyId, surveyRevisionId, expectedVersion, principal.userId, new Date(),
      );
      if (!finalized) throw new ConflictError('The survey revision changed or is already finalized.');
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: job.designHeadUserId,
        type: 'engineering.survey_finalized',
        severity: 'info',
        title: 'Site survey revision finalized',
        message: `${job.title} survey S${revision.revisionNumber} is available.`,
        link: `/engineering/design-jobs/${jobId}`,
        targetType: 'survey_revision',
        targetId: surveyRevisionId,
        dedupKey: `survey-finalized:${surveyRevisionId}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.survey_revision_finalized',
        targetType: 'survey_revision',
        targetId: surveyRevisionId,
        requestId,
        metadata: { designJobId: jobId, revisionNumber: revision.revisionNumber, fileCount: files.length },
      });
      return finalized;
    });
  }

  async uploadFile(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, kind: 'cad' | 'pdf', file: Express.Multer.File, requestId: string) {
    try {
      if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
      const job = await this.job(principal, jobId);
      if (job.designerUserId !== principal.userId) throw new ForbiddenError('Only the assigned designer can upload design files.');
      const extension = path.extname(file.originalname).toLowerCase();
      if (kind === 'cad' && !['.dwg', '.dxf'].includes(extension)) throw new AppError('VALIDATION_ERROR', 'CAD files must use the .dwg or .dxf extension.', 422);
      if (kind === 'pdf' && extension !== '.pdf') throw new AppError('VALIDATION_ERROR', 'Preview files must use the .pdf extension.', 422);
      const repository = createEngineeringRepository(this.database);
      const revision = await repository.findRevision(principal.companyId, jobId, revisionId);
      if (!revision) throw new NotFoundError('Design revision not found.');
      if (revision.status !== 'draft') throw new ConflictError('Submitted revisions are immutable. Create a new revision to change files.');
      const originalName = safeName(file.originalname);
      if (!originalName) throw new AppError('VALIDATION_ERROR', 'The uploaded file must have a name.', 422);
      return await this.database.transaction(async (transaction) => {
        const created = await createEngineeringRepository(transaction).createFile({
          companyId: principal.companyId, revisionId, kind, originalName, storageName: file.filename,
          mimeType: file.mimetype, sizeBytes: file.size, checksumSha256: await sha256File(file.path), createdByUserId: principal.userId,
        });
        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.revision_file_uploaded',
          targetType: 'design_revision_file', targetId: created!.id, requestId,
          metadata: { designJobId: jobId, revisionId, kind, sizeBytes: file.size },
        });
        return designFileDto(created!);
      });
    } catch (error) {
      await removePrivateFile(file.filename);
      throw error;
    }
  }

  async submitRevision(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, expectedVersion: number, requestId: string) {
    if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designerUserId !== principal.userId) throw new ForbiddenError('Only the assigned designer can submit this revision.');
    const repository = createEngineeringRepository(this.database);
    const revision = await repository.findRevision(principal.companyId, jobId, revisionId);
    if (!revision) throw new NotFoundError('Design revision not found.');
    const files = await repository.listFiles(principal.companyId, revisionId);
    if (!files.some((file) => file.kind === 'cad') || !files.some((file) => file.kind === 'pdf')) {
      throw new AppError('VALIDATION_ERROR', 'Upload at least one original CAD file and one PDF preview before submission.', 422);
    }
    return this.database.transaction(async (transaction) => {
      const tx = createEngineeringRepository(transaction);
      const now = new Date();
      const updated = await tx.transitionRevision(principal.companyId, revisionId, expectedVersion, 'draft', { status: 'submitted', submittedByUserId: principal.userId, submittedAt: now });
      if (!updated) throw new ConflictError('The revision changed or is no longer a draft.');
      if (!await tx.submitJobForReview(principal.companyId, jobId, job.rowVersion, now)) throw new ConflictError('The design job changed. Refresh and try again.');
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: job.designHeadUserId,
        type: 'engineering.design_submitted', severity: 'info', title: 'Design ready for review',
        message: `${job.title} revision R${revision.revisionNumber} was submitted.`, link: `/engineering/design-jobs/${jobId}`,
        targetType: 'design_job', targetId: jobId, dedupKey: `design-submitted:${revisionId}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.revision_submitted', targetType: 'design_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, revisionNumber: revision.revisionNumber } });
      return updated;
    });
  }

  async reviewRevision(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }, requestId: string) {
    if (!hasPermission(principal, 'engineering.design.review')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designHeadUserId !== principal.userId) throw new ForbiddenError('Only the assigned design head can review this revision.');
    const repository = createEngineeringRepository(this.database);
    const revision = await repository.findRevision(principal.companyId, jobId, revisionId);
    if (!revision) throw new NotFoundError('Design revision not found.');
    if (revision.createdByUserId === principal.userId || revision.submittedByUserId === principal.userId) throw new ForbiddenError('You cannot approve or return your own revision.');
    const target = input.decision === 'approved' ? 'internally_approved' : 'returned';
    return this.database.transaction(async (transaction) => {
      const tx = createEngineeringRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, revisionId, input.expectedVersion, 'submitted', { status: target });
      if (!updated) throw new ConflictError('The revision changed or is no longer awaiting review.');
      if (!await tx.updateJobStatus(principal.companyId, jobId, job.rowVersion, target, new Date())) throw new ConflictError('The design job changed. Refresh and try again.');
      await tx.createReviewAction({ companyId: principal.companyId, revisionId, decision: input.decision, reason: input.reason, actorUserId: principal.userId });
      if (job.designerUserId) await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: job.designerUserId,
        type: `engineering.design_${input.decision}`, severity: input.decision === 'approved' ? 'success' : 'warning',
        title: input.decision === 'approved' ? 'Design approved internally' : 'Design returned for changes',
        message: input.decision === 'approved' ? `${job.title} passed design-head review.` : `${job.title}: ${input.reason}`,
        link: `/engineering/design-jobs/${jobId}`, targetType: 'design_job', targetId: jobId,
        dedupKey: `design-review:${revisionId}:${input.decision}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: `engineering.revision_${input.decision}`, targetType: 'design_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, reason: input.reason } });
      return updated;
    });
  }

  async sendToCustomer(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, expectedVersion: number, requestId: string) {
    if (!hasPermission(principal, 'engineering.design.customer_decision')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    const revision = await createEngineeringRepository(this.database).findRevision(principal.companyId, jobId, revisionId);
    if (!revision) throw new NotFoundError('Design revision not found.');
    return this.database.transaction(async (transaction) => {
      const tx = createEngineeringRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, revisionId, expectedVersion, 'internally_approved', { status: 'sent_to_customer' });
      if (!updated) throw new ConflictError('Only an internally approved revision can be sent to the customer.');
      if (!await tx.updateJobStatus(principal.companyId, jobId, job.rowVersion, 'sent_to_customer', new Date())) throw new ConflictError('The design job changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.revision_sent_to_customer', targetType: 'design_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId } });
      return updated;
    });
  }

  async recordCustomerDecision(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: { decision: 'approved' | 'changes_requested'; evidenceReference: string; notes?: string; expectedVersion: number }, requestId: string) {
    if (!hasPermission(principal, 'engineering.design.customer_decision')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    const revision = await createEngineeringRepository(this.database).findRevision(principal.companyId, jobId, revisionId);
    if (!revision) throw new NotFoundError('Design revision not found.');
    const target = input.decision === 'approved' ? 'customer_approved' : 'changes_requested';
    return this.database.transaction(async (transaction) => {
      const tx = createEngineeringRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, revisionId, input.expectedVersion, 'sent_to_customer', { status: target });
      if (!updated) throw new ConflictError('The customer decision was already recorded or the revision changed.');
      if (!await tx.updateJobStatus(principal.companyId, jobId, job.rowVersion, target, new Date())) throw new ConflictError('The design job changed. Refresh and try again.');
      await tx.createCustomerDecision({ companyId: principal.companyId, revisionId, decision: input.decision, evidenceReference: input.evidenceReference, notes: input.notes, recordedByUserId: principal.userId });
      const recipients = [...new Set([job.designerUserId, job.designHeadUserId].filter((id): id is string => Boolean(id) && id !== principal.userId))];
      await createNotificationRepository(transaction).createMany(recipients.map((recipientUserId) => ({
        companyId: principal.companyId, recipientUserId,
        type: `engineering.customer_${input.decision}`, severity: input.decision === 'approved' ? 'success' as const : 'warning' as const,
        title: input.decision === 'approved' ? 'Customer approved design' : 'Customer requested design changes',
        message: `${job.title} customer decision: ${input.decision.replace('_', ' ')}.`,
        link: `/engineering/design-jobs/${jobId}`, targetType: 'design_job', targetId: jobId,
        dedupKey: `design-customer:${revisionId}:${input.decision}`,
      })));
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: `engineering.customer_${input.decision}`, targetType: 'design_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, evidenceReference: input.evidenceReference } });
      return updated;
    });
  }

  async getFile(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, fileId: string) {
    await this.job(principal, jobId);
    const repository = createEngineeringRepository(this.database);
    if (!await repository.findRevision(principal.companyId, jobId, revisionId)) throw new NotFoundError('Design revision not found.');
    const file = await repository.findFile(principal.companyId, revisionId, fileId);
    if (!file) throw new NotFoundError('Design file not found.');
    return file;
  }

  async getSurveyFile(principal: AuthenticatedPrincipal, jobId: string, surveyRevisionId: string, fileId: string) {
    await this.job(principal, jobId);
    const repository = createEngineeringRepository(this.database);
    if (!await repository.findSurveyRevision(principal.companyId, jobId, surveyRevisionId)) {
      throw new NotFoundError('Survey revision not found.');
    }
    const file = await repository.findSurveyFile(principal.companyId, surveyRevisionId, fileId);
    if (!file) throw new NotFoundError('Survey file not found.');
    return file;
  }
}

export const engineeringService = new EngineeringService();
