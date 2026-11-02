import { isAdministrator } from '../../core/security/administrator.js';
import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createCrmRepository } from '../crm/crm.repository.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createMastersRepository } from '../masters/masters.repository.js';
import { calculateQuotedLine } from './boq.calculation.js';
import { createBoqRepository } from './boq.repository.js';
import { createEngineeringRepository } from './engineering.repository.js';
import { createQuotationRepository } from './quotation.repository.js';
import { renderDemoQuotationPdf } from './quotation.pdf.js';
import { quotationDefaults } from './quotation.defaults.js';

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
    rateVersionId: line.rateVersionId,
    offeringId: line.offeringId,
    brandId: line.brandIdSnapshot,
    brandName: line.brandNameSnapshot,
    manufacturerModel: line.manufacturerModelSnapshot,
    manufacturerSku: line.manufacturerSkuSnapshot,
    isPreferredOffering: line.isPreferredOfferingSnapshot,
    supplyRate: line.supplyRate,
    labourRate: line.labourRate,
    miscellaneousRate: line.miscellaneousRate,
    markupPercent: line.markupPercent,
    markupAmount: line.markupAmount,
    quotedUnitRate: line.quotedUnitRate,
    notes: line.notes,
    rowVersion: line.rowVersion,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function estimateTotals(lines: Array<{ category: string; lineTotal: string; isPreferredOffering?: boolean | null }>) {
  const byCategory: Record<string, string> = {};
  let total = new Decimal(0);
  for (const line of lines) {
    // Brand offerings are alternatives. Only the catalogue-preferred option contributes
    // to the summary; adding every alternative would overstate the BOQ value.
    if (line.isPreferredOffering === false) continue;
    const amount = new Decimal(line.lineTotal);
    byCategory[line.category] = new Decimal(byCategory[line.category] ?? 0).plus(amount).toFixed(2);
    total = total.plus(amount);
  }
  return { byCategory, total: total.toFixed(2) };
}

export class BoqService {
  constructor(private readonly database: Database = db) {}

  async exportPdf(principal: AuthenticatedPrincipal, jobId: string, boqId: string) {
    const workspace = await this.getWorkspace(principal, jobId);
    const boq = workspace.boqs.find((entry) => entry.id === boqId);
    if (!boq) throw new NotFoundError('BOQ revision not found.');
    const context = await createQuotationRepository(this.database).findContext(principal.companyId, jobId);
    if (!context) throw new NotFoundError('BOQ customer not found.');
    const estimates = 'estimateLines' in boq ? boq.estimateLines ?? [] : [];
    const selected = boq.technicalLines.map((entry) => ({ entry, cost: estimates.find((option) => option.boqLineId === entry.id && option.isPreferredOffering) }));
    const showPrices = boq.canViewEstimate && selected.length > 0 && selected.every(({ cost }) => cost?.quotedUnitRate !== null && cost?.quotedUnitRate !== undefined);
    const lines = selected.map(({ entry, cost }) => ({ ...entry,
      brandName: cost ? `${cost.brandName ?? 'Unbranded'} ${cost.manufacturerModel ?? ''}` : entry.brand,
      supplyRate: cost?.supplyRate ?? '0', labourRate: cost?.labourRate ?? '0', miscellaneousRate: cost?.miscellaneousRate ?? '0',
      markupPercent: cost?.markupPercent ?? '0', markupAmount: cost?.markupAmount ?? '0', quotedUnitRate: cost?.quotedUnitRate ?? '0',
      unitRate: cost?.quotedUnitRate ?? '0', discountAmount: '0', lineTotal: cost?.lineTotal ?? '0',
    }));
    const total = showPrices ? lines.reduce((sum, entry) => sum.plus(entry.lineTotal), new Decimal(0)).toFixed(2) : '0';
    return renderDemoQuotationPdf({
      documentTitle: showPrices ? 'BILL OF QUANTITIES - PREFERRED OPTIONS' : 'BILL OF QUANTITIES - TECHNICAL',
      quotationNumber: `BOQ R${boq.revisionNumber}`, revisionNumber: boq.revisionNumber,
      showPrices, preview: boq.status !== 'approved', details: { senderName: context.companyName },
      customerName: context.customerName, title: boq.title, currency: boq.estimateCurrency,
      ...quotationDefaults, subtotal: total, grandTotal: total, lineDiscountTotal: '0', additionalDiscount: '0',
      taxLabel: null, taxAmount: '0', roundingAdjustment: '0', lines,
    });
  }

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
    if (!isAdministrator(principal) && (!job.designerUserId || job.designerUserId !== principal.userId)) {
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
      const canViewEstimate = mayViewCost && (assignedToCostWorkflow || isAdministrator(principal));
      const base = {
        ...revision,
        technicalLines,
        reviews: await repository.listReviews(principal.companyId, revision.id),
        canEditQuantity: revision.status === 'draft' && (job.designerUserId === principal.userId || isAdministrator(principal)),
        canEditCosting: revision.status === 'costing' && (revision.costingUserId === principal.userId || isAdministrator(principal)) && hasPermission(principal, 'engineering.estimate.write'),
        canPurchaseReview: revision.status === 'purchase_review' && (revision.purchaseHeadUserId === principal.userId || isAdministrator(principal)) && hasPermission(principal, 'engineering.boq.purchase_review'),
        canFinalReview: revision.status === 'admin_review' && (revision.adminApproverUserId === principal.userId || isAdministrator(principal)) && hasPermission(principal, 'engineering.boq.final_review'),
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
    const existingLine = await repository.findLine(principal.companyId, boqId, lineId);
    if (!existingLine) throw new NotFoundError('BOQ line not found.');
    const unit = await createMastersRepository(this.database).findUnit(principal.companyId, existingLine.unitId);
    if (!unit) throw new ConflictError('The BOQ line unit is no longer available.');
    if (!unit.allowFractional && !new Decimal(input.quantity).isInteger()) {
      throw validationError(`${unit.name} quantities must be whole numbers.`);
    }
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
    if (!isAdministrator(principal) && revision.costingUserId !== principal.userId) {
      throw new ForbiddenError('Only the purchase employee assigned by the sector template can prepare costing.');
    }
    if (revision.status !== 'costing') throw new ConflictError('Costing can only be changed while the BOQ is in costing.');
    return revision;
  }

  async saveMarkup(
    principal: AuthenticatedPrincipal,
    jobId: string,
    boqId: string,
    lineId: string,
    input: { markupPercent: string; expectedBoqVersion: number; expectedLineVersion: number },
    requestId: string,
  ) {
    await this.costingRevision(principal, jobId, boqId);
    const repository = createBoqRepository(this.database);
    const current = await repository.findEstimateLine(principal.companyId, boqId, lineId);
    if (!current || !current.rateVersionId || current.supplyRate === null || current.labourRate === null || current.miscellaneousRate === null) {
      throw new ConflictError('This BOQ line has no fixed catalogue rate snapshot. Ask a rate master maintainer to configure pricing, then create a new costing revision.');
    }
    const calculation = calculateQuotedLine({
      quantity: current.quantity, supplyRate: current.supplyRate, labourRate: current.labourRate,
      miscellaneousRate: current.miscellaneousRate, markupPercent: input.markupPercent,
    });
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      if (!await tx.bumpRevision(principal.companyId, boqId, input.expectedBoqVersion, 'costing')) {
        throw new ConflictError('The BOQ changed. Refresh and try again.');
      }
      const line = await tx.updateEstimateLine(principal.companyId, boqId, lineId, input.expectedLineVersion, {
        markupPercent: input.markupPercent, markupAmount: calculation.markupAmount,
        quotedUnitRate: calculation.quotedUnitRate, unitRate: calculation.quotedUnitRate,
        lineTotal: calculation.lineAmount,
      });
      if (!line) throw new ConflictError('The estimate line changed. Refresh and try again.');
      await tx.addContributor(principal.companyId, boqId, principal.userId, 'costing');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'engineering.boq_markup_updated',
        targetType: 'estimate_cost_line',
        targetId: line.id,
        requestId,
        metadata: { designJobId: jobId, boqRevisionId: boqId, markupPercent: input.markupPercent, lineTotal: calculation.lineAmount },
      });
      return publicEstimateLine(line);
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
    const costingDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const masters = createMastersRepository(this.database);
    const rateSnapshots = await Promise.all(lines.map(async (line) => ({
      line,
      offerings: await masters.listEffectiveOfferingRates(principal.companyId, line.itemId, revision.estimateCurrency, costingDate),
    })));
    const missingRates = rateSnapshots.flatMap((entry) => {
      if (entry.offerings.length === 0) return [`${entry.line.itemCodeSnapshot} (no active offering)`];
      return entry.offerings.filter((option) => !option.rate).map((option) =>
        `${entry.line.itemCodeSnapshot} (${option.brandName ?? 'Unbranded'} / ${option.offering.manufacturerModel})`);
    });
    if (missingRates.length > 0) {
      throw validationError(`Configure an effective ${revision.estimateCurrency} catalogue rate for every BOQ item before starting costing. Missing: ${missingRates.join(', ')}.`);
    }
    return this.database.transaction(async (transaction) => {
      const tx = createBoqRepository(transaction);
      const updated = await tx.transitionRevision(principal.companyId, boqId, expectedVersion, 'draft', {
        status: 'costing', submittedByUserId: principal.userId, submittedAt: new Date(),
        costingDate, calculationVersion: 'catalogue-markup-v1', roundingVersion: 'half-up-line-2-v1',
      });
      if (!updated) throw new ConflictError('The BOQ changed or is no longer a draft.');
      let costOptionNumber = 1;
      for (const { line: technicalLine, offerings } of rateSnapshots) {
        for (const option of offerings) {
          if (!option.rate) throw new ConflictError('A validated catalogue rate became unavailable. Refresh and try again.');
          await tx.createEstimateLine({
            companyId: principal.companyId, boqRevisionId: boqId, boqLineId: technicalLine.id,
            lineNumber: costOptionNumber++, category: 'material', description: technicalLine.itemNameSnapshot,
            quantity: technicalLine.quantity, unitRate: '0', lineTotal: '0', rateVersionId: option.rate.id,
            offeringId: option.offering.id, brandIdSnapshot: option.offering.brandId,
            brandNameSnapshot: option.brandName, manufacturerModelSnapshot: option.offering.manufacturerModel,
            manufacturerSkuSnapshot: option.offering.manufacturerSku,
            isPreferredOfferingSnapshot: option.offering.isPreferred,
            supplyRate: option.rate.supplyRate, labourRate: option.rate.labourRate, miscellaneousRate: option.rate.miscellaneousRate,
            markupPercent: null, markupAmount: null, quotedUnitRate: null,
            notes: option.rate.miscellaneousNote,
          });
        }
      }
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
        metadata: { designJobId: jobId, revisionNumber: revision.revisionNumber, costingDate, technicalLines: lines.length, costOptions: rateSnapshots.reduce((sum, entry) => sum + entry.offerings.length, 0), unpricedLines: 0 },
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
    const complete = (line: typeof estimates[number]) => line.rateVersionId && line.offeringId && line.markupPercent !== null && line.markupAmount !== null && line.quotedUnitRate !== null;
    const costedLineIds = new Set(estimates.filter(complete).map((line) => line.boqLineId).filter(Boolean));
    if (estimates.length === 0 || estimates.some((line) => !complete(line)) || technical.some((line) => !costedLineIds.has(line.id))) {
      throw validationError('Every brand/model cost option needs an effective catalogue rate and a confirmed markup percentage before purchase review.');
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
    if (!isAdministrator(principal) && revision.purchaseHeadUserId !== principal.userId) {
      throw new ForbiddenError('Only the purchase head assigned by the sector template can review this BOQ.');
    }
    const repository = createBoqRepository(this.database);
    if (!isAdministrator(principal) && await repository.hasContributor(principal.companyId, boqId, principal.userId)) {
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
        metadata: { administratorOverride: isAdministrator(principal), designJobId: jobId, reason: input.reason },
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
    if (!isAdministrator(principal) && revision.adminApproverUserId !== principal.userId) {
      throw new ForbiddenError('Only the explicitly assigned administrative BOQ approver can perform final review.');
    }
    const repository = createBoqRepository(this.database);
    if (!isAdministrator(principal) && await repository.hasContributor(principal.companyId, boqId, principal.userId)) {
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
        metadata: { administratorOverride: isAdministrator(principal), designJobId: jobId, reason: input.reason },
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
    if (!isAdministrator(principal) && job.designHeadUserId !== principal.userId) throw new ForbiddenError('Only the assigned design head can review this legacy BOQ.');
    const revision = await this.revision(principal, jobId, boqId);
    if (revision.status !== 'submitted' || revision.templateId) throw new ConflictError('This is not a legacy BOQ awaiting review.');
    if (!isAdministrator(principal) && (revision.createdByUserId === principal.userId || revision.submittedByUserId === principal.userId)) {
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
        metadata: { administratorOverride: isAdministrator(principal), designJobId: jobId, reason: input.reason },
      });
      return updated;
    });
  }
}

export const boqService = new BoqService();
