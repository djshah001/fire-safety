import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createEngineeringRepository } from './engineering.repository.js';
import { createBoqRepository } from './boq.repository.js';

type TechnicalInput = {
  itemId: string; section: string; specification: string; brand?: string; model?: string; quantity: string;
  drawingReference?: string; notes?: string; expectedBoqVersion: number; expectedLineVersion?: number;
};
type EstimateInput = {
  boqLineId?: string; category: 'material' | 'labour' | 'transport' | 'subcontracting' | 'overhead' | 'wastage' | 'margin';
  description: string; quantity: string; unitRate: string; notes?: string; expectedBoqVersion: number; expectedLineVersion?: number;
};

function validationError(message: string) { return new AppError('VALIDATION_ERROR', message, 422); }

function publicTechnicalLine(line: Awaited<ReturnType<ReturnType<typeof createBoqRepository>['listLines']>>[number]) {
  return {
    id: line.id, lineNumber: line.lineNumber, section: line.section, itemId: line.itemId,
    itemCode: line.itemCodeSnapshot, itemName: line.itemNameSnapshot, specification: line.specificationSnapshot,
    brand: line.brand, model: line.model, unitId: line.unitId, unitSymbol: line.unitSymbolSnapshot,
    quantity: line.quantity, drawingReference: line.drawingReference, notes: line.notes,
    rowVersion: line.rowVersion, createdAt: line.createdAt, updatedAt: line.updatedAt,
  };
}

function publicEstimateLine(line: Awaited<ReturnType<ReturnType<typeof createBoqRepository>['listEstimateLines']>>[number]) {
  return {
    id: line.id, boqLineId: line.boqLineId, lineNumber: line.lineNumber, category: line.category,
    description: line.description, quantity: line.quantity, unitRate: line.unitRate, lineTotal: line.lineTotal,
    notes: line.notes, rowVersion: line.rowVersion, createdAt: line.createdAt, updatedAt: line.updatedAt,
  };
}

function estimateTotals(lines: Array<{ category: string; lineTotal: string }>) {
  const byCategory: Record<string, string> = {};
  let total = new Decimal(0);
  for (const line of lines) {
    const amount = new Decimal(line.lineTotal);
    byCategory[line.category] = new Decimal(byCategory[line.category] ?? 0).plus(amount).toFixed(2);
    total = total.plus(amount);
  }
  return { byCategory, total: total.toFixed(2) };
}

export class BoqService {
  constructor(private readonly database: Database = db) {}

  private async job(principal: AuthenticatedPrincipal, jobId: string) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    if (!['engineering.design.write', 'engineering.design.review', 'engineering.design.customer_decision', 'engineering.estimate.read']
      .some((permission) => hasPermission(principal, permission))) throw new ForbiddenError();
    const job = await createEngineeringRepository(this.database).findJob({ companyId: principal.companyId, userId: principal.userId }, jobId);
    if (!job) throw new NotFoundError('Design job not found.');
    return job;
  }

  private async designer(principal: AuthenticatedPrincipal, jobId: string, estimate = false) {
    if (!hasPermission(principal, 'engineering.design.write') || (estimate && !hasPermission(principal, 'engineering.estimate.write'))) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designerUserId !== principal.userId) throw new ForbiddenError('Only the assigned designer can edit this BOQ.');
    return job;
  }

  async getWorkspace(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.job(principal, jobId);
    const repository = createBoqRepository(this.database);
    const canViewEstimate = hasPermission(principal, 'engineering.estimate.read');
    const revisions = await repository.listRevisions(principal.companyId, jobId);
    const boqs = await Promise.all(revisions.map(async (revision) => {
      const technicalLines = (await repository.listLines(principal.companyId, revision.id)).map(publicTechnicalLine);
      const base = { ...revision, technicalLines, review: await repository.findReview(principal.companyId, revision.id) ?? null };
      if (!canViewEstimate) return base;
      const lines = (await repository.listEstimateLines(principal.companyId, revision.id)).map(publicEstimateLine);
      return { ...base, estimateLines: lines, estimateTotals: estimateTotals(lines) };
    }));
    return {
      job,
      eligibleDesignRevisions: await repository.listEligibleDesignRevisions(principal.companyId, jobId),
      boqs,
      canViewEstimate,
      canEditEstimate: hasPermission(principal, 'engineering.estimate.write') && job.designerUserId === principal.userId,
    };
  }

  async listCatalog(principal: AuthenticatedPrincipal, jobId: string, search?: string) {
    await this.job(principal, jobId);
    return createBoqRepository(this.database).listActiveItems(principal.companyId, search);
  }

  async createRevision(principal: AuthenticatedPrincipal, jobId: string, input: { designRevisionId: string; sourceBoqRevisionId?: string; title: string; changeSummary: string }, requestId: string) {
    await this.designer(principal, jobId, true);
    const repository = createBoqRepository(this.database);
    const designRevision = await createEngineeringRepository(this.database).findRevision(principal.companyId, jobId, input.designRevisionId);
    if (!designRevision || designRevision.status !== 'customer_approved') throw validationError('Choose a customer-approved design revision.');
    const existing = await repository.listRevisions(principal.companyId, jobId);
    if (existing.some((revision) => revision.status === 'draft')) throw new ConflictError('This design job already has a draft BOQ.');
    if (existing.length > 0 && existing[0]!.status !== 'returned' && !(existing[0]!.status === 'approved' && existing[0]!.designRevisionId !== input.designRevisionId)) {
      throw new ConflictError('Create the next BOQ only after a return or for a newer customer-approved design revision.');
    }
    const source = input.sourceBoqRevisionId ? await repository.findRevision(principal.companyId, jobId, input.sourceBoqRevisionId) : undefined;
    if (input.sourceBoqRevisionId && (!source || !['returned', 'approved'].includes(source.status))) throw validationError('Only a returned or approved BOQ revision can be copied into a new revision.');

    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const created = await tx.createRevision({
        companyId: principal.companyId, designJobId: jobId, designRevisionId: input.designRevisionId,
        revisionNumber: await tx.nextRevisionNumber(principal.companyId, jobId), title: input.title,
        changeSummary: input.changeSummary, createdByUserId: principal.userId,
      });
      if (source) {
        for (const line of await tx.listLines(principal.companyId, source.id)) {
          await tx.createLine({ ...line, id: undefined, boqRevisionId: created.id, rowVersion: 1, createdAt: new Date(), updatedAt: new Date() });
        }
        const newTechnical = await tx.listLines(principal.companyId, created.id);
        const oldToNew = new Map((await tx.listLines(principal.companyId, source.id)).map((line, index) => [line.id, newTechnical[index]?.id]));
        for (const line of await tx.listEstimateLines(principal.companyId, source.id)) {
          await tx.createEstimateLine({ ...line, id: undefined, boqRevisionId: created.id, boqLineId: line.boqLineId ? oldToNew.get(line.boqLineId) : undefined, rowVersion: 1, createdAt: new Date(), updatedAt: new Date() });
        }
      }
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.boq_revision_created', targetType: 'boq_revision', targetId: created.id, requestId, metadata: { designJobId: jobId, designRevisionId: input.designRevisionId, revisionNumber: created.revisionNumber, copiedFrom: source?.id } });
      return created;
    });
  }

  private async draft(principal: AuthenticatedPrincipal, jobId: string, boqId: string, estimate = false) {
    await this.designer(principal, jobId, estimate);
    const revision = await createBoqRepository(this.database).findRevision(principal.companyId, jobId, boqId);
    if (!revision) throw new NotFoundError('BOQ revision not found.');
    if (revision.status !== 'draft') throw new ConflictError('Submitted BOQ revisions are immutable. Create a new revision after a return.');
    return revision;
  }

  async saveTechnicalLine(principal: AuthenticatedPrincipal, jobId: string, boqId: string, lineId: string | undefined, input: TechnicalInput, requestId: string) {
    await this.draft(principal, jobId, boqId);
    const repository = createBoqRepository(this.database);
    const item = await repository.findActiveItem(principal.companyId, input.itemId);
    if (!item) throw validationError('Choose an active item with an active unit.');
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion)) throw new ConflictError('The BOQ changed. Refresh and try again.');
      const values = {
        itemId: item.id, section: input.section, itemCodeSnapshot: item.code, itemNameSnapshot: item.name,
        specificationSnapshot: input.specification, brand: input.brand, model: input.model,
        unitId: item.unitId, unitSymbolSnapshot: item.unitSymbol, quantity: input.quantity,
        drawingReference: input.drawingReference, notes: input.notes,
      };
      const line = lineId
        ? await tx.updateLine(principal.companyId, boqId, lineId, input.expectedLineVersion!, values)
        : await tx.createLine({ companyId: principal.companyId, boqRevisionId: boqId, lineNumber: await tx.nextLineNumber(principal.companyId, boqId), ...values });
      if (!line) throw new ConflictError('The BOQ line changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: lineId ? 'engineering.boq_line_updated' : 'engineering.boq_line_created', targetType: 'boq_line', targetId: line.id, requestId, metadata: { designJobId: jobId, boqRevisionId: boqId, quantity: input.quantity } });
      return publicTechnicalLine(line);
    });
  }

  async deleteTechnicalLine(principal: AuthenticatedPrincipal, jobId: string, boqId: string, lineId: string, input: { expectedBoqVersion: number; expectedLineVersion: number }, requestId: string) {
    await this.draft(principal, jobId, boqId);
    if (await createBoqRepository(this.database).hasEstimateForBoqLine(principal.companyId, boqId, lineId)) {
      throw new ConflictError('Remove cost lines linked to this technical line before deleting it.');
    }
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion)) throw new ConflictError('The BOQ changed. Refresh and try again.');
      const deleted = await tx.deleteLine(principal.companyId, boqId, lineId, input.expectedLineVersion);
      if (!deleted) throw new ConflictError('The BOQ line changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.boq_line_deleted', targetType: 'boq_line', targetId: lineId, requestId, metadata: { designJobId: jobId, boqRevisionId: boqId } });
    });
  }

  async saveEstimateLine(principal: AuthenticatedPrincipal, jobId: string, boqId: string, lineId: string | undefined, input: EstimateInput, requestId: string) {
    await this.draft(principal, jobId, boqId, true);
    const repository = createBoqRepository(this.database);
    if (input.boqLineId && !await repository.findLine(principal.companyId, boqId, input.boqLineId)) throw validationError('The selected technical line does not belong to this BOQ revision.');
    const total = new Decimal(input.quantity).mul(input.unitRate).toDecimalPlaces(2).toFixed(2);
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion)) throw new ConflictError('The BOQ changed. Refresh and try again.');
      const values = { boqLineId: input.boqLineId, category: input.category, description: input.description, quantity: input.quantity, unitRate: input.unitRate, lineTotal: total, notes: input.notes };
      const line = lineId
        ? await tx.updateEstimateLine(principal.companyId, boqId, lineId, input.expectedLineVersion!, values)
        : await tx.createEstimateLine({ companyId: principal.companyId, boqRevisionId: boqId, lineNumber: await tx.nextEstimateLineNumber(principal.companyId, boqId), ...values });
      if (!line) throw new ConflictError('The estimate line changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: lineId ? 'engineering.estimate_line_updated' : 'engineering.estimate_line_created', targetType: 'estimate_cost_line', targetId: line.id, requestId, metadata: { designJobId: jobId, boqRevisionId: boqId, category: input.category, lineTotal: total } });
      return publicEstimateLine(line);
    });
  }

  async deleteEstimateLine(principal: AuthenticatedPrincipal, jobId: string, boqId: string, lineId: string, input: { expectedBoqVersion: number; expectedLineVersion: number }, requestId: string) {
    await this.draft(principal, jobId, boqId, true);
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion)) throw new ConflictError('The BOQ changed. Refresh and try again.');
      if (!await tx.deleteEstimateLine(principal.companyId, boqId, lineId, input.expectedLineVersion)) throw new ConflictError('The estimate line changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.estimate_line_deleted', targetType: 'estimate_cost_line', targetId: lineId, requestId, metadata: { designJobId: jobId, boqRevisionId: boqId } });
    });
  }

  async submit(principal: AuthenticatedPrincipal, jobId: string, boqId: string, expectedVersion: number, requestId: string) {
    const revision = await this.draft(principal, jobId, boqId, true);
    const repository = createBoqRepository(this.database);
    const [technical, estimate] = await Promise.all([repository.listLines(principal.companyId, boqId), repository.listEstimateLines(principal.companyId, boqId)]);
    if (technical.length === 0) throw validationError('Add at least one technical BOQ line before submission.');
    if (estimate.length === 0) throw validationError('Add at least one separate estimate line before submission.');
    return this.database.transaction(async (transaction) => {
      const updated = await createBoqRepository(transaction).transitionRevision(principal.companyId, boqId, expectedVersion, 'draft', { status: 'submitted', submittedByUserId: principal.userId, submittedAt: new Date() });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer a draft.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.boq_submitted', targetType: 'boq_revision', targetId: boqId, requestId, metadata: { designJobId: jobId, revisionNumber: revision.revisionNumber } });
      return updated;
    });
  }

  async review(principal: AuthenticatedPrincipal, jobId: string, boqId: string, input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }, requestId: string) {
    if (!hasPermission(principal, 'engineering.design.review')) throw new ForbiddenError();
    if (!hasPermission(principal, 'engineering.estimate.read')) throw new ForbiddenError('The assigned BOQ reviewer must also be allowed to view the internal estimate.');
    const job = await this.job(principal, jobId);
    if (job.designHeadUserId !== principal.userId) throw new ForbiddenError('Only the assigned design head can review this BOQ.');
    const revision = await createBoqRepository(this.database).findRevision(principal.companyId, jobId, boqId);
    if (!revision) throw new NotFoundError('BOQ revision not found.');
    if (revision.createdByUserId === principal.userId || revision.submittedByUserId === principal.userId) throw new ForbiddenError('You cannot review your own BOQ revision.');
    const target = input.decision === 'approved' ? 'approved' : 'returned';
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, input.expectedVersion, 'submitted', { status: target });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer awaiting review.');
      await tx.createReview({ companyId: principal.companyId, boqRevisionId: boqId, decision: input.decision, reason: input.reason, actorUserId: principal.userId });
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: `engineering.boq_${input.decision}`, targetType: 'boq_revision', targetId: boqId, requestId, metadata: { designJobId: jobId, reason: input.reason } });
      return updated;
    });
  }
}

export const boqService = new BoqService();
