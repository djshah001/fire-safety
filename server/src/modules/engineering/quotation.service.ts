import { isAdministrator } from '../../core/security/administrator.js';
import type { CommercialDocumentDetails } from '../../core/documents/commercialDocument.js';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { ensureUploadRoot, removePrivateFile, resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createProjectRepository } from '../projects/project.repository.js';
import { createEngineeringRepository } from './engineering.repository.js';
import { renderQuotationExcel } from './quotation.excel.js';
import { quotationDefaults } from './quotation.defaults.js';
import { quotationPdfTemplateVersion, renderDemoQuotationPdf } from './quotation.pdf.js';
import type { PdfQuotation } from './quotation.template.js';
import { createQuotationRepository } from './quotation.repository.js';

type HeaderInput = {
  title: string; validityDays: number; exclusions: string; deliveryTerms: string; paymentTerms: string;
  additionalDiscount: string; taxLabel?: string; taxAmount: string; roundingAdjustment: string; expectedVersion: number;
};

function validationError(message: string) { return new AppError('VALIDATION_ERROR', message, 422); }

function totals(lines: Array<{ lineSubtotal: string; discountAmount: string }>, additionalDiscount: string, taxAmount: string, roundingAdjustment: string) {
  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Decimal(0));
  const lineDiscountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Decimal(0));
  const afterLineDiscounts = subtotal.minus(lineDiscountTotal);
  const additional = new Decimal(additionalDiscount);
  if (additional.gt(afterLineDiscounts)) throw validationError('Additional discount cannot exceed the value after line discounts.');
  const grandTotal = afterLineDiscounts.minus(additional).plus(taxAmount).plus(roundingAdjustment);
  if (grandTotal.isNegative()) throw validationError('Quotation grand total cannot be negative.');
  return {
    subtotal: subtotal.toFixed(2),
    lineDiscountTotal: lineDiscountTotal.toFixed(2),
    additionalDiscount: additional.toFixed(2),
    taxAmount: new Decimal(taxAmount).toFixed(2),
    roundingAdjustment: new Decimal(roundingAdjustment).toFixed(2),
    grandTotal: grandTotal.toFixed(2),
  };
}

type RevisionRow = Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['listRevisions']>>[number];

function revisionDto(revision: RevisionRow, options: {
  lines: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['listLines']>>;
  review: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['findReview']>> | null;
  document: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['findIssueDocument']>> | null;
  decision: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['findCustomerDecision']>> | null;
  costOptions: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['listCostOptionsForBoqLines']>>;
  canViewPaymentPlan: boolean;
  isContributor: boolean;
}) {
  const base = {
    id: revision.id, quotationId: revision.quotationId, boqRevisionId: revision.boqRevisionId,
    revisionNumber: revision.revisionNumber, status: revision.status, title: revision.title,
    documentDetails: revision.documentDetails,
    customerName: revision.customerNameSnapshot, currency: revision.currency, validityDays: revision.validityDays,
    exclusions: revision.exclusions, deliveryTerms: revision.deliveryTerms, paymentTerms: revision.paymentTerms,
    taxLabel: revision.taxLabel, subtotal: revision.subtotal, lineDiscountTotal: revision.lineDiscountTotal,
    additionalDiscount: revision.additionalDiscount, taxAmount: revision.taxAmount,
    roundingAdjustment: revision.roundingAdjustment, grandTotal: revision.grandTotal,
    createdByUserId: revision.createdByUserId, submittedByUserId: revision.submittedByUserId,
    submittedAt: revision.submittedAt, approvedByUserId: revision.approvedByUserId, approvedAt: revision.approvedAt,
    issuedByUserId: revision.issuedByUserId, issuedAt: revision.issuedAt, rowVersion: revision.rowVersion,
    createdAt: revision.createdAt, updatedAt: revision.updatedAt,
    lines: options.lines.map((line) => ({
      id: line.id, boqLineId: line.boqLineId, lineNumber: line.lineNumber, section: line.sectionSnapshot,
      itemCode: line.itemCodeSnapshot, itemName: line.itemNameSnapshot, specification: line.specificationSnapshot,
      offeringId: line.offeringId, boqCostOptionId: line.boqCostOptionId,
      brandId: line.brandId, brandName: line.brandNameSnapshot,
      manufacturerModel: line.manufacturerModelSnapshot, manufacturerSku: line.manufacturerSkuSnapshot,
      offeringOptions: options.costOptions.filter((option) => option.boqLineId === line.boqLineId).map((option) => ({
        id: option.offeringId!, costOptionId: option.id, brandId: option.brandId,
        brandName: option.brandName, manufacturerModel: option.manufacturerModel!, manufacturerSku: option.manufacturerSku,
        isPreferred: option.isPreferred, supplyRate: option.supplyRate!, labourRate: option.labourRate!,
        miscellaneousRate: option.miscellaneousRate!, markupPercent: option.markupPercent!,
        markupAmount: option.markupAmount!, quotedUnitRate: option.quotedUnitRate!, lineTotal: option.lineTotal,
      })),
      unitSymbol: line.unitSymbolSnapshot, quantity: line.quantity, unitRate: line.unitRate,
      supplyRate: line.supplyRate, labourRate: line.labourRate, miscellaneousRate: line.miscellaneousRate,
      markupPercent: line.markupPercent, markupAmount: line.markupAmount, quotedUnitRate: line.quotedUnitRate,
      discountAmount: line.discountAmount, lineSubtotal: line.lineSubtotal, lineTotal: line.lineTotal,
      notes: line.notes, rowVersion: line.rowVersion,
    })),
    review: options.review ? { decision: options.review.decision, reason: options.review.reason, actorUserId: options.review.actorUserId, actedAt: options.review.actedAt } : null,
    issueDocument: options.document ? { id: options.document.id, originalName: options.document.originalName, mimeType: options.document.mimeType, sizeBytes: options.document.sizeBytes, templateVersion: options.document.templateVersion, isDemo: options.document.isDemo, createdAt: options.document.createdAt } : null,
    customerDecision: options.decision ? { decision: options.decision.decision, evidenceReference: options.decision.evidenceReference, customerOrderReference: options.decision.customerOrderReference, notes: options.decision.notes, recordedByUserId: options.decision.recordedByUserId, recordedAt: options.decision.recordedAt } : null,
    isContributor: options.isContributor,
  };
  return options.canViewPaymentPlan
    ? { ...base, paymentPlan: revision.cashPercentage === null ? null : { cashPercentage: revision.cashPercentage, nonCashPercentage: revision.nonCashPercentage! } }
    : base;
}

export class QuotationService {
  constructor(private readonly database: Database = db) {}

  private assertPermission(principal: AuthenticatedPrincipal, permission: string) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    if (!hasPermission(principal, permission)) throw new ForbiddenError();
  }

  private async job(principal: AuthenticatedPrincipal, jobId: string, permission = 'engineering.quotation.read') {
    this.assertPermission(principal, permission);
    const job = await createEngineeringRepository(this.database).findJob({ companyId: principal.companyId, userId: principal.userId }, jobId);
    if (!job) throw new NotFoundError('Design job not found.');
    return job;
  }

  async listQueue(principal: AuthenticatedPrincipal, input: { search?: string; status?: RevisionRow['status']; page: number; pageSize: number; sort: 'quotationNumber' | 'title' | 'status' | 'updatedAt' | 'grandTotal'; direction: 'asc' | 'desc' }) {
    this.assertPermission(principal, 'engineering.quotation.read');
    const result = await createQuotationRepository(this.database).listQueue(
      { companyId: principal.companyId, userId: principal.userId },
      { ...input, limit: input.pageSize, offset: (input.page - 1) * input.pageSize },
    );
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async getWorkspace(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.job(principal, jobId);
    const repository = createQuotationRepository(this.database);
    const quotation = await repository.findQuotation(principal.companyId, jobId);
    const canViewPaymentPlan = hasPermission(principal, 'engineering.payment_plan.read');
    const revisions = quotation ? await repository.listRevisions(principal.companyId, quotation.id) : [];
    return {
      job,
      context: await repository.findContext(principal.companyId, jobId),
      quotation: quotation ? { id: quotation.id, quotationNumber: quotation.quotationNumber, createdAt: quotation.createdAt } : null,
      eligibleBoqs: await repository.listApprovedBoqs(principal.companyId, jobId),
      revisions: await Promise.all(revisions.map(async (revision) => {
        const lines = await repository.listLines(principal.companyId, revision.id);
        return revisionDto(revision, {
          lines,
          costOptions: await repository.listCostOptionsForBoqLines(principal.companyId, lines.map((line) => line.boqLineId)),
          review: await repository.findReview(principal.companyId, revision.id) ?? null,
          document: await repository.findIssueDocument(principal.companyId, revision.id) ?? null,
          decision: await repository.findCustomerDecision(principal.companyId, revision.id) ?? null,
          canViewPaymentPlan,
          isContributor: await repository.hasContributor(principal.companyId, revision.id, principal.userId),
        });
      })),
      capabilities: {
        canWrite: hasPermission(principal, 'engineering.quotation.write'),
        canApprove: hasPermission(principal, 'engineering.quotation.approve'),
        canOverrideApprovals: isAdministrator(principal),
        canIssue: hasPermission(principal, 'engineering.quotation.issue'),
        canRecordDecision: hasPermission(principal, 'engineering.quotation.customer_decision'),
        canViewPaymentPlan,
        canWritePaymentPlan: hasPermission(principal, 'engineering.payment_plan.write'),
      },
      documentMode: 'demo' as const,
      defaults: quotationDefaults,
    };
  }

  async createRevision(principal: AuthenticatedPrincipal, jobId: string, input: { boqRevisionId: string; sourceRevisionId?: string; title: string; exclusions: string; deliveryTerms: string; paymentTerms: string }, requestId: string) {
    await this.job(principal, jobId, 'engineering.quotation.write');
    const repository = createQuotationRepository(this.database);
    const [context, boq, existingQuotation] = await Promise.all([
      repository.findContext(principal.companyId, jobId),
      repository.findApprovedBoq(principal.companyId, jobId, input.boqRevisionId),
      repository.findQuotation(principal.companyId, jobId),
    ]);
    if (!context) throw new NotFoundError('Design job context not found.');
    if (!boq) throw validationError('Choose an approved BOQ revision from this design job.');
    const boqScope = await repository.listBoqLines(principal.companyId, boq.id);
    const boqCosts = await repository.listApprovedBoqCostLines(principal.companyId, boq.id);
    if (boqScope.length === 0) throw validationError('The approved BOQ has no technical scope lines.');
    const costedBoqLineIds = new Set(boqCosts.map((line) => line.boqLineId));
    if (boq.calculationVersion !== 'catalogue-markup-v1' || boqScope.some((line) => !costedBoqLineIds.has(line.id)) || boqCosts.some((line) => !line.offeringId || line.supplyRate === null || line.labourRate === null || line.miscellaneousRate === null || line.markupPercent === null || line.markupAmount === null || line.quotedUnitRate === null)) {
      throw validationError('This BOQ does not have a complete approved catalogue-rate and markup snapshot. Create and approve a new costing revision before quotation preparation.');
    }
    const existingRevisions = existingQuotation ? await repository.listRevisions(principal.companyId, existingQuotation.id) : [];
    if (existingRevisions.some((revision) => revision.status === 'draft')) throw new ConflictError('This quotation already has a draft revision.');
    if (existingRevisions.length > 0 && !['returned', 'issued', 'declined'].includes(existingRevisions[0]!.status)) {
      throw new ConflictError('Create a revision only after return, issue for negotiation, or customer decline.');
    }
    const source = input.sourceRevisionId ? await repository.findRevision(principal.companyId, jobId, input.sourceRevisionId) : undefined;
    if (input.sourceRevisionId && (!source || !['returned', 'issued', 'declined'].includes(source.revision.status))) {
      throw validationError('Only a returned, issued, or declined quotation can be copied.');
    }

    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const now = new Date();
      const quotation = existingQuotation ?? await tx.createQuotation({
        companyId: principal.companyId, designJobId: jobId, opportunityId: context.opportunityId,
        quotationNumber: await tx.allocateQuotationNumber(principal.companyId, now), createdByUserId: principal.userId,
      });
      const revision = await tx.createRevision({
        companyId: principal.companyId, quotationId: quotation.id, boqRevisionId: boq.id,
        revisionNumber: await tx.nextRevisionNumber(principal.companyId, quotation.id), title: input.title,
        customerNameSnapshot: context.customerName, exclusions: input.exclusions,
        deliveryTerms: input.deliveryTerms, paymentTerms: input.paymentTerms, createdByUserId: principal.userId,
        calculationVersion: boq.calculationVersion, roundingVersion: boq.roundingVersion,
        validityDays: source?.revision.validityDays ?? quotationDefaults.validityDays,
        currency: boq.estimateCurrency,
        documentDetails: source?.revision.documentDetails ?? { senderName: context.companyName, documentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) },
      });
      const sourceLines = source ? await tx.listLines(principal.companyId, source.revision.id) : [];
      const sourceByBoqLine = new Map(sourceLines.map((line) => [line.boqLineId, line]));
      for (const line of boqScope) {
        const copied = sourceByBoqLine.get(line.id);
        const options = boqCosts.filter((option) => option.boqLineId === line.id);
        const selected = copied?.offeringId ? options.find((option) => option.offeringId === copied.offeringId) : undefined;
        const lineSubtotal = selected?.lineTotal ?? '0';
        await tx.createLine({
          companyId: principal.companyId, quotationRevisionId: revision.id, boqLineId: line.id,
          lineNumber: line.lineNumber, sectionSnapshot: line.section, itemCodeSnapshot: line.itemCodeSnapshot,
          itemNameSnapshot: line.itemNameSnapshot, specificationSnapshot: line.specificationSnapshot,
          offeringId: selected?.offeringId, boqCostOptionId: selected?.costOptionId,
          brandId: selected?.brandId, brandNameSnapshot: selected?.brandName,
          manufacturerModelSnapshot: selected?.manufacturerModel, manufacturerSkuSnapshot: selected?.manufacturerSku,
          unitSymbolSnapshot: line.unitSymbolSnapshot, quantity: line.quantity, unitRate: selected?.quotedUnitRate ?? '0',
          supplyRate: selected?.supplyRate ?? '0', labourRate: selected?.labourRate ?? '0', miscellaneousRate: selected?.miscellaneousRate ?? '0',
          markupPercent: selected?.markupPercent ?? '0', markupAmount: selected?.markupAmount ?? '0', quotedUnitRate: selected?.quotedUnitRate ?? '0',
          discountAmount: '0', lineSubtotal, lineTotal: lineSubtotal,
          notes: copied?.notes,
        });
      }
      const copiedLines = await tx.listLines(principal.companyId, revision.id);
      const initialized = await tx.updateDraft(principal.companyId, revision.id, revision.rowVersion, totals(copiedLines, '0', '0', '0'));
      if (!initialized) throw new ConflictError('The quotation changed during creation.');
      await tx.addContributor(principal.companyId, revision.id, principal.userId);
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_revision_created', targetType: 'quotation_revision', targetId: revision.id, requestId, metadata: { designJobId: jobId, quotationNumber: quotation.quotationNumber, revisionNumber: revision.revisionNumber, boqRevisionId: boq.id, copiedFrom: source?.revision.id } });
      return { quotation, revision: initialized };
    });
  }

  private async draft(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, permission = 'engineering.quotation.write') {
    await this.job(principal, jobId, permission);
    const found = await createQuotationRepository(this.database).findRevision(principal.companyId, jobId, revisionId);
    if (!found) throw new NotFoundError('Quotation revision not found.');
    if (found.revision.status !== 'draft') throw new ConflictError('Submitted quotation revisions are immutable. Create a new revision for changes.');
    return found;
  }

  async updateHeader(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: HeaderInput, requestId: string) {
    const found = await this.draft(principal, jobId, revisionId);
    const repository = createQuotationRepository(this.database);
    const calculated = totals(await repository.listLines(principal.companyId, revisionId), input.additionalDiscount, input.taxAmount, input.roundingAdjustment);
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const updated = await tx.updateDraft(principal.companyId, revisionId, input.expectedVersion, {
        title: input.title, validityDays: input.validityDays, exclusions: input.exclusions,
        deliveryTerms: input.deliveryTerms, paymentTerms: input.paymentTerms, taxLabel: input.taxLabel,
        ...calculated,
      });
      if (!updated) throw new ConflictError('The quotation changed. Refresh and try again.');
      await tx.addContributor(principal.companyId, revisionId, principal.userId);
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_header_updated', targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, grandTotal: calculated.grandTotal, previousVersion: found.revision.rowVersion } });
      return updated;
    });
  }

  async updateLine(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, lineId: string, input: { offeringId: string; notes?: string; expectedRevisionVersion: number; expectedLineVersion: number }, requestId: string) {
    const found = await this.draft(principal, jobId, revisionId);
    const repository = createQuotationRepository(this.database);
    const line = await repository.findLine(principal.companyId, revisionId, lineId);
    if (!line) throw new NotFoundError('Quotation line not found.');
    const costOptions = await repository.listCostOptionsForBoqLines(principal.companyId, [line.boqLineId]);
    const selected = costOptions.find((option) => option.offeringId === input.offeringId);
    if (!selected || !selected.offeringId || selected.supplyRate === null || selected.labourRate === null || selected.miscellaneousRate === null || selected.markupPercent === null || selected.markupAmount === null || selected.quotedUnitRate === null) {
      throw validationError('Choose a fully costed brand/model option approved with this BOQ.');
    }
    const currentLines = await repository.listLines(principal.companyId, revisionId);
    const selectedLine = { lineSubtotal: selected.lineTotal, discountAmount: '0' };
    const prospective = currentLines.map((entry) => entry.id === lineId ? { ...entry, ...selectedLine } : entry);
    const calculated = totals(prospective, found.revision.additionalDiscount, found.revision.taxAmount, found.revision.roundingAdjustment);
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const updatedLine = await tx.updateLine(principal.companyId, revisionId, lineId, input.expectedLineVersion, {
        offeringId: selected.offeringId, boqCostOptionId: selected.id,
        brandId: selected.brandId, brandNameSnapshot: selected.brandName,
        manufacturerModelSnapshot: selected.manufacturerModel, manufacturerSkuSnapshot: selected.manufacturerSku,
        unitRate: selected.quotedUnitRate!, supplyRate: selected.supplyRate!, labourRate: selected.labourRate!,
        miscellaneousRate: selected.miscellaneousRate!, markupPercent: selected.markupPercent!,
        markupAmount: selected.markupAmount!, quotedUnitRate: selected.quotedUnitRate!,
        discountAmount: '0', lineSubtotal: selected.lineTotal, lineTotal: selected.lineTotal, notes: input.notes ?? null,
      });
      if (!updatedLine) throw new ConflictError('The quotation line changed. Refresh and try again.');
      const updatedRevision = await tx.updateDraft(principal.companyId, revisionId, input.expectedRevisionVersion, calculated);
      if (!updatedRevision) throw new ConflictError('The quotation changed. Refresh and try again.');
      await tx.addContributor(principal.companyId, revisionId, principal.userId);
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_line_configured', targetType: 'quotation_line', targetId: lineId, requestId, metadata: { designJobId: jobId, quotationRevisionId: revisionId, offeringId: selected.offeringId, brandId: selected.brandId, brandName: selected.brandName, manufacturerModel: selected.manufacturerModel, lineTotal: updatedLine.lineTotal } });
      return updatedLine;
    });
  }

  async updatePaymentPlan(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: { cashPercentage: string; nonCashPercentage: string; expectedVersion: number }, requestId: string) {
    await this.job(principal, jobId, 'engineering.payment_plan.write');
    const found = await createQuotationRepository(this.database).findRevision(principal.companyId, jobId, revisionId);
    if (!found) throw new NotFoundError('Quotation revision not found.');
    if (found.revision.status !== 'accepted') throw new ConflictError('Configure the payment plan after customer acceptance.');
    if (!new Decimal(input.cashPercentage).plus(input.nonCashPercentage).eq(100)) throw validationError('Cash and non-cash percentages must total exactly 100.');
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const updated = await tx.updateAcceptedPaymentPlan(principal.companyId, revisionId, input.expectedVersion, {
        cashPercentage: new Decimal(input.cashPercentage).toFixed(2), nonCashPercentage: new Decimal(input.nonCashPercentage).toFixed(2),
      });
      if (!updated) throw new ConflictError('The quotation changed. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_payment_plan_updated', targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, cashPercentage: input.cashPercentage, nonCashPercentage: input.nonCashPercentage } });
      return updated;
    });
  }

  async submit(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, expectedVersion: number, requestId: string) {
    const found = await this.draft(principal, jobId, revisionId);
    if (new Decimal(found.revision.grandTotal).lte(0)) throw validationError('Quotation grand total must be greater than zero before submission.');
    const repository = createQuotationRepository(this.database);
    const lines = await repository.listLines(principal.companyId, revisionId);
    const allowedOptions = await repository.listCostOptionsForBoqLines(principal.companyId, lines.map((line) => line.boqLineId));
    if (lines.some((line) => !line.offeringId || !line.boqCostOptionId || !allowedOptions.some((option) => option.id === line.boqCostOptionId && option.offeringId === line.offeringId && option.boqLineId === line.boqLineId))) {
      throw validationError('Select an approved brand/model cost option for every quotation line before submission.');
    }
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const updated = await tx.transition(principal.companyId, revisionId, expectedVersion, 'draft', { status: 'submitted', submittedByUserId: principal.userId, submittedAt: new Date() });
      if (!updated) throw new ConflictError('The quotation changed or is no longer a draft.');
      await tx.addContributor(principal.companyId, revisionId, principal.userId);
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_submitted', targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, quotationId: found.quotation.id, revisionNumber: found.revision.revisionNumber } });
      return updated;
    });
  }

  async review(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }, requestId: string) {
    await this.job(principal, jobId, 'engineering.quotation.approve');
    const repository = createQuotationRepository(this.database);
    const found = await repository.findRevision(principal.companyId, jobId, revisionId);
    if (!found) throw new NotFoundError('Quotation revision not found.');
    if (found.revision.status !== 'submitted') throw new ConflictError('This quotation is not awaiting approval.');
    if (!isAdministrator(principal) && await repository.hasContributor(principal.companyId, revisionId, principal.userId)) throw new ForbiddenError('You cannot approve or return a quotation revision that you prepared.');
    const now = new Date();
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const updated = await tx.transition(principal.companyId, revisionId, input.expectedVersion, 'submitted', input.decision === 'approved'
        ? { status: 'approved', approvedByUserId: principal.userId, approvedAt: now }
        : { status: 'returned' });
      if (!updated) throw new ConflictError('The quotation changed or is no longer awaiting approval.');
      await tx.createReview({ companyId: principal.companyId, quotationRevisionId: revisionId, decision: input.decision, reason: input.reason, actorUserId: principal.userId });
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: `engineering.quotation_${input.decision}`, targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { administratorOverride: isAdministrator(principal), designJobId: jobId, reason: input.reason } });
      return updated;
    });
  }

  private document(revision: RevisionRow, quotationNumber: string, lines: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['listLines']>>, preview = false): PdfQuotation {
    return {
      preview,
      details: revision.documentDetails,
      quotationNumber: quotationNumber, revisionNumber: revision.revisionNumber,
      customerName: revision.customerNameSnapshot, title: revision.title, currency: revision.currency,
      validityDays: revision.validityDays, exclusions: revision.exclusions, deliveryTerms: revision.deliveryTerms,
      paymentTerms: revision.paymentTerms, subtotal: revision.subtotal,
      lineDiscountTotal: revision.lineDiscountTotal, additionalDiscount: revision.additionalDiscount,
      taxLabel: revision.taxLabel, taxAmount: revision.taxAmount,
      roundingAdjustment: revision.roundingAdjustment, grandTotal: revision.grandTotal,
      lines: lines.map((line) => ({ section: line.sectionSnapshot, lineNumber: line.lineNumber, itemCode: line.itemCodeSnapshot, itemName: line.itemNameSnapshot, specification: line.specificationSnapshot, brandName: line.manufacturerModelSnapshot ? `${line.brandNameSnapshot ?? 'Unbranded'} · ${line.manufacturerModelSnapshot}${line.manufacturerSkuSnapshot ? ` · ${line.manufacturerSkuSnapshot}` : ''}` : line.brandNameSnapshot, quantity: line.quantity, unitSymbol: line.unitSymbolSnapshot, unitRate: line.unitRate, supplyRate: line.supplyRate, labourRate: line.labourRate, miscellaneousRate: line.miscellaneousRate, markupPercent: line.markupPercent, markupAmount: line.markupAmount, quotedUnitRate: line.quotedUnitRate, discountAmount: line.discountAmount, lineTotal: line.lineTotal })),
    };
  }

  private renderPdf(revision: RevisionRow, quotationNumber: string, lines: Awaited<ReturnType<ReturnType<typeof createQuotationRepository>['listLines']>>, preview = false) {
    return renderDemoQuotationPdf(this.document(revision, quotationNumber, lines, preview));
  }

  async previewPdf(principal: AuthenticatedPrincipal, jobId: string, revisionId: string) {
    await this.job(principal, jobId);
    const repository = createQuotationRepository(this.database);
    const found = await repository.findRevision(principal.companyId, jobId, revisionId);
    if (!found) throw new NotFoundError('Quotation revision not found.');
    const lines = await repository.listLines(principal.companyId, revisionId);
    return this.renderPdf(found.revision, found.quotation.quotationNumber, lines, true);
  }

  async updateDocumentDetails(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: { details: CommercialDocumentDetails; expectedVersion: number }, requestId: string) {
    await this.draft(principal, jobId, revisionId);
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const revision = await tx.updateDraft(principal.companyId, revisionId, input.expectedVersion, { documentDetails: input.details });
      if (!revision) throw new ConflictError('The quotation changed. Refresh and try again.');
      await tx.addContributor(principal.companyId, revisionId, principal.userId);
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_document_details_updated', targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId } });
      return revision;
    });
  }

  async issue(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, expectedVersion: number, requestId: string) {
    await this.job(principal, jobId, 'engineering.quotation.issue');
    const repository = createQuotationRepository(this.database);
    const [found, context] = await Promise.all([
      repository.findRevision(principal.companyId, jobId, revisionId), repository.findContext(principal.companyId, jobId),
    ]);
    if (!found || !context) throw new NotFoundError('Quotation revision not found.');
    if (found.revision.status !== 'approved') throw new ConflictError('Only an approved quotation can be issued.');
    if (await repository.findIssueDocument(principal.companyId, revisionId)) throw new ConflictError('This quotation revision already has an issued snapshot.');
    const lines = await repository.listLines(principal.companyId, revisionId);
    const pdf = await this.renderPdf(found.revision, found.quotation.quotationNumber, lines);
    const storageName = `${randomUUID()}.pdf`;
    await ensureUploadRoot();
    await writeFile(resolvePrivateFile(storageName), pdf);
    const now = new Date();
    try {
      return await this.database.transaction(async (transaction) => {
        const tx = createQuotationRepository(transaction);
        const updated = await tx.transition(principal.companyId, revisionId, expectedVersion, 'approved', { status: 'issued', issuedByUserId: principal.userId, issuedAt: now });
        if (!updated) throw new ConflictError('The quotation changed or is no longer approved.');
        const document = await tx.createIssueDocument({
          companyId: principal.companyId, quotationRevisionId: revisionId,
          originalName: `${found.quotation.quotationNumber}-R${found.revision.revisionNumber}-DEMO.pdf`, storageName,
          mimeType: 'application/pdf', sizeBytes: pdf.byteLength,
          checksumSha256: createHash('sha256').update(pdf).digest('hex'), templateVersion: quotationPdfTemplateVersion, isDemo: true,
          createdByUserId: principal.userId,
        });
        await tx.setCommercialState(principal.companyId, context.opportunityId, 'quoted');
        await tx.setLeadStage(principal.companyId, context.leadId, 'commercial_negotiation');
        await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: 'engineering.quotation_issued_demo', targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, documentId: document.id, templateVersion: quotationPdfTemplateVersion, grandTotal: found.revision.grandTotal } });
        return { revision: updated, document: {
          id: document.id, originalName: document.originalName, mimeType: document.mimeType,
          sizeBytes: document.sizeBytes, templateVersion: document.templateVersion,
          isDemo: document.isDemo, createdAt: document.createdAt,
        } };
      });
    } catch (error) {
      await removePrivateFile(storageName);
      throw error;
    }
  }

  async recordCustomerDecision(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, input: { decision: 'accepted' | 'declined'; evidenceReference: string; customerOrderReference?: string; notes?: string; expectedVersion: number }, requestId: string) {
    await this.job(principal, jobId, 'engineering.quotation.customer_decision');
    const repository = createQuotationRepository(this.database);
    const [found, context] = await Promise.all([
      repository.findRevision(principal.companyId, jobId, revisionId), repository.findContext(principal.companyId, jobId),
    ]);
    if (!found || !context) throw new NotFoundError('Quotation revision not found.');
    if (found.revision.status !== 'issued') throw new ConflictError('Record a customer decision only against an issued quotation revision.');
    return this.database.transaction(async (transaction) => {
      const tx = createQuotationRepository(transaction);
      const updated = await tx.transition(principal.companyId, revisionId, input.expectedVersion, 'issued', { status: input.decision });
      if (!updated) throw new ConflictError('The quotation changed or already has a customer decision.');
      const decision = await tx.createCustomerDecision({ companyId: principal.companyId, quotationRevisionId: revisionId, decision: input.decision, evidenceReference: input.evidenceReference, customerOrderReference: input.customerOrderReference, notes: input.notes, recordedByUserId: principal.userId });
      if (input.decision === 'accepted') {
        await tx.setCommercialState(principal.companyId, context.opportunityId, 'awarded');
        await tx.setLeadStage(principal.companyId, context.leadId, 'won');
        const projects = createProjectRepository(transaction);
        const project = await projects.findByOpportunityUnscoped(principal.companyId, context.opportunityId);
        if (project) {
          await projects.attachCommercialBaseline({ companyId: principal.companyId, projectId: project.id, quotationRevisionId: revisionId, quotationCustomerDecisionId: decision.id, customerEvidenceSnapshot: input.evidenceReference, customerOrderReference: input.customerOrderReference, acceptedAt: decision.recordedAt, createdByUserId: principal.userId });
          const recipients = (await projects.listMemberIds(principal.companyId, project.id)).map((member) => member.userId).filter((userId) => userId !== principal.userId);
          await createNotificationRepository(transaction).createMany(recipients.map((recipientUserId) => ({ companyId: principal.companyId, recipientUserId, type: 'project.commercially_awarded', severity: 'success' as const, title: 'Project commercially awarded', message: `${project.projectNumber} now has an accepted quotation baseline.`, link: `/projects/${project.id}`, targetType: 'project', targetId: project.id, dedupKey: `project-awarded:${project.id}:${revisionId}` })));
        }
      }
      await createAuthRepository(transaction).appendAuditEvent({ companyId: principal.companyId, actorUserId: principal.userId, action: `engineering.quotation_customer_${input.decision}`, targetType: 'quotation_revision', targetId: revisionId, requestId, metadata: { designJobId: jobId, evidenceReference: input.evidenceReference, customerOrderReference: input.customerOrderReference } });
      return updated;
    });
  }

  async getDocument(principal: AuthenticatedPrincipal, jobId: string, revisionId: string, documentId: string) {
    await this.job(principal, jobId);
    const found = await createQuotationRepository(this.database).findRevision(principal.companyId, jobId, revisionId);
    if (!found) throw new NotFoundError('Quotation revision not found.');
    const document = await createQuotationRepository(this.database).findIssueDocument(principal.companyId, revisionId, documentId);
    if (!document) throw new NotFoundError('Issued quotation document not found.');
    return document;
  }

  async exportExcel(principal: AuthenticatedPrincipal, jobId: string, revisionId: string) {
    await this.job(principal, jobId, 'engineering.quotation.read');
    const repository = createQuotationRepository(this.database);
    const found = await repository.findRevision(principal.companyId, jobId, revisionId);
    if (!found) throw new NotFoundError('Quotation revision not found.');
    if (found.revision.calculationVersion !== 'catalogue-markup-v1') {
      throw new ConflictError('Excel breakdown export is available only for catalogue-rate quotation revisions.');
    }
    const lines = await repository.listLines(principal.companyId, revisionId);
    const buffer = await renderQuotationExcel(this.document(found.revision, found.quotation.quotationNumber, lines));
    return { buffer, filename: `${found.quotation.quotationNumber}-R${found.revision.revisionNumber}.xlsx` };
  }
}

export const quotationService = new QuotationService();
