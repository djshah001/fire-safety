import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createCrmRepository } from '../crm/crm.repository.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createBoqRepository } from './boq.repository.js';
import { createEngineeringRepository } from './engineering.repository.js';

type EstimateInput = {
  boqLineId?: string;
  category: 'material' | 'labour' | 'transport' | 'subcontracting' | 'overhead' | 'wastage' | 'margin';
  description: string;
  quantity: string;
  unitRate: string;
  notes?: string;
  expectedBoqVersion: number;
  expectedLineVersion?: number;
};

type TemplateInput = {
  sectorId: string;
  name: string;
  costingUserId: string;
  purchaseHeadUserId: string;
  adminApproverUserId: string;
  expectedVersion?: number;
  items: Array<{ itemId: string; section: string }>;
};

function validationError(message: string) {
  return new AppError('VALIDATION_ERROR', message, 422);
}

function publicTechnicalLine(line: Awaited<ReturnType<ReturnType<typeof createBoqRepository>['listLines']>>[number]) {
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    section: line.section,
    itemId: line.itemId,
    itemCode: line.itemCodeSnapshot,
    itemName: line.itemNameSnapshot,
    specification: line.specificationSnapshot,
    brand: line.brand,
    model: line.model,
    unitId: line.unitId,
    unitSymbol: line.unitSymbolSnapshot,
    quantity: line.quantity,
    drawingReference: line.drawingReference,
    notes: line.notes,
    rowVersion: line.rowVersion,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function publicEstimateLine(line: Awaited<ReturnType<ReturnType<typeof createBoqRepository>['listEstimateLines']>>[number]) {
  return {
    id: line.id,
    boqLineId: line.boqLineId,
    lineNumber: line.lineNumber,
    category: line.category,
    description: line.description,
    quantity: line.quantity,
    unitRate: line.unitRate,
    lineTotal: line.lineTotal,
    notes: line.notes,
    rowVersion: line.rowVersion,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
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
    if (![
      'engineering.design.write',
      'engineering.design.review',
      'engineering.design.customer_decision',
      'engineering.estimate.read',
      'engineering.estimate.write',
      'engineering.boq.purchase_review',
      'engineering.boq.final_review',
    ].some((permission) => hasPermission(principal, permission))) throw new ForbiddenError();
    const job = await createEngineeringRepository(this.database).findJob(
      { companyId: principal.companyId, userId: principal.userId }, jobId,
    );
    if (!job) throw new NotFoundError('Design job not found.');
    return job;
  }

  private async designer(principal: AuthenticatedPrincipal, jobId: string) {
    if (!hasPermission(principal, 'engineering.design.write')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (!job.designerUserId || job.designerUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned design engineer can enter BOQ quantities.');
    }
    return job;
  }

  async getWorkspace(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.job(principal, jobId);
    const repository = createBoqRepository(this.database);
    const mayViewCost = hasPermission(principal, 'engineering.estimate.read');
    const revisions = await repository.listRevisions(principal.companyId, jobId);
    const boqs = await Promise.all(revisions.map(async (revision) => {
      const technicalLines = (await repository.listLines(principal.companyId, revision.id)).map(publicTechnicalLine);
      const assignedToCostWorkflow = [revision.costingUserId, revision.purchaseHeadUserId, revision.adminApproverUserId]
        .includes(principal.userId);
      const canViewEstimate = mayViewCost && assignedToCostWorkflow;
      const base = {
        ...revision,
        technicalLines,
        reviews: await repository.listReviews(principal.companyId, revision.id),
        canEditQuantity: revision.status === 'draft' && job.designerUserId === principal.userId,
        canEditCosting: revision.status === 'costing' && revision.costingUserId === principal.userId && hasPermission(principal, 'engineering.estimate.write'),
        canPurchaseReview: revision.status === 'purchase_review' && revision.purchaseHeadUserId === principal.userId && hasPermission(principal, 'engineering.boq.purchase_review'),
        canFinalReview: revision.status === 'admin_review' && revision.adminApproverUserId === principal.userId && hasPermission(principal, 'engineering.boq.final_review'),
      };
      if (!canViewEstimate) return { ...base, canViewEstimate: false };
      const estimateLines = (await repository.listEstimateLines(principal.companyId, revision.id)).map(publicEstimateLine);
      return { ...base, canViewEstimate: true, estimateLines, estimateTotals: estimateTotals(estimateLines) };
    }));
    return {
      job,
      eligibleDesignRevisions: await repository.listEligibleDesignRevisions(principal.companyId, jobId),
      boqs,
    };
  }

  async listCatalog(principal: AuthenticatedPrincipal, jobId: string, search?: string) {
    await this.job(principal, jobId);
    return createBoqRepository(this.database).listActiveItems(principal.companyId, search);
  }

  async listTemplates(principal: AuthenticatedPrincipal) {
    if (!hasPermission(principal, 'engineering.boq.template.manage')) throw new ForbiddenError();
    const repository = createBoqRepository(this.database);
    const templates = await repository.listTemplates(principal.companyId);
    return Promise.all(templates.map(async (template) => ({
      ...template,
      items: await repository.listTemplateItems(principal.companyId, template.id),
    })));
  }

  async templateOptions(principal: AuthenticatedPrincipal) {
    if (!hasPermission(principal, 'engineering.boq.template.manage')) throw new ForbiddenError();
    const crm = createCrmRepository(this.database);
    const boq = createBoqRepository(this.database);
    const [sectors, items, costingUsers, purchaseHeads, adminApprovers] = await Promise.all([
      crm.listMarketSectors(principal.companyId),
      boq.listActiveItems(principal.companyId),
      crm.listEligibleUsers(principal.companyId, 'engineering.estimate.write'),
      crm.listEligibleUsers(principal.companyId, 'engineering.boq.purchase_review'),
      crm.listEligibleUsers(principal.companyId, 'engineering.boq.final_review'),
    ]);
    return { sectors, items, costingUsers, purchaseHeads, adminApprovers };
  }

  async saveTemplate(
    principal: AuthenticatedPrincipal,
    templateId: string | undefined,
    input: TemplateInput,
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.boq.template.manage')) throw new ForbiddenError();
    const repository = createBoqRepository(this.database);
    const crm = createCrmRepository(this.database);
    const [sector, costingUser, purchaseHead, adminApprover, catalogItems] = await Promise.all([
      crm.findMarketSector(principal.companyId, input.sectorId),
      crm.findEligibleUser(principal.companyId, input.costingUserId, 'engineering.estimate.write'),
      crm.findEligibleUser(principal.companyId, input.purchaseHeadUserId, 'engineering.boq.purchase_review'),
      crm.findEligibleUser(principal.companyId, input.adminApproverUserId, 'engineering.boq.final_review'),
      Promise.all(input.items.map((item) => repository.findActiveItem(principal.companyId, item.itemId))),
    ]);
    if (!sector || sector.status !== 'active') throw validationError('Choose an active market sector.');
    if (!costingUser) throw validationError('Choose an active purchase employee allowed to prepare costing.');
    if (!purchaseHead) throw validationError('Choose an active purchase head allowed to review BOQs.');
    if (!adminApprover) throw validationError('Choose an active employee with explicit final BOQ approval permission.');
    if (catalogItems.some((item) => !item)) throw validationError('Every template item must be active and use an active unit.');
    const duplicate = await repository.findTemplateBySector(principal.companyId, input.sectorId);
    if (!templateId && duplicate) throw new ConflictError('This market sector already has a BOQ template. Edit it instead.');

    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const values = {
        sectorId: input.sectorId,
        name: input.name,
        costingUserId: input.costingUserId,
        purchaseHeadUserId: input.purchaseHeadUserId,
        adminApproverUserId: input.adminApproverUserId,
        status: 'active',
      } as const;
      const template = templateId
        ? await tx.updateTemplate(principal.companyId, templateId, input.expectedVersion!, values)
        : await tx.createTemplate({
          companyId: principal.companyId,
          ...values,
          createdByUserId: principal.userId,
        });
      if (!template) throw new ConflictError('The BOQ template changed. Refresh and try again.');
      await tx.replaceTemplateItems(principal.companyId, template.id, input.items);
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: templateId ? 'engineering.boq_template_updated' : 'engineering.boq_template_created',
        targetType: 'boq_template',
        targetId: template.id,
        requestId,
        metadata: { sectorId: input.sectorId, itemCount: input.items.length },
      });
      return template;
    });
  }

  async createRevision(
    principal: AuthenticatedPrincipal,
    jobId: string,
    input: { designRevisionId: string; sourceBoqRevisionId?: string; title: string; changeSummary: string },
    requestId: string,
  ) {
    await this.designer(principal, jobId);
    const repository = createBoqRepository(this.database);
    const designRevision = await createEngineeringRepository(this.database)
      .findRevision(principal.companyId, jobId, input.designRevisionId);
    if (!designRevision || designRevision.status !== 'customer_approved') {
      throw validationError('Choose a customer-approved design revision.');
    }
    const templateResult = await repository.findActiveTemplateForJob(principal.companyId, jobId);
    if (!templateResult) {
      throw new ConflictError('No active BOQ template is configured for this lead market sector. Ask the purchase head to configure one.');
    }
    const templateItems = await repository.listTemplateItems(principal.companyId, templateResult.template.id);
    if (templateItems.length === 0 || templateItems.some((item) => item.itemStatus !== 'active' || item.unitStatus !== 'active')) {
      throw new ConflictError('The sector BOQ template has no usable active items. Ask the purchase head to update it.');
    }
    const existing = await repository.listRevisions(principal.companyId, jobId);
    if (existing.some((revision) => revision.status === 'draft')) {
      throw new ConflictError('This design job already has a draft BOQ.');
    }
    if (existing.length > 0 && existing[0]!.status !== 'returned' &&
      !(existing[0]!.status === 'approved' && existing[0]!.designRevisionId !== input.designRevisionId)) {
      throw new ConflictError('Create the next BOQ only after a return or for a newer customer-approved design revision.');
    }
    const source = input.sourceBoqRevisionId
      ? await repository.findRevision(principal.companyId, jobId, input.sourceBoqRevisionId)
      : undefined;
    if (input.sourceBoqRevisionId && (!source || !['returned', 'approved'].includes(source.status))) {
      throw validationError('Only a returned or approved BOQ revision can supply previous quantities.');
    }

    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const created = await tx.createRevision({
        companyId: principal.companyId,
        designJobId: jobId,
        designRevisionId: input.designRevisionId,
        templateId: templateResult.template.id,
        templateNameSnapshot: templateResult.template.name,
        costingUserId: templateResult.template.costingUserId,
        purchaseHeadUserId: templateResult.template.purchaseHeadUserId,
        adminApproverUserId: templateResult.template.adminApproverUserId,
        revisionNumber: await tx.nextRevisionNumber(principal.companyId, jobId),
        title: input.title,
        changeSummary: input.changeSummary,
        createdByUserId: principal.userId,
      });
      const previousQuantities = new Map<string, string>();
      if (source) {
        for (const line of await tx.listLines(principal.companyId, source.id)) {
          previousQuantities.set(line.itemId, line.quantity);
        }
      }
      for (const templateItem of templateItems) {
        await tx.createLine({
          companyId: principal.companyId,
          boqRevisionId: created.id,
          lineNumber: templateItem.sortOrder,
          section: templateItem.section,
          itemId: templateItem.itemId,
          itemCodeSnapshot: templateItem.itemCode,
          itemNameSnapshot: templateItem.itemName,
          specificationSnapshot: templateItem.specification ?? 'As per approved design and active item master.',
          unitId: templateItem.unitId,
          unitSymbolSnapshot: templateItem.unitSymbol,
          quantity: previousQuantities.get(templateItem.itemId) ?? '0.0000',
          notes: 'Selected automatically from the sector BOQ template.',
        });
      }
      await tx.addContributor(principal.companyId, created.id, principal.userId, 'quantity');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.boq_revision_created_from_template',
        targetType: 'boq_revision',
        targetId: created.id,
        requestId,
        metadata: {
          designJobId: jobId,
          designRevisionId: input.designRevisionId,
          templateId: templateResult.template.id,
          itemCount: templateItems.length,
          copiedQuantitiesFrom: source?.id,
        },
      });
      return created;
    });
  }

  private async revision(principal: AuthenticatedPrincipal, jobId: string, boqId: string) {
    await this.job(principal, jobId);
    const revision = await createBoqRepository(this.database).findRevision(principal.companyId, jobId, boqId);
    if (!revision) throw new NotFoundError('BOQ revision not found.');
    return revision;
  }

  async saveQuantity(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    lineId: string,
    input: { quantity: string; expectedBoqVersion: number; expectedLineVersion: number },
    requestId: string,
  ) {
    await this.designer(principal, jobId);
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.status !== 'draft') throw new ConflictError('Technical quantities are frozen after submission.');
    const repository = createBoqRepository(this.database);
    if (!await repository.findLine(principal.companyId, boqId, lineId)) throw new NotFoundError('BOQ line not found.');
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion, 'draft')) {
        throw new ConflictError('The BOQ changed. Refresh and try again.');
      }
      const line = await tx.updateLine(principal.companyId, boqId, lineId, input.expectedLineVersion, {
        quantity: input.quantity,
      });
      if (!line) throw new ConflictError('The BOQ line changed. Refresh and try again.');
      await tx.addContributor(principal.companyId, boqId, principal.userId, 'quantity');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.boq_quantity_updated',
        targetType: 'boq_line',
        targetId: line.id,
        requestId,
        metadata: { designJobId: jobId, boqRevisionId: boqId, quantity: input.quantity },
      });
      return publicTechnicalLine(line);
    });
  }

  private async costingRevision(principal: AuthenticatedPrincipal, jobId: string, boqId: string) {
    if (!hasPermission(principal, 'engineering.estimate.write')) throw new ForbiddenError();
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.costingUserId !== principal.userId) {
      throw new ForbiddenError('Only the purchase employee assigned by the sector template can prepare costing.');
    }
    if (revision.status !== 'costing') throw new ConflictError('Costing can only be changed while the BOQ is in costing.');
    return revision;
  }

  async saveEstimateLine(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    lineId: string | undefined,
    input: EstimateInput,
    requestId: string,
  ) {
    await this.costingRevision(principal, jobId, boqId);
    const repository = createBoqRepository(this.database);
    if (input.boqLineId && !await repository.findLine(principal.companyId, boqId, input.boqLineId)) {
      throw validationError('The selected technical line does not belong to this BOQ revision.');
    }
    const total = new Decimal(input.quantity).mul(input.unitRate).toDecimalPlaces(2).toFixed(2);
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion, 'costing')) {
        throw new ConflictError('The BOQ changed. Refresh and try again.');
      }
      const values = {
        boqLineId: input.boqLineId,
        category: input.category,
        description: input.description,
        quantity: input.quantity,
        unitRate: input.unitRate,
        lineTotal: total,
        notes: input.notes,
      };
      const line = lineId
        ? await tx.updateEstimateLine(principal.companyId, boqId, lineId, input.expectedLineVersion!, values)
        : await tx.createEstimateLine({
          companyId: principal.companyId,
          boqRevisionId: boqId,
          lineNumber: await tx.nextEstimateLineNumber(principal.companyId, boqId),
          ...values,
        });
      if (!line) throw new ConflictError('The estimate line changed. Refresh and try again.');
      await tx.addContributor(principal.companyId, boqId, principal.userId, 'costing');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: lineId ? 'engineering.estimate_line_updated' : 'engineering.estimate_line_created',
        targetType: 'estimate_cost_line',
        targetId: line.id,
        requestId,
        metadata: { designJobId: jobId, boqRevisionId: boqId, category: input.category, lineTotal: total },
      });
      return publicEstimateLine(line);
    });
  }

  async deleteEstimateLine(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    lineId: string,
    input: { expectedBoqVersion: number; expectedLineVersion: number },
    requestId: string,
  ) {
    await this.costingRevision(principal, jobId, boqId);
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion, 'costing')) {
        throw new ConflictError('The BOQ changed. Refresh and try again.');
      }
      if (!await tx.deleteEstimateLine(principal.companyId, boqId, lineId, input.expectedLineVersion)) {
        throw new ConflictError('The estimate line changed. Refresh and try again.');
      }
      await tx.addContributor(principal.companyId, boqId, principal.userId, 'costing');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.estimate_line_deleted',
        targetType: 'estimate_cost_line',
        targetId: lineId,
        requestId,
        metadata: { designJobId: jobId, boqRevisionId: boqId },
      });
    });
  }

  async submitQuantities(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    await this.designer(principal, jobId);
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.status !== 'draft') throw new ConflictError('This BOQ is no longer accepting quantities.');
    const lines = await createBoqRepository(this.database).listLines(principal.companyId, boqId);
    if (lines.length === 0) throw validationError('The sector template did not provide any BOQ items.');
    if (lines.some((line) => new Decimal(line.quantity).lte(0))) {
      throw validationError('Enter a quantity greater than zero for every template item before submitting to costing.');
    }
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, expectedVersion, 'draft', {
        status: 'costing', submittedByUserId: principal.userId, submittedAt: new Date(),
      });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer a draft.');
      await tx.addContributor(principal.companyId, boqId, principal.userId, 'quantity');
      if (revision.costingUserId) await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: revision.costingUserId,
        type: 'engineering.boq_ready_for_costing', severity: 'info', title: 'BOQ ready for costing',
        message: `${revision.title} quantities were submitted by design engineering.`,
        link: `/engineering/design-jobs/${jobId}/boq`, targetType: 'boq_revision', targetId: boqId,
        dedupKey: `boq-costing:${boqId}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.boq_quantities_submitted',
        targetType: 'boq_revision',
        targetId: boqId,
        requestId,
        metadata: { designJobId: jobId, revisionNumber: revision.revisionNumber },
      });
      return updated;
    });
  }

  async submitCosting(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    const revision = await this.costingRevision(principal, jobId, boqId);
    const repository = createBoqRepository(this.database);
    const [technical, estimates] = await Promise.all([
      repository.listLines(principal.companyId, boqId),
      repository.listEstimateLines(principal.companyId, boqId),
    ]);
    const costedLineIds = new Set(estimates.map((line) => line.boqLineId).filter(Boolean));
    if (technical.some((line) => !costedLineIds.has(line.id))) {
      throw validationError('Add at least one linked cost line for every technical BOQ item before purchase review.');
    }
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, expectedVersion, 'costing', {
        status: 'purchase_review',
      });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer in costing.');
      await tx.addContributor(principal.companyId, boqId, principal.userId, 'costing');
      if (revision.purchaseHeadUserId) await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: revision.purchaseHeadUserId,
        type: 'engineering.boq_ready_for_purchase_review', severity: 'info', title: 'BOQ ready for purchase review',
        message: `${revision.title} costing is complete and awaits your approval.`,
        link: `/engineering/design-jobs/${jobId}/boq`, targetType: 'boq_revision', targetId: boqId,
        dedupKey: `boq-purchase-review:${boqId}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.boq_costing_submitted',
        targetType: 'boq_revision',
        targetId: boqId,
        requestId,
        metadata: { designJobId: jobId },
      });
      return updated;
    });
  }

  async purchaseReview(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number },
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.boq.purchase_review')) throw new ForbiddenError();
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.purchaseHeadUserId !== principal.userId) {
      throw new ForbiddenError('Only the purchase head assigned by the sector template can review this BOQ.');
    }
    const repository = createBoqRepository(this.database);
    if (await repository.hasContributor(principal.companyId, boqId, principal.userId)) {
      throw new ForbiddenError('You cannot review a BOQ revision that you prepared.');
    }
    const target = input.decision === 'approved' ? 'admin_review' : 'returned';
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, input.expectedVersion, 'purchase_review', { status: target });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer awaiting purchase review.');
      await tx.createReview({
        companyId: principal.companyId,
        boqRevisionId: boqId,
        reviewStage: 'purchase',
        decision: input.decision,
        reason: input.reason,
        actorUserId: principal.userId,
      });
      const purchaseRecipient = input.decision === 'approved' ? revision.adminApproverUserId : revision.createdByUserId;
      if (purchaseRecipient) await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: purchaseRecipient,
        type: `engineering.boq_purchase_${input.decision}`, severity: input.decision === 'approved' ? 'info' : 'warning',
        title: input.decision === 'approved' ? 'BOQ ready for final approval' : 'BOQ returned by purchase head',
        message: input.decision === 'approved' ? `${revision.title} passed purchase review.` : `${revision.title}: ${input.reason}`,
        link: `/engineering/design-jobs/${jobId}/boq`, targetType: 'boq_revision', targetId: boqId,
        dedupKey: `boq-purchase:${boqId}:${input.decision}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: `engineering.boq_purchase_${input.decision}`,
        targetType: 'boq_revision',
        targetId: boqId,
        requestId,
        metadata: { designJobId: jobId, reason: input.reason },
      });
      return updated;
    });
  }

  async finalReview(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number },
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.boq.final_review')) throw new ForbiddenError();
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.adminApproverUserId !== principal.userId) {
      throw new ForbiddenError('Only the explicitly assigned administrative BOQ approver can perform final review.');
    }
    const repository = createBoqRepository(this.database);
    if (await repository.hasContributor(principal.companyId, boqId, principal.userId)) {
      throw new ForbiddenError('You cannot give final approval to a BOQ revision that you prepared.');
    }
    const target = input.decision === 'approved' ? 'approved' : 'returned';
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, input.expectedVersion, 'admin_review', { status: target });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer awaiting final review.');
      await tx.createReview({
        companyId: principal.companyId,
        boqRevisionId: boqId,
        reviewStage: 'admin',
        decision: input.decision,
        reason: input.reason,
        actorUserId: principal.userId,
      });
      const finalRecipients = [...new Set([revision.createdByUserId, revision.costingUserId, revision.purchaseHeadUserId].filter((id): id is string => Boolean(id) && id !== principal.userId))];
      await createNotificationRepository(transaction).createMany(finalRecipients.map((recipientUserId) => ({
        companyId: principal.companyId, recipientUserId,
        type: `engineering.boq_admin_${input.decision}`, severity: input.decision === 'approved' ? 'success' as const : 'warning' as const,
        title: input.decision === 'approved' ? 'BOQ approved for quotation' : 'BOQ returned by final approver',
        message: input.decision === 'approved' ? `${revision.title} is approved and quotation work can begin.` : `${revision.title}: ${input.reason}`,
        link: `/engineering/design-jobs/${jobId}/boq`, targetType: 'boq_revision', targetId: boqId,
        dedupKey: `boq-admin:${boqId}:${input.decision}`,
      })));
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: `engineering.boq_admin_${input.decision}`,
        targetType: 'boq_revision',
        targetId: boqId,
        requestId,
        metadata: { designJobId: jobId, reason: input.reason },
      });
      return updated;
    });
  }

  async legacyReview(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number },
    requestId: string,
  ) {
    if (!hasPermission(principal, 'engineering.design.review')) throw new ForbiddenError();
    const job = await this.job(principal, jobId);
    if (job.designHeadUserId !== principal.userId) throw new ForbiddenError('Only the assigned design head can review this legacy BOQ.');
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.status !== 'submitted' || revision.templateId) throw new ConflictError('This is not a legacy BOQ awaiting review.');
    if (revision.createdByUserId === principal.userId || revision.submittedByUserId === principal.userId) {
      throw new ForbiddenError('You cannot review your own BOQ revision.');
    }
    const target = input.decision === 'approved' ? 'approved' : 'returned';
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, input.expectedVersion, 'submitted', { status: target });
      if (!updated) throw new ConflictError('The legacy BOQ changed or is no longer awaiting review.');
      await tx.createReview({
        companyId: principal.companyId,
        boqRevisionId: boqId,
        reviewStage: 'legacy',
        decision: input.decision,
        reason: input.reason,
        actorUserId: principal.userId,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: `engineering.legacy_boq_${input.decision}`,
        targetType: 'boq_revision',
        targetId: boqId,
        requestId,
        metadata: { designJobId: jobId, reason: input.reason },
      });
      return updated;
    });
  }
}

export const boqService = new BoqService();
