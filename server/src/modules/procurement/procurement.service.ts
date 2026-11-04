import { isAdministrator } from '../../core/security/administrator.js';
import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createCrmRepository } from '../crm/crm.repository.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createProcurementRepository } from './procurement.repository.js';

type ListInput = { search?: string; status?: string; page: number; pageSize: number; sort: 'requisitionNumber' | 'title' | 'status' | 'requiredBy' | 'updatedAt'; direction: 'asc' | 'desc' };
type RequisitionInput = {
  projectId: string; boqRevisionId: string; title: string; purchaseManagerUserId: string;
  requiredBy: string; deliveryLocation: string; notes?: string;
  lines: Array<{ boqLineId: string; quantity: string }>;
};
type OfferInput = {
  vendorId: string; vendorReference: string; currency: string; taxBasis: string; freightAmount: string;
  leadTimeDays?: number; paymentTerms: string; warranty: string; validUntil?: string;
  lines: Array<{ rfqLineId: string; unitRate: string; brandOffered: string; specificationOffered: string; equivalence: 'equivalent' | 'deviation' | 'unknown'; deviationNotes?: string }>;
};

function validation(message: string) { return new AppError('VALIDATION_ERROR', message, 422); }

export class ProcurementService {
  constructor(private readonly database: Database = db) {}

  private assert(principal: AuthenticatedPrincipal, permission: 'procurement.sourcing.read' | 'procurement.requisition.create' | 'procurement.rfq.manage' | 'procurement.offer.manage' | 'procurement.comparison.select' | 'procurement.substitution.review') {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    if (!hasPermission(principal, permission)) throw new ForbiddenError();
  }

  async list(principal: AuthenticatedPrincipal, input: ListInput) {
    this.assert(principal, 'procurement.sourcing.read');
    const result = await createProcurementRepository(this.database).list(principal.companyId, principal.userId, {
      ...input, limit: input.pageSize, offset: (input.page - 1) * input.pageSize,
    });
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async createOptions(principal: AuthenticatedPrincipal) {
    this.assert(principal, 'procurement.requisition.create');
    const repository = createProcurementRepository(this.database);
    const [rows, managers] = await Promise.all([
      repository.listProjectBoqOptions(principal.companyId, principal.userId),
      createCrmRepository(this.database).listEligibleUsers(principal.companyId, 'procurement.comparison.select'),
    ]);
    const projects = new Map<string, { id: string; projectNumber: string; title: string; boqs: Array<{ id: string; revisionNumber: number; title: string; lines: Awaited<ReturnType<typeof repository.listBoqLines>> }>; managers: Array<{ id: string; name: string; email: string }> }>();
    for (const row of rows) {
      if (!projects.has(row.projectId)) projects.set(row.projectId, { id: row.projectId, projectNumber: row.projectNumber, title: row.projectTitle, boqs: [], managers: [] });
      const project = projects.get(row.projectId)!;
      if (!project.boqs.some((boq) => boq.id === row.boqRevisionId)) {
        project.boqs.push({ id: row.boqRevisionId, revisionNumber: row.boqRevisionNumber, title: row.boqTitle, lines: await repository.listBoqLines(principal.companyId, row.boqRevisionId) });
      }
    }
    await Promise.all([...projects.values()].map(async (project) => {
      const memberIds = new Set((await repository.listProjectMemberIds(principal.companyId, project.id)).map((member) => member.userId));
      project.managers = managers.filter((manager) => memberIds.has(manager.id) && manager.id !== principal.userId);
    }));
    return { projects: [...projects.values()] };
  }

  async create(principal: AuthenticatedPrincipal, input: RequisitionInput, requestId: string) {
    this.assert(principal, 'procurement.requisition.create');
    if (input.purchaseManagerUserId === principal.userId) throw validation('The buyer and purchase manager must be different employees.');
    const manager = await createCrmRepository(this.database).findEligibleUser(principal.companyId, input.purchaseManagerUserId, 'procurement.comparison.select');
    if (!manager) throw validation('Choose an active employee eligible for purchase comparison selection.');

    return this.database.transaction(async (transaction) => {
      const repository = createProcurementRepository(transaction);
      const context = await repository.findProjectBoq(principal.companyId, principal.userId, input.projectId, input.boqRevisionId);
      if (!context) throw new NotFoundError('The started project or approved BOQ is outside your assigned scope.');
      const memberIds = new Set((await repository.listProjectMemberIds(principal.companyId, input.projectId)).map((member) => member.userId));
      if (!memberIds.has(input.purchaseManagerUserId)) throw validation('The purchase manager must be an explicit member of this project.');
      const boqLines = await repository.listBoqLines(principal.companyId, input.boqRevisionId);
      const requested = new Map(input.lines.map((line) => [line.boqLineId, line.quantity]));
      const selected = boqLines.filter((line) => requested.has(line.id));
      if (selected.length !== input.lines.length) throw validation('Every requisition line must belong to the selected approved BOQ.');
      for (const line of selected) {
        const quantity = new Decimal(requested.get(line.id)!);
        if (quantity.gt(line.quantity)) throw validation(`Requested quantity for ${line.itemCode} cannot exceed the approved BOQ quantity.`);
      }
      const now = new Date();
      const requisition = await repository.createRequisition({
        companyId: principal.companyId, projectId: input.projectId, boqRevisionId: input.boqRevisionId,
        requisitionNumber: await repository.allocateNumber(principal.companyId, 'REQUISITION', 'REQ', now),
        title: input.title, buyerUserId: principal.userId, purchaseManagerUserId: input.purchaseManagerUserId,
        requiredBy: input.requiredBy, deliveryLocation: input.deliveryLocation, notes: input.notes,
      });
      await repository.createRequisitionLines(selected.map((line, index) => ({
        companyId: principal.companyId, requisitionId: requisition.id, boqLineId: line.id, lineNumber: index + 1,
        itemId: line.itemId, itemCodeSnapshot: line.itemCode, itemNameSnapshot: line.itemName,
        specificationSnapshot: line.specification, unitId: line.unitId, unitSymbolSnapshot: line.unitSymbol,
        quantity: new Decimal(requested.get(line.id)!).toFixed(4),
      })));
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: input.purchaseManagerUserId, type: 'procurement.requisition_created', severity: 'info',
        title: 'Procurement requisition assigned', message: `${requisition.requisitionNumber} was assigned for supplier selection.`,
        link: `/procurement/requisitions/${requisition.id}`, targetType: 'procurement_requisition', targetId: requisition.id,
        dedupKey: `procurement-requisition:${requisition.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId, actorUserId: principal.userId, action: 'procurement.requisition_created',
        targetType: 'procurement_requisition', targetId: requisition.id, requestId,
        metadata: { projectId: input.projectId, boqRevisionId: input.boqRevisionId, lineCount: selected.length, purchaseManagerUserId: input.purchaseManagerUserId },
      });
      return requisition;
    });
  }

  private async requisition(principal: AuthenticatedPrincipal, requisitionId: string) {
    this.assert(principal, 'procurement.sourcing.read');
    const requisition = await createProcurementRepository(this.database).find(principal.companyId, principal.userId, requisitionId);
    if (!requisition) throw new NotFoundError('Procurement requisition not found.');
    return requisition;
  }

  async get(principal: AuthenticatedPrincipal, requisitionId: string) {
    const requisition = await this.requisition(principal, requisitionId);
    const repository = createProcurementRepository(this.database);
    const lines = await repository.listRequisitionLines(principal.companyId, requisitionId);
    const activeVendors = (requisition.buyerUserId === principal.userId || isAdministrator(principal)) ? await repository.listActiveVendors(principal.companyId) : [];
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq) return { requisition, lines, activeVendors, rfq: null, rfqLines: [], invitedVendors: [], offers: [], comparison: null, selection: null, capabilities: this.capabilities(principal, requisition) };
    const [rfqLines, invitedVendors, offers, comparison] = await Promise.all([
      repository.listRfqLines(principal.companyId, rfq.id), repository.listRfqVendors(principal.companyId, rfq.id),
      repository.listOffers(principal.companyId, rfq.id), repository.findComparison(principal.companyId, rfq.id),
    ]);
    const itemIds = Array.from(new Set(rfqLines.map((line) => line.itemId).filter(Boolean)));
    const itemBrandsList = await repository.listBrandsForItems(principal.companyId, itemIds);
    const rfqLinesWithBrands = rfqLines.map((line) => ({
      ...line,
      eligibleBrands: itemBrandsList.filter((b) => b.itemId === line.itemId),
    }));
    const offerLines = await repository.listOfferLines(principal.companyId, offers.map((offer) => offer.id));
    const substitutionReviews = await repository.listSubstitutionReviews(principal.companyId, offerLines.map((line) => line.id));
    const offersWithLines = offers.map((offer) => ({ ...offer, lines: offerLines.filter((line) => line.vendorOfferId === offer.id).map((line) => ({
      ...line,
      substitutionReview: substitutionReviews.find((review) => review.vendorOfferLineId === line.id) ?? null,
    })) }));
    const selection = comparison ? await repository.findSelection(principal.companyId, comparison.id) : null;
    return { requisition, lines, activeVendors, rfq, rfqLines: rfqLinesWithBrands, invitedVendors, offers: offersWithLines, comparison, selection, capabilities: this.capabilities(principal, requisition) };
  }

  private capabilities(principal: AuthenticatedPrincipal, requisition: { buyerUserId: string; purchaseManagerUserId: string }) {
    return {
      canManageRfq: (requisition.buyerUserId === principal.userId || isAdministrator(principal)) && hasPermission(principal, 'procurement.rfq.manage'),
      canRecordOffer: (requisition.buyerUserId === principal.userId || isAdministrator(principal)) && hasPermission(principal, 'procurement.offer.manage'),
      canSelect: (requisition.purchaseManagerUserId === principal.userId || isAdministrator(principal)) && (requisition.buyerUserId !== principal.userId || isAdministrator(principal)) && hasPermission(principal, 'procurement.comparison.select'),
    };
  }

  async createRfq(principal: AuthenticatedPrincipal, requisitionId: string, input: { vendorIds: string[]; responseDueDate: string; commercialTerms: string; expectedVersion: number }, requestId: string) {
    this.assert(principal, 'procurement.rfq.manage');
    const requisition = await this.requisition(principal, requisitionId);
    if (!isAdministrator(principal) && requisition.buyerUserId !== principal.userId) throw new ForbiddenError('Only the assigned buyer can create this RFQ.');
    if (requisition.status !== 'open') throw new ConflictError('This requisition is already in sourcing.');
    const repository = createProcurementRepository(this.database);
    const vendors = await repository.findActiveVendors(principal.companyId, input.vendorIds);
    if (vendors.length !== input.vendorIds.length) throw validation('Every invited vendor must be active and belong to this company.');
    const requisitionLines = await repository.listRequisitionLines(principal.companyId, requisitionId);
    if (requisitionLines.length === 0) throw validation('The requisition must contain at least one demand line.');

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const now = new Date();
      const rfq = await tx.createRfq({
        companyId: principal.companyId, requisitionId,
        rfqNumber: await tx.allocateNumber(principal.companyId, 'RFQ', 'RFQ', now),
        responseDueDate: input.responseDueDate, commercialTerms: input.commercialTerms, createdByUserId: principal.userId,
      });
      if (!rfq) throw new ConflictError('An RFQ already exists for this requisition.');
      await tx.createRfqVendors(input.vendorIds.map((vendorId) => ({ companyId: principal.companyId, rfqId: rfq.id, vendorId })));
      await tx.createRfqLines(requisitionLines.map((line) => ({
        companyId: principal.companyId, rfqId: rfq.id, requisitionLineId: line.id, lineNumber: line.lineNumber,
        itemId: line.itemId, itemCodeSnapshot: line.itemCodeSnapshot, itemNameSnapshot: line.itemNameSnapshot,
        specificationSnapshot: line.specificationSnapshot, unitId: line.unitId, unitSymbolSnapshot: line.unitSymbolSnapshot, quantity: line.quantity,
      })));
      await tx.createComparison({ companyId: principal.companyId, rfqId: rfq.id });
      if (!await tx.transitionRequisition(principal.companyId, requisitionId, input.expectedVersion, 'open', 'sourcing')) {
        throw new ConflictError('The requisition changed. Refresh and try again.');
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId, actorUserId: principal.userId, action: 'procurement.rfq_created', targetType: 'procurement_rfq', targetId: rfq.id, requestId,
        metadata: { requisitionId, vendorIds: input.vendorIds, lineCount: requisitionLines.length, responseDueDate: input.responseDueDate, externalDelivery: false },
      });
      return rfq;
    });
  }

  async recordOffer(principal: AuthenticatedPrincipal, requisitionId: string, input: OfferInput, requestId: string) {
    this.assert(principal, 'procurement.offer.manage');
    const requisition = await this.requisition(principal, requisitionId);
    if (!isAdministrator(principal) && requisition.buyerUserId !== principal.userId) throw new ForbiddenError('Only the assigned buyer can record vendor offers.');
    const repository = createProcurementRepository(this.database);
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq || rfq.status !== 'open' || requisition.status !== 'sourcing') throw new ConflictError('This RFQ is not open for offers.');
    if (!await repository.isInvitedVendor(principal.companyId, rfq.id, input.vendorId)) throw validation('Choose a vendor invited to this RFQ.');
    const rfqLines = await repository.listRfqLines(principal.companyId, rfq.id);
    const submittedLines = new Map(input.lines.map((line) => [line.rfqLineId, line]));
    if (rfqLines.length !== input.lines.length || rfqLines.some((line) => !submittedLines.has(line.id))) {
      throw validation('Record one offer line for every RFQ line.');
    }
    const computed = rfqLines.map((line) => {
      const inputLine = submittedLines.get(line.id)!;
      return { line, input: inputLine, total: new Decimal(line.quantity).mul(inputLine.unitRate).toDecimalPlaces(2) };
    });
    const subtotal = computed.reduce((sum, line) => sum.plus(line.total), new Decimal(0));
    const freight = new Decimal(input.freightAmount);

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const offer = await tx.createOffer({
        companyId: principal.companyId, rfqId: rfq.id, vendorId: input.vendorId, vendorReference: input.vendorReference,
        currency: input.currency, taxBasis: input.taxBasis, freightAmount: freight.toFixed(2), leadTimeDays: input.leadTimeDays,
        paymentTerms: input.paymentTerms, warranty: input.warranty, validUntil: input.validUntil,
        subtotal: subtotal.toFixed(2), total: subtotal.plus(freight).toFixed(2), recordedByUserId: principal.userId,
      });
      if (!offer) throw new ConflictError('An offer for this vendor is already recorded against the RFQ.');
      await tx.createOfferLines(computed.map(({ line, input: offerLine, total }) => ({
        companyId: principal.companyId, vendorOfferId: offer.id, rfqLineId: line.id, lineNumber: line.lineNumber,
        unitRate: new Decimal(offerLine.unitRate).toFixed(2), lineTotal: total.toFixed(2), brandOffered: offerLine.brandOffered,
        specificationOffered: offerLine.specificationOffered, equivalence: offerLine.equivalence, deviationNotes: offerLine.deviationNotes,
      })));
      const needsEngineeringReview = computed.some(({ input: line }) => line.equivalence !== 'equivalent');
      const engineeringReviewer = needsEngineeringReview ? await tx.findEngineeringReviewer(principal.companyId, requisitionId) : undefined;
      if (engineeringReviewer?.userId && engineeringReviewer.userId !== principal.userId) {
        await createNotificationRepository(transaction).create({
          companyId: principal.companyId, recipientUserId: engineeringReviewer.userId, type: 'procurement.substitution_review_requested', severity: 'warning',
          title: 'Technical offer review requested', message: `${requisition.requisitionNumber} contains a vendor deviation or unknown equivalence requiring your decision.`,
          link: `/procurement/substitution-reviews/${requisitionId}`, targetType: 'vendor_offer', targetId: offer.id,
          dedupKey: `procurement-substitution-review:${offer.id}`,
        });
      }
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: requisition.purchaseManagerUserId, type: 'procurement.offer_recorded', severity: 'info',
        title: 'Vendor offer recorded', message: `${requisition.requisitionNumber} has another submitted vendor offer.`,
        link: `/procurement/requisitions/${requisitionId}`, targetType: 'vendor_offer', targetId: offer.id,
        dedupKey: `vendor-offer:${offer.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId, actorUserId: principal.userId, action: 'procurement.vendor_offer_recorded', targetType: 'vendor_offer', targetId: offer.id, requestId,
        metadata: { requisitionId, rfqId: rfq.id, vendorId: input.vendorId, currency: input.currency, total: offer.total, lineCount: computed.length },
      });
      return offer;
    });
  }

  async selectOffer(principal: AuthenticatedPrincipal, requisitionId: string, input: { offerId: string; selectionReason: string; singleSourceExceptionReason?: string; expectedVersion: number }, requestId: string) {
    this.assert(principal, 'procurement.comparison.select');
    const requisition = await this.requisition(principal, requisitionId);
    if (!isAdministrator(principal) && requisition.purchaseManagerUserId !== principal.userId) throw new ForbiddenError('Only the assigned purchase manager can select the supplier.');
    if (!isAdministrator(principal) && requisition.buyerUserId === principal.userId) throw new ForbiddenError('The buyer cannot approve their own sourcing work.');
    const repository = createProcurementRepository(this.database);
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq || rfq.status !== 'open' || requisition.status !== 'sourcing') throw new ConflictError('This comparison is not open for selection.');
    const [offers, comparison] = await Promise.all([repository.listOffers(principal.companyId, rfq.id), repository.findComparison(principal.companyId, rfq.id)]);
    if (!comparison) throw new NotFoundError('Purchase comparison not found.');
    const selected = offers.find((offer) => offer.id === input.offerId);
    if (!selected) throw validation('Choose a submitted offer from this RFQ.');
    if (offers.length < 2 && !input.singleSourceExceptionReason) throw validation('A purchase-manager single-source exception reason is required when fewer than two vendor offers are available.');
    // Technical reviews not required per business update: purchase manager can select offer directly
    const sameCurrency = offers.filter((offer) => offer.currency === selected.currency);
    const lowestComparable = sameCurrency.reduce((lowest, offer) => new Decimal(offer.total).lt(lowest) ? new Decimal(offer.total) : lowest, new Decimal(selected.total));
    const nonLowest = new Decimal(selected.total).gt(lowestComparable);

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const locked = await tx.lockComparison(principal.companyId, comparison.id);
      if (!locked || locked.status !== 'open' || locked.rowVersion !== input.expectedVersion) throw new ConflictError('The comparison changed or was already selected.');
      if (!await tx.transitionComparison(principal.companyId, comparison.id, input.expectedVersion)) throw new ConflictError('The comparison changed or was already selected.');
      if (!await tx.transitionRfq(principal.companyId, rfq.id, rfq.rowVersion)) throw new ConflictError('The RFQ changed or was already closed.');
      if (!await tx.transitionRequisition(principal.companyId, requisitionId, requisition.rowVersion, 'sourcing', 'selected')) throw new ConflictError('The requisition changed. Refresh and try again.');
      const decision = await tx.createSelection({
        companyId: principal.companyId, comparisonId: comparison.id, selectedOfferId: selected.id,
        selectionReason: input.selectionReason, singleSourceExceptionReason: offers.length < 2 ? input.singleSourceExceptionReason : undefined,
        selectedByUserId: principal.userId,
      });
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId, recipientUserId: requisition.buyerUserId, type: 'procurement.supplier_selected', severity: 'success',
        title: 'Supplier selected', message: `${selected.vendorName} was selected for ${requisition.requisitionNumber}.`,
        link: `/procurement/requisitions/${requisitionId}`, targetType: 'procurement_selection', targetId: decision.id,
        dedupKey: `supplier-selected:${comparison.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId, actorUserId: principal.userId, action: 'procurement.supplier_selected', targetType: 'procurement_selection', targetId: decision.id, requestId,
        metadata: { administratorOverride: isAdministrator(principal), requisitionId, rfqId: rfq.id, selectedOfferId: selected.id, vendorId: selected.vendorId, offerCount: offers.length, singleSourceException: offers.length < 2, nonLowestComparable: nonLowest, currency: selected.currency, total: selected.total },
      });
      return decision;
    });
  }

  async listSubstitutionReviews(principal: AuthenticatedPrincipal, input: { search?: string; status?: 'pending' | 'approved' | 'rejected'; page: number; pageSize: number; sort: 'requisitionNumber' | 'vendorName' | 'itemName' | 'status' | 'updatedAt'; direction: 'asc' | 'desc' }) {
    this.assert(principal, 'procurement.substitution.review');
    const result = await createProcurementRepository(this.database).listSubstitutionReviewQueue(principal.companyId, principal.userId, {
      ...input, limit: input.pageSize, offset: (input.page - 1) * input.pageSize,
    });
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async getSubstitutionReview(principal: AuthenticatedPrincipal, requisitionId: string) {
    this.assert(principal, 'procurement.substitution.review');
    const repository = createProcurementRepository(this.database);
    const context = await repository.findTechnicalReviewContext(principal.companyId, principal.userId, requisitionId);
    if (!context) throw new NotFoundError('Technical substitution review not found or outside your project assignment.');
    const items = await repository.listTechnicalReviewItems(principal.companyId, requisitionId);
    return { context, items, capabilities: { canReview: context.requisitionStatus === 'sourcing' } };
  }

  async reviewSubstitution(principal: AuthenticatedPrincipal, requisitionId: string, offerLineId: string, input: { decision: 'approved' | 'rejected'; reason: string }, requestId: string) {
    this.assert(principal, 'procurement.substitution.review');
    const repository = createProcurementRepository(this.database);
    const context = await repository.findTechnicalReviewContext(principal.companyId, principal.userId, requisitionId);
    if (!context) throw new NotFoundError('Technical substitution review not found or outside your project assignment.');
    if (context.requisitionStatus !== 'sourcing') throw new ConflictError('This sourcing comparison is no longer open for technical review.');
    const line = await repository.findOfferLineForReview(principal.companyId, requisitionId, offerLineId);
    if (!line || line.equivalence === 'equivalent') throw new NotFoundError('Technical deviation line not found.');
    if (!isAdministrator(principal) && line.recordedByUserId === principal.userId) throw new ForbiddenError('You cannot authorize a vendor offer that you recorded.');

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const review = await tx.createSubstitutionReview({
        companyId: principal.companyId,
        vendorOfferLineId: offerLineId,
        decision: input.decision,
        reason: input.reason,
        reviewedByUserId: principal.userId,
      });
      if (!review) throw new ConflictError('This technical line already has an immutable engineering decision.');
      for (const recipientUserId of new Set([context.buyerUserId, context.purchaseManagerUserId])) {
        if (recipientUserId === principal.userId) continue;
        await createNotificationRepository(transaction).create({
          companyId: principal.companyId, recipientUserId, type: 'procurement.substitution_reviewed', severity: input.decision === 'approved' ? 'success' : 'warning',
          title: `Technical substitution ${input.decision}`, message: `${line.vendorName} · ${line.itemName} was ${input.decision} for ${context.requisitionNumber}.`,
          link: `/procurement/requisitions/${requisitionId}`, targetType: 'procurement_substitution_review', targetId: review.id,
          dedupKey: `procurement-substitution-reviewed:${review.id}:${recipientUserId}`,
        });
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId, actorUserId: principal.userId, action: `procurement.substitution_${input.decision}`,
        targetType: 'vendor_offer_line', targetId: offerLineId, requestId,
        metadata: { administratorOverride: isAdministrator(principal), requisitionId, decision: input.decision, reason: input.reason, vendorName: line.vendorName, itemName: line.itemName },
      });
      return review;
    });
  }
}

export const procurementService = new ProcurementService();
