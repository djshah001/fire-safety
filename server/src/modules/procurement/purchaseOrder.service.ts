import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { env } from '../../config/env.js';
import {
  ensureUploadRoot,
  removePrivateFile,
  resolvePrivateFile,
} from '../../infrastructure/storage/localFileStorage.js';
import { deliverMail } from '../../infrastructure/mail/mailDelivery.js';
import { msg91WhatsAppService } from '../../infrastructure/notifications/msg91.js';
import { renderSupplierReturnPdf } from '../../infrastructure/documents/supplierReturn.pdf.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { isAdministrator } from '../../core/security/administrator.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { createProcurementRepository } from './procurement.repository.js';
import { createPurchaseOrderRepository } from './purchaseOrder.repository.js';
import { procurementService } from './procurement.service.js';
import { renderPurchaseOrderPdf } from '../../infrastructure/documents/purchaseOrder.pdf.js';
import {
  companies,
  goodsReceiptLines,
  goodsReceipts,
  projects,
  purchaseOrderDispatches,
  purchaseOrderLines,
  purchaseOrderRevisions,
  purchaseOrders,
  storeReplenishmentRequests,
  supplierReturnLines,
  supplierReturns,
  vendors,
  warehouseItemThresholds,
} from '../../infrastructure/database/schema/index.js';
import { and, eq, inArray, sql } from 'drizzle-orm';

function validation(message: string) {
  return new AppError('VALIDATION_ERROR', message, 422);
}

export class PurchaseOrderService {
  constructor(private readonly database: Database = db) {}

  private assert(
    principal: AuthenticatedPrincipal,
    permission:
      | 'procurement.purchase_order.read'
      | 'procurement.purchase_order.create'
      | 'procurement.purchase_order.approve'
      | 'procurement.purchase_order.issue'
      | 'procurement.purchase_order.amend'
      | 'procurement.goods_receipt.read'
      | 'procurement.goods_receipt.manage'
      | 'procurement.goods_receipt.inspect',
  ) {
    if (principal.mustChangePassword) {
      throw new ForbiddenError('Change the temporary password before using this feature.');
    }
    if (!hasPermission(principal, permission)) {
      throw new ForbiddenError();
    }
  }

  async list(
    principal: AuthenticatedPrincipal,
    input: {
      search?: string;
      status?: string;
      vendorId?: string;
      projectId?: string;
      page: number;
      pageSize: number;
      sort: 'poNumber' | 'title' | 'status' | 'grandTotal' | 'deliveryDueDate' | 'createdAt' | 'updatedAt';
      direction: 'asc' | 'desc';
    },
  ) {
    this.assert(principal, 'procurement.purchase_order.read');
    const repo = createPurchaseOrderRepository(this.database);
    const result = await repo.list(principal.companyId, principal.userId, {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async get(principal: AuthenticatedPrincipal, poId: string) {
    this.assert(principal, 'procurement.purchase_order.read');
    const repo = createPurchaseOrderRepository(this.database);
    const po = await repo.getById(principal.companyId, principal.userId, poId);
    if (!po) throw new NotFoundError('Purchase order not found or not in your scope.');

    const revisions = await repo.getRevisions(principal.companyId, poId);
    const currentRevision = revisions[0];
    if (!currentRevision) throw new NotFoundError('Purchase order revision history is missing.');

    const [lines, receipts, vendorContact, dispatches, supplierReturnsList] = await Promise.all([
      repo.getLinesForRevision(principal.companyId, currentRevision.id),
      repo.getGoodsReceiptsForPo(principal.companyId, poId),
      repo.getPrimaryVendorContact(principal.companyId, po.vendorId),
      repo.getDispatchesForPo(principal.companyId, poId),
      repo.getSupplierReturnsForPo(principal.companyId, poId),
    ]);

    const isSysAdmin = isAdministrator(principal);
    const hasAcceptedDeliveries = lines.some((l) => new Decimal(l.acceptedQuantity).gt(0));
    const hasOpenUnreceivedLines = lines.some((l) =>
      new Decimal(l.acceptedQuantity).lt(new Decimal(l.quantity)),
    );
    const hasRejectedReceipts = receipts.some((r) =>
      r.lines.some((l) => new Decimal(l.rejectedQuantity).gt(0)),
    );

    const capabilities = {
      canSubmit:
        currentRevision.status === 'draft' &&
        (principal.userId === currentRevision.preparedByUserId || isSysAdmin),
      canApprove:
        currentRevision.status === 'submitted' &&
        hasPermission(principal, 'procurement.purchase_order.approve') &&
        (principal.userId !== currentRevision.preparedByUserId || isSysAdmin),
      canIssue:
        currentRevision.status === 'approved' &&
        hasPermission(principal, 'procurement.purchase_order.issue'),
      canAmend:
        ['issued', 'partially_delivered'].includes(po.status) &&
        currentRevision.status === 'issued' &&
        hasPermission(principal, 'procurement.purchase_order.amend'),
      canCancel:
        ['draft', 'pending_approval', 'approved', 'issued'].includes(po.status) &&
        !hasAcceptedDeliveries &&
        hasPermission(principal, 'procurement.purchase_order.create'),
      canShortClose:
        ['issued', 'partially_delivered'].includes(po.status) &&
        hasOpenUnreceivedLines &&
        hasPermission(principal, 'procurement.purchase_order.approve'),
      canDispatchVendor:
        po.status === 'issued' &&
        currentRevision.status === 'issued' &&
        Boolean(currentRevision.issuedPdfStorageId) &&
        (hasPermission(principal, 'procurement.purchase_order.create') ||
          hasPermission(principal, 'procurement.purchase_order.issue') ||
          hasPermission(principal, 'procurement.purchase_order.approve') ||
          isSysAdmin),
      canReceive:
        ['issued', 'partially_delivered'].includes(po.status) &&
        hasPermission(principal, 'procurement.goods_receipt.manage'),
      canInspect:
        hasPermission(principal, 'procurement.goods_receipt.inspect'),
      canApproveOverdelivery:
        hasPermission(principal, 'procurement.purchase_order.approve') &&
        (isSysAdmin || po.createdByUserId !== principal.userId),
      canCreateRtv:
        hasRejectedReceipts &&
        hasPermission(principal, 'procurement.purchase_order.create'),
    };

    return {
      purchaseOrder: po,
      currentRevision,
      revisions,
      lines,
      goodsReceipts: receipts,
      vendorContact,
      dispatches,
      supplierReturns: supplierReturnsList,
      capabilities,
    };
  }

  async createFromRequisition(
    principal: AuthenticatedPrincipal,
    input: {
      requisitionId: string;
      title?: string;
      paymentTerms?: string;
      deliveryTerms?: string;
      deliveryLocation?: string;
      deliveryDueDate?: string;
      billingAddress?: string;
      shippingAddress?: string;
      notes?: string;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    const workspace = await procurementService.get(principal, input.requisitionId);
    if (workspace.requisition.status !== 'selected' || !workspace.selection) {
      throw validation('A purchase order can only be generated from a requisition with an awarded supplier selection.');
    }

    const winningOffer = workspace.offers.find((o) => o.id === workspace.selection!.selectedOfferId);
    if (!winningOffer) throw new NotFoundError('Selected vendor offer record not found.');

    const rfqLines = workspace.rfqLines;

    let subtotalAcc = new Decimal(0);
    let taxAmountAcc = new Decimal(0);

    const calculatedLines = winningOffer.lines.map((offerLine, idx) => {
      const rfqLine = rfqLines.find((r) => r.id === offerLine.rfqLineId);
      if (!rfqLine) throw validation(`Missing RFQ line for offer line ${offerLine.id}`);

      const reqLine = workspace.lines.find((l) => l.id === rfqLine.requisitionLineId);
      const qty = new Decimal(rfqLine.quantity);
      const rate = new Decimal(offerLine.unitRate);
      const lineBase = qty.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineTax = lineBase.mul(0.18).toDecimalPlaces(2, Decimal.ROUND_HALF_UP); // Default 18% GST
      const lineTotal = lineBase.plus(lineTax);

      subtotalAcc = subtotalAcc.plus(lineBase);
      taxAmountAcc = taxAmountAcc.plus(lineTax);

      const projectAllocationQty = reqLine?.projectAllocationQty ?? (workspace.requisition.projectId ? qty.toFixed(4) : '0.0000');
      const storeReplenishmentQty = reqLine?.storeReplenishmentQty ?? (workspace.requisition.projectId ? '0.0000' : qty.toFixed(4));

      return {
        lineNumber: idx + 1,
        itemId: rfqLine.itemId,
        brandOfferingId: reqLine?.brandOfferingId ?? null,
        quotationLineId: reqLine?.quotationLineId ?? null,
        srrId: reqLine?.srrId ?? null,
        itemCodeSnapshot: rfqLine.itemCodeSnapshot,
        itemNameSnapshot: rfqLine.itemNameSnapshot,
        specificationSnapshot: offerLine.specificationOffered || rfqLine.specificationSnapshot,
        brandOffered: offerLine.brandOffered,
        modelSnapshot: null,
        unitId: rfqLine.unitId,
        unitSymbolSnapshot: rfqLine.unitSymbolSnapshot,
        quantity: qty.toFixed(4),
        projectAllocationQty,
        storeReplenishmentQty,
        destinationType: reqLine?.destinationType ?? ('warehouse' as const),
        unitRate: rate.toFixed(2),
        taxPercent: '18.00',
        taxAmount: lineTax.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        requisitionLineId: rfqLine.requisitionLineId,
      };
    });

    const grandTotal = subtotalAcc.plus(taxAmountAcc);

    return this.database.transaction(async (tx) => {
      const repo = createPurchaseOrderRepository(tx);

      // Check if a PO already exists for this requisition
      const [existingPo] = await tx
        .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.companyId, principal.companyId),
            eq(purchaseOrders.requisitionId, input.requisitionId),
            sql`${purchaseOrders.status} <> 'cancelled'`,
          ),
        );
      if (existingPo) {
        throw new ConflictError(`A purchase order (${existingPo.poNumber}) already exists for this requisition.`);
      }

      const now = new Date();
      const poNumber = await repo.allocatePoNumber(principal.companyId, now);

      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          companyId: principal.companyId,
          projectId: workspace.requisition.projectId,
          vendorId: winningOffer.vendorId,
          requisitionId: workspace.requisition.id,
          poNumber,
          title: input.title ?? `Purchase Order for ${workspace.requisition.title}`,
          status: 'draft',
          currency: winningOffer.currency ?? 'INR',
          paymentTerms: input.paymentTerms ?? winningOffer.paymentTerms,
          deliveryTerms: input.deliveryTerms ?? 'FOR Site Delivery',
          deliveryLocation: input.deliveryLocation ?? workspace.requisition.deliveryLocation,
          deliveryDueDate: input.deliveryDueDate ?? workspace.requisition.requiredBy,
          billingAddress: input.billingAddress ?? null,
          shippingAddress: input.shippingAddress ?? workspace.requisition.deliveryLocation,
          notes: input.notes ?? null,
          currentRevisionNumber: 0,
          subtotal: subtotalAcc.toFixed(2),
          taxAmount: taxAmountAcc.toFixed(2),
          grandTotal: grandTotal.toFixed(2),
          createdByUserId: principal.userId,
        })
        .returning();

      const [revision] = await tx
        .insert(purchaseOrderRevisions)
        .values({
          companyId: principal.companyId,
          purchaseOrderId: po!.id,
          revisionNumber: 0,
          status: 'draft',
          subtotal: subtotalAcc.toFixed(2),
          taxAmount: taxAmountAcc.toFixed(2),
          grandTotal: grandTotal.toFixed(2),
          changeReason: null,
          preparedByUserId: principal.userId,
        })
        .returning();

      await tx.insert(purchaseOrderLines).values(
        calculatedLines.map((line) => ({
          ...line,
          companyId: principal.companyId,
          purchaseOrderId: po!.id,
          revisionId: revision!.id,
        })),
      );

      const linkedSrrIds = Array.from(
        new Set(calculatedLines.map((line) => line.srrId).filter((id): id is string => Boolean(id))),
      );
      if (linkedSrrIds.length > 0) {
        await tx
          .update(storeReplenishmentRequests)
          .set({
            status: 'ordered',
            linkedPoId: po!.id,
            updatedAt: now,
            rowVersion: sql`${storeReplenishmentRequests.rowVersion} + 1`,
          })
          .where(
            and(
              eq(storeReplenishmentRequests.companyId, principal.companyId),
              inArray(storeReplenishmentRequests.id, linkedSrrIds),
            ),
          );
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_created_from_requisition',
        targetType: 'purchase_order',
        targetId: po!.id,
        requestId,
        metadata: {
          requisitionId: workspace.requisition.id,
          poNumber,
          vendorId: winningOffer.vendorId,
          grandTotal: grandTotal.toFixed(2),
        },
      });

      return { id: po!.id, poNumber };
    });
  }

  async createFromRequisitionAwards(
    principal: AuthenticatedPrincipal,
    input: {
      requisitionId: string;
      vendorId?: string;
      title?: string;
      paymentTerms?: string;
      deliveryTerms?: string;
      deliveryLocation?: string;
      deliveryDueDate?: string;
      billingAddress?: string;
      shippingAddress?: string;
      notes?: string;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    const workspace = await procurementService.get(principal, input.requisitionId);
    if (workspace.requisition.status !== 'selected' || !workspace.selection) {
      throw validation('Purchase orders can only be generated from a requisition with an awarded selection.');
    }

    const pendingAwards = workspace.lineAwards.filter(
      (award) => !award.generatedPoId && (!input.vendorId || award.winningVendorId === input.vendorId),
    );
    if (pendingAwards.length === 0) {
      if (workspace.lineAwards.length === 0 && !input.vendorId) {
        const single = await this.createFromRequisition(principal, input, requestId);
        return { purchaseOrders: [single] };
      }
      throw new ConflictError('No un-ordered awarded lines remain for the selected vendor(s).');
    }

    const awardsByVendor = new Map<string, typeof pendingAwards>();
    for (const award of pendingAwards) {
      const bucket = awardsByVendor.get(award.winningVendorId) ?? [];
      bucket.push(award);
      awardsByVendor.set(award.winningVendorId, bucket);
    }

    return this.database.transaction(async (tx) => {
      const repo = createPurchaseOrderRepository(tx);
      const procRepo = createProcurementRepository(tx);
      const createdPos: Array<{ id: string; poNumber: string; vendorId: string; vendorName: string }> = [];
      const now = new Date();

      for (const [vendorId, vendorAwards] of awardsByVendor) {
        const firstOffer = workspace.offers.find((o) => o.id === vendorAwards[0]!.winningOfferId);
        if (!firstOffer) {
          throw new NotFoundError('Winning vendor offer record not found.');
        }

        let subtotalAcc = new Decimal(0);
        let taxAmountAcc = new Decimal(0);

        const calculatedLines = vendorAwards.map((award, idx) => {
          const rfqLine = workspace.rfqLines.find((r) => r.id === award.rfqLineId);
          if (!rfqLine) throw validation(`Missing RFQ line for award ${award.id}`);
          const offer = workspace.offers.find((o) => o.id === award.winningOfferId);
          const offerLine = offer?.lines.find((l) => l.id === award.winningOfferLineId);
          if (!offer || !offerLine) throw validation(`Missing winning offer line for award ${award.id}`);

          const reqLine = workspace.lines.find((l) => l.id === rfqLine.requisitionLineId);
          const qty = new Decimal(award.awardedQuantity);
          const rate = new Decimal(offerLine.unitRate);
          const lineBase = qty.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          const lineTax = lineBase.mul(0.18).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          const lineTotal = lineBase.plus(lineTax);

          subtotalAcc = subtotalAcc.plus(lineBase);
          taxAmountAcc = taxAmountAcc.plus(lineTax);

          const projectAllocationQty = reqLine?.projectAllocationQty ?? (workspace.requisition.projectId ? qty.toFixed(4) : '0.0000');
          const storeReplenishmentQty = reqLine?.storeReplenishmentQty ?? (workspace.requisition.projectId ? '0.0000' : qty.toFixed(4));

          return {
            lineNumber: idx + 1,
            itemId: rfqLine.itemId,
            brandOfferingId: reqLine?.brandOfferingId ?? null,
            quotationLineId: reqLine?.quotationLineId ?? null,
            srrId: reqLine?.srrId ?? null,
            itemCodeSnapshot: rfqLine.itemCodeSnapshot,
            itemNameSnapshot: rfqLine.itemNameSnapshot,
            specificationSnapshot: offerLine.specificationOffered || rfqLine.specificationSnapshot,
            brandOffered: offerLine.brandOffered,
            modelSnapshot: null,
            unitId: rfqLine.unitId,
            unitSymbolSnapshot: rfqLine.unitSymbolSnapshot,
            quantity: qty.toFixed(4),
            projectAllocationQty,
            storeReplenishmentQty,
            destinationType: reqLine?.destinationType ?? ('warehouse' as const),
            unitRate: rate.toFixed(2),
            taxPercent: '18.00',
            taxAmount: lineTax.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            requisitionLineId: rfqLine.requisitionLineId,
          };
        });

        const grandTotal = subtotalAcc.plus(taxAmountAcc);
        const poNumber = await repo.allocatePoNumber(principal.companyId, now);

        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            companyId: principal.companyId,
            projectId: workspace.requisition.projectId,
            vendorId,
            requisitionId: workspace.requisition.id,
            poNumber,
            title: input.title ?? `PO (${firstOffer.vendorName}) — ${workspace.requisition.title}`,
            status: 'draft',
            currency: firstOffer.currency ?? 'INR',
            paymentTerms: input.paymentTerms ?? firstOffer.paymentTerms,
            deliveryTerms: input.deliveryTerms ?? 'FOR Site Delivery',
            deliveryLocation: input.deliveryLocation ?? workspace.requisition.deliveryLocation,
            deliveryDueDate: input.deliveryDueDate ?? workspace.requisition.requiredBy,
            billingAddress: input.billingAddress ?? null,
            shippingAddress: input.shippingAddress ?? workspace.requisition.deliveryLocation,
            notes: input.notes ?? null,
            currentRevisionNumber: 0,
            subtotal: subtotalAcc.toFixed(2),
            taxAmount: taxAmountAcc.toFixed(2),
            grandTotal: grandTotal.toFixed(2),
            createdByUserId: principal.userId,
          })
          .returning();

        const [revision] = await tx
          .insert(purchaseOrderRevisions)
          .values({
            companyId: principal.companyId,
            purchaseOrderId: po!.id,
            revisionNumber: 0,
            status: 'draft',
            subtotal: subtotalAcc.toFixed(2),
            taxAmount: taxAmountAcc.toFixed(2),
            grandTotal: grandTotal.toFixed(2),
            changeReason: null,
            preparedByUserId: principal.userId,
          })
          .returning();

        await tx.insert(purchaseOrderLines).values(
          calculatedLines.map((line) => ({
            ...line,
            companyId: principal.companyId,
            purchaseOrderId: po!.id,
            revisionId: revision!.id,
          })),
        );

        const awardIds = vendorAwards.map((a) => a.id);
        const marked = await procRepo.markAwardsOrdered(principal.companyId, awardIds, po!.id);
        if (marked.length !== awardIds.length) {
          throw new ConflictError('Some awarded lines were already converted to a Purchase Order. Reload and try again.');
        }

        const linkedSrrIds = Array.from(
          new Set(calculatedLines.map((line) => line.srrId).filter((id): id is string => Boolean(id))),
        );
        if (linkedSrrIds.length > 0) {
          await tx
            .update(storeReplenishmentRequests)
            .set({
              status: 'ordered',
              linkedPoId: po!.id,
              updatedAt: now,
              rowVersion: sql`${storeReplenishmentRequests.rowVersion} + 1`,
            })
            .where(
              and(
                eq(storeReplenishmentRequests.companyId, principal.companyId),
                inArray(storeReplenishmentRequests.id, linkedSrrIds),
              ),
            );
        }

        await createAuthRepository(tx).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'procurement.purchase_order_created_from_awards',
          targetType: 'purchase_order',
          targetId: po!.id,
          requestId,
          metadata: {
            requisitionId: workspace.requisition.id,
            poNumber,
            vendorId,
            awardIds,
            grandTotal: grandTotal.toFixed(2),
          },
        });

        createdPos.push({
          id: po!.id,
          poNumber,
          vendorId,
          vendorName: firstOffer.vendorName,
        });
      }

      return { purchaseOrders: createdPos };
    });
  }

  async createDirect(
    principal: AuthenticatedPrincipal,
    input: {
      projectId: string;
      vendorId: string;
      title: string;
      currency?: string;
      paymentTerms: string;
      deliveryTerms: string;
      deliveryLocation: string;
      deliveryDueDate?: string;
      billingAddress?: string;
      shippingAddress?: string;
      notes?: string;
      lines: Array<{
        itemId: string;
        itemCodeSnapshot: string;
        itemNameSnapshot: string;
        specificationSnapshot: string;
        brandOffered: string;
        modelSnapshot?: string;
        unitId: string;
        unitSymbolSnapshot: string;
        quantity: string;
        unitRate: string;
        taxPercent?: string;
      }>;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    return this.database.transaction(async (tx) => {
      const repo = createPurchaseOrderRepository(tx);

      // Verify project exists
      const [project] = await tx
        .select({ id: projects.id, companyId: projects.companyId })
        .from(projects)
        .where(and(eq(projects.companyId, principal.companyId), eq(projects.id, input.projectId)));
      if (!project) throw new NotFoundError('Project not found.');

      // Verify vendor exists
      const [vendor] = await tx
        .select({ id: vendors.id, status: vendors.status })
        .from(vendors)
        .where(and(eq(vendors.companyId, principal.companyId), eq(vendors.id, input.vendorId)));
      if (!vendor || vendor.status !== 'active') throw validation('Active vendor record required.');

      let subtotalAcc = new Decimal(0);
      let taxAmountAcc = new Decimal(0);

      const calculatedLines = input.lines.map((line, idx) => {
        const qty = new Decimal(line.quantity);
        const rate = new Decimal(line.unitRate);
        const taxRate = new Decimal(line.taxPercent ?? '0.00').div(100);

        const lineBase = qty.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineTax = lineBase.mul(taxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineTotal = lineBase.plus(lineTax);

        subtotalAcc = subtotalAcc.plus(lineBase);
        taxAmountAcc = taxAmountAcc.plus(lineTax);

        return {
          lineNumber: idx + 1,
          itemId: line.itemId,
          itemCodeSnapshot: line.itemCodeSnapshot,
          itemNameSnapshot: line.itemNameSnapshot,
          specificationSnapshot: line.specificationSnapshot,
          brandOffered: line.brandOffered,
          modelSnapshot: line.modelSnapshot ?? null,
          unitId: line.unitId,
          unitSymbolSnapshot: line.unitSymbolSnapshot,
          quantity: qty.toFixed(4),
          projectAllocationQty: qty.toFixed(4),
          storeReplenishmentQty: '0.0000',
          destinationType: 'warehouse' as const,
          unitRate: rate.toFixed(2),
          taxPercent: line.taxPercent ?? '0.00',
          taxAmount: lineTax.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        };
      });

      const grandTotal = subtotalAcc.plus(taxAmountAcc);
      const now = new Date();
      const poNumber = await repo.allocatePoNumber(principal.companyId, now);

      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          companyId: principal.companyId,
          projectId: input.projectId,
          vendorId: input.vendorId,
          poNumber,
          title: input.title,
          status: 'draft',
          currency: input.currency ?? 'INR',
          paymentTerms: input.paymentTerms,
          deliveryTerms: input.deliveryTerms,
          deliveryLocation: input.deliveryLocation,
          deliveryDueDate: input.deliveryDueDate ?? null,
          billingAddress: input.billingAddress ?? null,
          shippingAddress: input.shippingAddress ?? null,
          notes: input.notes ?? null,
          currentRevisionNumber: 0,
          subtotal: subtotalAcc.toFixed(2),
          taxAmount: taxAmountAcc.toFixed(2),
          grandTotal: grandTotal.toFixed(2),
          createdByUserId: principal.userId,
        })
        .returning();

      const [revision] = await tx
        .insert(purchaseOrderRevisions)
        .values({
          companyId: principal.companyId,
          purchaseOrderId: po!.id,
          revisionNumber: 0,
          status: 'draft',
          subtotal: subtotalAcc.toFixed(2),
          taxAmount: taxAmountAcc.toFixed(2),
          grandTotal: grandTotal.toFixed(2),
          changeReason: null,
          preparedByUserId: principal.userId,
        })
        .returning();

      await tx.insert(purchaseOrderLines).values(
        calculatedLines.map((line) => ({
          ...line,
          companyId: principal.companyId,
          purchaseOrderId: po!.id,
          revisionId: revision!.id,
        })),
      );

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_created_direct',
        targetType: 'purchase_order',
        targetId: po!.id,
        requestId,
        metadata: {
          poNumber,
          vendorId: input.vendorId,
          projectId: input.projectId,
          grandTotal: grandTotal.toFixed(2),
        },
      });

      return { id: po!.id, poNumber };
    });
  }

  async submitRevision(
    principal: AuthenticatedPrincipal,
    poId: string,
    revisionId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    return this.database.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, poId)));
      if (!po) throw new NotFoundError('Purchase order not found.');

      const [revision] = await tx
        .select()
        .from(purchaseOrderRevisions)
        .where(
          and(
            eq(purchaseOrderRevisions.companyId, principal.companyId),
            eq(purchaseOrderRevisions.id, revisionId),
            eq(purchaseOrderRevisions.purchaseOrderId, poId),
          ),
        );
      if (!revision) throw new NotFoundError('Revision not found.');
      if (revision.status !== 'draft') throw validation('Only a draft revision can be submitted for approval.');
      if (revision.rowVersion !== expectedVersion) {
        throw new ConflictError('The revision was updated by another process. Please reload.');
      }

      const now = new Date();
      await tx
        .update(purchaseOrderRevisions)
        .set({
          status: 'submitted',
          submittedAt: now,
          rowVersion: revision.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrderRevisions.id, revisionId));

      await tx
        .update(purchaseOrders)
        .set({
          status: 'pending_approval',
          rowVersion: po.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, poId));

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_revision_submitted',
        targetType: 'purchase_order_revision',
        targetId: revisionId,
        requestId,
        metadata: { poId, poNumber: po.poNumber, revisionNumber: revision.revisionNumber },
      });

      return { id: revisionId, status: 'submitted' };
    });
  }

  async approveRevision(
    principal: AuthenticatedPrincipal,
    poId: string,
    revisionId: string,
    expectedVersion: number,
    notes: string | undefined,
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.approve');

    return this.database.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, poId)));
      if (!po) throw new NotFoundError('Purchase order not found.');

      const [revision] = await tx
        .select()
        .from(purchaseOrderRevisions)
        .where(
          and(
            eq(purchaseOrderRevisions.companyId, principal.companyId),
            eq(purchaseOrderRevisions.id, revisionId),
            eq(purchaseOrderRevisions.purchaseOrderId, poId),
          ),
        );
      if (!revision) throw new NotFoundError('Revision not found.');
      if (revision.status !== 'submitted') {
        throw validation('Only submitted revisions can be approved.');
      }
      if (revision.rowVersion !== expectedVersion) {
        throw new ConflictError('The revision was updated by another process. Please reload.');
      }

      // Check no self-approval (system administrators have audited override)
      const isSysAdmin = isAdministrator(principal);
      if (principal.userId === revision.preparedByUserId && !isSysAdmin) {
        throw new ForbiddenError('You cannot approve your own purchase order revision. An independent approver is required.');
      }

      const now = new Date();
      await tx
        .update(purchaseOrderRevisions)
        .set({
          status: 'approved',
          approvedByUserId: principal.userId,
          approvedAt: now,
          approvalNotes: notes ?? null,
          rowVersion: revision.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrderRevisions.id, revisionId));

      await tx
        .update(purchaseOrders)
        .set({
          status: 'approved',
          rowVersion: po.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, poId));

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_revision_approved',
        targetType: 'purchase_order_revision',
        targetId: revisionId,
        requestId,
        metadata: {
          poId,
          poNumber: po.poNumber,
          revisionNumber: revision.revisionNumber,
          administratorOverride: principal.userId === revision.preparedByUserId && isSysAdmin,
        },
      });

      return { id: revisionId, status: 'approved' };
    });
  }

  async issuePurchaseOrder(
    principal: AuthenticatedPrincipal,
    poId: string,
    revisionId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.issue');

    const repo = createPurchaseOrderRepository(this.database);
    const po = await repo.getById(principal.companyId, principal.userId, poId);
    if (!po) throw new NotFoundError('Purchase order not found.');

    const [revision] = await this.database
      .select()
      .from(purchaseOrderRevisions)
      .where(
        and(
          eq(purchaseOrderRevisions.companyId, principal.companyId),
          eq(purchaseOrderRevisions.id, revisionId),
          eq(purchaseOrderRevisions.purchaseOrderId, poId),
        ),
      );
    if (!revision) throw new NotFoundError('Revision not found.');
    if (revision.status !== 'approved') throw validation('Only an approved revision can be issued.');
    if (revision.rowVersion !== expectedVersion) {
      throw new ConflictError('The revision was updated by another process. Please reload.');
    }

    const lines = await repo.getLinesForRevision(principal.companyId, revisionId);

    // Build PDF outside database locks
    const now = new Date();
    const pdfBytes = await renderPurchaseOrderPdf({
      poNumber: po.poNumber,
      revisionNumber: revision.revisionNumber,
      date: now.toISOString().split('T')[0]!,
      title: po.title,
      currency: po.currency,
      status: 'issued',
      companyName: 'Fire Safety Operations',
      vendor: {
        name: po.vendorName,
        code: po.vendorCode,
      },
      project: po.projectNumber
        ? {
            number: po.projectNumber,
            title: po.projectTitle ?? '',
          }
        : null,
      deliveryTerms: po.deliveryTerms,
      paymentTerms: po.paymentTerms,
      deliveryLocation: po.deliveryLocation,
      deliveryDueDate: po.deliveryDueDate,
      billingAddress: po.billingAddress,
      shippingAddress: po.shippingAddress,
      notes: po.notes,
      subtotal: revision.subtotal,
      taxAmount: revision.taxAmount,
      grandTotal: revision.grandTotal,
      lines: lines.map((l) => ({
        lineNumber: l.lineNumber,
        itemCode: l.itemCode,
        itemName: l.itemName,
        specification: l.specification,
        brandOffered: l.brandOffered,
        model: l.model,
        unitSymbol: l.unitSymbol,
        quantity: l.quantity,
        unitRate: l.unitRate,
        taxPercent: l.taxPercent,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      })),
    });

    const storageName = `${randomUUID()}.pdf`;
    await ensureUploadRoot();
    await writeFile(resolvePrivateFile(storageName), pdfBytes);
    const checksumSha256 = createHash('sha256').update(pdfBytes).digest('hex');

    try {
      return await this.database.transaction(async (tx) => {
        await tx
          .update(purchaseOrderRevisions)
          .set({
            status: 'issued',
            issuedAt: now,
            issuedPdfStorageId: storageName,
            issuedPdfChecksum: checksumSha256,
            rowVersion: revision.rowVersion + 1,
            updatedAt: now,
          })
          .where(eq(purchaseOrderRevisions.id, revisionId));

        await tx
          .update(purchaseOrders)
          .set({
            status: 'issued',
            rowVersion: po.rowVersion + 1,
            updatedAt: now,
          })
          .where(eq(purchaseOrders.id, poId));

        await createAuthRepository(tx).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'procurement.purchase_order_issued',
          targetType: 'purchase_order',
          targetId: poId,
          requestId,
          metadata: {
            poNumber: po.poNumber,
            revisionNumber: revision.revisionNumber,
            storageName,
            checksumSha256,
            grandTotal: revision.grandTotal,
          },
        });

        return { id: poId, status: 'issued', storageName };
      });
    } catch (err) {
      await removePrivateFile(storageName);
      throw err;
    }
  }

  async amendPurchaseOrder(
    principal: AuthenticatedPrincipal,
    poId: string,
    expectedVersion: number,
    changeReason: string,
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.amend');

    return this.database.transaction(async (tx) => {
      const repo = createPurchaseOrderRepository(tx);
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, poId)));
      if (!po) throw new NotFoundError('Purchase order not found.');
      if (!['issued', 'partially_delivered'].includes(po.status)) {
        throw validation('Only an issued or partially delivered purchase order can be amended.');
      }
      if (po.rowVersion !== expectedVersion) {
        throw new ConflictError('The purchase order was updated by another process. Please reload.');
      }

      // Check if there is already an active draft or submitted revision
      const [activeRev] = await tx
        .select()
        .from(purchaseOrderRevisions)
        .where(
          and(
            eq(purchaseOrderRevisions.companyId, principal.companyId),
            eq(purchaseOrderRevisions.purchaseOrderId, poId),
            inArray(purchaseOrderRevisions.status, ['draft', 'submitted', 'approved']),
          ),
        );
      if (activeRev) {
        throw new ConflictError(`An active revision (R${activeRev.revisionNumber}) is already pending.`);
      }

      // Find latest issued revision to copy lines from
      const revisions = await repo.getRevisions(principal.companyId, poId);
      const latestIssued = revisions.find((r) => r.status === 'issued');
      if (!latestIssued) throw validation('No issued revision found to amend.');

      const previousLines = await repo.getLinesForRevision(principal.companyId, latestIssued.id);
      const nextRevNum = po.currentRevisionNumber + 1;
      const now = new Date();

      const [newRevision] = await tx
        .insert(purchaseOrderRevisions)
        .values({
          companyId: principal.companyId,
          purchaseOrderId: po.id,
          revisionNumber: nextRevNum,
          status: 'draft',
          subtotal: po.subtotal,
          taxAmount: po.taxAmount,
          grandTotal: po.grandTotal,
          changeReason,
          preparedByUserId: principal.userId,
        })
        .returning();

      await tx.insert(purchaseOrderLines).values(
        previousLines.map((l) => ({
          companyId: principal.companyId,
          purchaseOrderId: po.id,
          revisionId: newRevision!.id,
          lineNumber: l.lineNumber,
          itemId: l.itemId,
          brandOfferingId: l.brandOfferingId,
          quotationLineId: l.quotationLineId,
          srrId: l.srrId,
          itemCodeSnapshot: l.itemCode,
          itemNameSnapshot: l.itemName,
          specificationSnapshot: l.specification,
          brandOffered: l.brandOffered,
          modelSnapshot: l.model,
          unitId: l.unitId,
          unitSymbolSnapshot: l.unitSymbol,
          quantity: l.quantity,
          projectAllocationQty: l.projectAllocationQty,
          storeReplenishmentQty: l.storeReplenishmentQty,
          allocatedReceivedQty: l.allocatedReceivedQty,
          storeReceivedQty: l.storeReceivedQty,
          destinationType: l.destinationType,
          unitRate: l.unitRate,
          taxPercent: l.taxPercent,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
          receivedQuantity: l.receivedQuantity,
          acceptedQuantity: l.acceptedQuantity,
          rejectedQuantity: l.rejectedQuantity,
          requisitionLineId: l.requisitionLineId,
        })),
      );

      await tx
        .update(purchaseOrders)
        .set({
          currentRevisionNumber: nextRevNum,
          rowVersion: po.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, poId));

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_amendment_created',
        targetType: 'purchase_order',
        targetId: poId,
        requestId,
        metadata: {
          poNumber: po.poNumber,
          newRevisionNumber: nextRevNum,
          changeReason,
        },
      });

      return { id: newRevision!.id, revisionNumber: nextRevNum };
    });
  }

  async cancelPurchaseOrder(
    principal: AuthenticatedPrincipal,
    poId: string,
    expectedVersion: number,
    cancellationReason: string,
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    return this.database.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, poId)));
      if (!po) throw new NotFoundError('Purchase order not found.');
      if (po.rowVersion !== expectedVersion) {
        throw new ConflictError('The purchase order was updated by another process. Please reload.');
      }
      if (['delivered', 'short_closed', 'closed', 'cancelled'].includes(po.status)) {
        throw validation(`Cannot cancel a purchase order with status "${po.status}".`);
      }

      // Check if any goods receipts have been accepted
      const lines = await tx
        .select({ acceptedQuantity: purchaseOrderLines.acceptedQuantity })
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.companyId, principal.companyId),
            eq(purchaseOrderLines.purchaseOrderId, poId),
          ),
        );
      const hasAccepted = lines.some((l) => new Decimal(l.acceptedQuantity).gt(0));
      if (hasAccepted) {
        throw validation('Cannot cancel a purchase order with accepted deliveries. Short-close or reverse deliveries first.');
      }

      const now = new Date();
      await tx
        .update(purchaseOrders)
        .set({
          status: 'cancelled',
          rowVersion: po.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, poId));

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_cancelled',
        targetType: 'purchase_order',
        targetId: poId,
        requestId,
        metadata: { poNumber: po.poNumber, cancellationReason },
      });

      return { id: poId, status: 'cancelled' };
    });
  }

  async getPoPdfFile(principal: AuthenticatedPrincipal, poId: string) {
    this.assert(principal, 'procurement.purchase_order.read');
    const repo = createPurchaseOrderRepository(this.database);
    const po = await repo.getById(principal.companyId, principal.userId, poId);
    if (!po) throw new NotFoundError('Purchase order not found or not in your scope.');
    const revisions = await repo.getRevisions(principal.companyId, poId);
    const issuedRevision = revisions.find((r) => Boolean(r.issuedPdfStorageId));
    if (!issuedRevision?.issuedPdfStorageId) {
      throw new NotFoundError('No issued Purchase Order PDF is available yet.');
    }
    const absolutePath = resolvePrivateFile(issuedRevision.issuedPdfStorageId);
    if (!existsSync(absolutePath)) {
      throw new NotFoundError('Issued Purchase Order PDF file is missing from storage.');
    }
    return {
      absolutePath,
      fileName: `${po.poNumber}-R${issuedRevision.revisionNumber}.pdf`,
    };
  }

  async shortClosePurchaseOrder(
    principal: AuthenticatedPrincipal,
    poId: string,
    input: { expectedVersion: number; reason: string },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.approve');

    return this.database.transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, poId)));
      if (!po) throw new NotFoundError('Purchase order not found.');
      if (po.rowVersion !== input.expectedVersion) {
        throw new ConflictError('The purchase order was updated by another process. Please reload.');
      }
      if (!['issued', 'partially_delivered'].includes(po.status)) {
        throw validation(`Only issued or partially delivered purchase orders can be short-closed (current status: ${po.status}).`);
      }

      const lines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.companyId, principal.companyId),
            eq(purchaseOrderLines.purchaseOrderId, poId),
          ),
        );

      const hasOpenQty = lines.some((l) =>
        new Decimal(l.acceptedQuantity).lt(new Decimal(l.quantity)),
      );
      if (!hasOpenQty) {
        throw validation('All lines on this purchase order are already fully accepted.');
      }

      const now = new Date();
      for (const line of lines) {
        const ordered = new Decimal(line.quantity);
        const received = new Decimal(line.receivedQuantity);
        const shortClosed = Decimal.max(new Decimal(0), ordered.minus(received));
        await tx
          .update(purchaseOrderLines)
          .set({ shortClosedQuantity: shortClosed.toFixed(4) })
          .where(eq(purchaseOrderLines.id, line.id));
      }

      await tx
        .update(purchaseOrders)
        .set({
          status: 'short_closed',
          shortClosedAt: now,
          shortClosedByUserId: principal.userId,
          shortCloseReason: input.reason,
          rowVersion: po.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, poId));

      // Re-evaluate Min/Max low-stock alerts immediately now that incoming open PO qty drops
      const itemIds = Array.from(new Set(lines.map((l) => l.itemId)));
      if (itemIds.length > 0 && typeof (tx as { select?: unknown }).select === 'function') {
        const thresholds = await tx
          .select({
            warehouseId: warehouseItemThresholds.warehouseId,
            itemId: warehouseItemThresholds.itemId,
            brandOfferingId: warehouseItemThresholds.brandOfferingId,
          })
          .from(warehouseItemThresholds)
          .where(
            and(
              eq(warehouseItemThresholds.companyId, principal.companyId),
              inArray(warehouseItemThresholds.itemId, itemIds),
            ),
          );
        if (thresholds.length > 0) {
          const invSvc = new InventoryService(new InventoryRepository(tx));
          const byWarehouse = new Map<string, Array<{ itemId: string; brandOfferingId: string | null }>>();
          for (const t of thresholds) {
            const list = byWarehouse.get(t.warehouseId) ?? [];
            list.push({ itemId: t.itemId, brandOfferingId: t.brandOfferingId });
            byWarehouse.set(t.warehouseId, list);
          }
          for (const [warehouseId, pairs] of byWarehouse) {
            await invSvc.evaluateLowStockThresholds(tx, principal.companyId, warehouseId, pairs);
          }
        }
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.purchase_order_short_closed',
        targetType: 'purchase_order',
        targetId: poId,
        requestId,
        metadata: { poNumber: po.poNumber, reason: input.reason },
      });

      return { id: poId, status: 'short_closed', shortCloseReason: input.reason };
    });
  }

  async listDispatches(principal: AuthenticatedPrincipal, poId: string) {
    this.assert(principal, 'procurement.purchase_order.read');
    const repo = createPurchaseOrderRepository(this.database);
    const po = await repo.getById(principal.companyId, principal.userId, poId);
    if (!po) throw new NotFoundError('Purchase order not found or not in your scope.');
    return repo.getDispatchesForPo(principal.companyId, poId);
  }

  async dispatchToVendor(
    principal: AuthenticatedPrincipal,
    poId: string,
    input: {
      channel: 'email' | 'whatsapp_msg91' | 'whatsapp_manual';
      recipientName: string;
      recipientContact: string;
      customMessage?: string;
    },
    requestId: string,
  ) {
    if (principal.mustChangePassword) {
      throw new ForbiddenError('Change the temporary password before using this feature.');
    }
    if (
      !isAdministrator(principal) &&
      !hasPermission(principal, 'procurement.purchase_order.create') &&
      !hasPermission(principal, 'procurement.purchase_order.issue') &&
      !hasPermission(principal, 'procurement.purchase_order.approve')
    ) {
      throw new ForbiddenError('Purchase permissions are required to dispatch POs to vendors.');
    }

    const repo = createPurchaseOrderRepository(this.database);
    const po = await repo.getById(principal.companyId, principal.userId, poId);
    if (!po) throw new NotFoundError('Purchase order not found or not in your scope.');
    if (po.status !== 'issued') {
      throw validation(`Only issued Purchase Orders can be dispatched to vendors (current status: ${po.status}).`);
    }
    const revisions = await repo.getRevisions(principal.companyId, poId);
    const issuedRevision = revisions.find((r) => r.status === 'issued' && Boolean(r.issuedPdfStorageId));
    if (!issuedRevision?.issuedPdfStorageId) {
      throw validation('Issued Purchase Order PDF snapshot is required before dispatching to vendor.');
    }

    const now = new Date();
    let finalChannel = input.channel;
    let status: 'queued' | 'sent' | 'failed' | 'manual_opened' = 'queued';
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;
    let sentAt: Date | null = null;
    let manualWhatsAppUrl: string | undefined;
    let fallbackToManual = false;

    const buildManualWaUrl = (phone: string) => {
      const cleanPhone = phone.replace(/\D/g, '');
      const text = encodeURIComponent(
        input.customMessage?.trim() ||
          `Hello ${input.recipientName}, please find Purchase Order ${po.poNumber} (${po.title}, Total: ${po.currency} ${po.grandTotal}). Kindly acknowledge receipt and confirm delivery schedule.`,
      );
      return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    };

    if (input.channel === 'email') {
      const pdfBuffer = await readFile(resolvePrivateFile(issuedRevision.issuedPdfStorageId));
      try {
        await deliverMail(`po-dispatch-${poId}-${randomUUID().slice(0, 8)}`, {
          to: input.recipientContact,
          subject: `Purchase Order ${po.poNumber} — ${po.title}`,
          text:
            input.customMessage?.trim() ||
            `Dear ${input.recipientName},\n\nPlease find attached Purchase Order ${po.poNumber} (Rev R${issuedRevision.revisionNumber}) for ${po.title}.\nGrand Total: ${po.currency} ${po.grandTotal}\nDelivery Location: ${po.deliveryLocation}\n\nRegards,\nProcurement Team`,
          attachments: [
            {
              filename: `${po.poNumber}-R${issuedRevision.revisionNumber}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        });
        status = env.MAIL_DELIVERY_MODE === 'smtp' ? 'sent' : 'queued';
        providerMessageId = env.MAIL_DELIVERY_MODE === 'local-file' ? 'local-file-mailbox' : 'smtp-accepted';
        sentAt = now;
      } catch (err) {
        status = 'failed';
        errorMessage = err instanceof Error ? err.message : 'Email delivery failed';
      }
    } else if (input.channel === 'whatsapp_msg91') {
      const waResult = await msg91WhatsAppService.sendPurchaseOrderNotice({
        to: input.recipientContact,
        contactName: input.recipientName,
        poNumber: po.poNumber,
        title: po.title,
        customMessage: input.customMessage,
      });
      if (waResult.success) {
        status = 'sent';
        providerMessageId = waResult.messageId ?? null;
        sentAt = now;
      } else if (waResult.status === 'unconfigured') {
        finalChannel = 'whatsapp_manual';
        status = 'manual_opened';
        fallbackToManual = true;
        manualWhatsAppUrl = buildManualWaUrl(input.recipientContact);
        errorMessage = waResult.error ?? 'MSG91 is not configured; opened manual WhatsApp fallback.';
        sentAt = now;
      } else {
        status = 'failed';
        errorMessage = waResult.error ?? 'MSG91 WhatsApp delivery failed';
      }
    } else {
      status = 'manual_opened';
      manualWhatsAppUrl = buildManualWaUrl(input.recipientContact);
      sentAt = now;
    }

    const [dispatch] = await this.database
      .insert(purchaseOrderDispatches)
      .values({
        companyId: principal.companyId,
        purchaseOrderId: poId,
        revisionId: issuedRevision.id,
        channel: finalChannel,
        recipientName: input.recipientName,
        recipientContact: input.recipientContact,
        status,
        providerMessageId,
        sentByUserId: principal.userId,
        sentAt,
        errorMessage,
      })
      .returning();

    await createAuthRepository(this.database).appendAuditEvent({
      companyId: principal.companyId,
      actorUserId: principal.userId,
      action: 'procurement.purchase_order_dispatched_to_vendor',
      targetType: 'purchase_order_dispatch',
      targetId: dispatch!.id,
      requestId,
      metadata: {
        poId,
        poNumber: po.poNumber,
        channel: finalChannel,
        status,
        recipientContact: input.recipientContact,
        fallbackToManual,
      },
    });

    return {
      dispatch,
      manualWhatsAppUrl,
      fallbackToManual,
    };
  }

  async createGoodsReceipt(
    principal: AuthenticatedPrincipal,
    poId: string,
    input: {
      vendorChallanNumber: string;
      vendorChallanDate: string;
      deliveryLocation: string;
      vehicleNumber?: string;
      transporterName?: string;
      notes?: string;
      excessApprovalReason?: string;
      lines: Array<{
        purchaseOrderLineId: string;
        deliveredQuantity: string;
        acceptedQuantity?: string;
        rejectedQuantity?: string;
        rejectionReason?: string;
        inspectionNotes?: string;
        excessApprovalReason?: string;
      }>;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.goods_receipt.manage');

    return this.database.transaction(async (tx) => {
      const repo = createPurchaseOrderRepository(tx);
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, poId)));
      if (!po) throw new NotFoundError('Purchase order not found.');
      if (!['issued', 'partially_delivered'].includes(po.status)) {
        throw validation(`Goods receipts can only be recorded against issued purchase orders (current status: ${po.status}).`);
      }

      const poLines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.companyId, principal.companyId),
            eq(purchaseOrderLines.purchaseOrderId, poId),
          ),
        );

      const now = new Date();
      const grnNumber = await repo.allocateGrnNumber(principal.companyId, now);
      const isSysAdmin = isAdministrator(principal);
      const hasApprovePerm = hasPermission(principal, 'procurement.purchase_order.approve');

      let totalDeliveredAcc = new Decimal(0);
      let totalAcceptedAcc = new Decimal(0);
      let anyExcessApproved = false;

      // Validate quantities against PO line balances
      const processedLines = input.lines.map((inputLine, idx) => {
        const poLine = poLines.find((pl) => pl.id === inputLine.purchaseOrderLineId);
        if (!poLine) throw validation(`PO Line not found: ${inputLine.purchaseOrderLineId}`);

        const ordered = new Decimal(poLine.quantity);
        const alreadyReceived = new Decimal(poLine.receivedQuantity);
        const delivered = new Decimal(inputLine.deliveredQuantity);
        const remainingToReceive = Decimal.max(new Decimal(0), ordered.minus(alreadyReceived));

        let excessQty = new Decimal(0);
        let excessReason: string | null = null;
        let excessApproverId: string | null = null;

        if (delivered.gt(remainingToReceive)) {
          excessQty = delivered.minus(remainingToReceive);
          const candidateReason = inputLine.excessApprovalReason?.trim() || input.excessApprovalReason?.trim();
          if (!candidateReason) {
            throw new AppError(
              'OVERDELIVERY_REQUIRES_APPROVAL',
              `Delivered quantity (${delivered.toFixed(4)}) exceeds remaining PO balance (${remainingToReceive.toFixed(4)}) for line #${poLine.lineNumber}. Provide an excess approval reason with Purchase Manager authorization.`,
              422,
            );
          }
          if (!hasApprovePerm && !isSysAdmin) {
            throw new ForbiddenError('Overdelivery excess quantities require Purchase Manager approval.');
          }
          if (!isSysAdmin && po.createdByUserId === principal.userId) {
            throw new ForbiddenError('You cannot self-approve overdelivery on a Purchase Order you created.');
          }
          excessReason = candidateReason;
          excessApproverId = principal.userId;
          anyExcessApproved = true;
        }

        const accepted = inputLine.acceptedQuantity ? new Decimal(inputLine.acceptedQuantity) : new Decimal(0);
        const rejected = inputLine.rejectedQuantity ? new Decimal(inputLine.rejectedQuantity) : new Decimal(0);

        if (accepted.plus(rejected).gt(delivered)) {
          throw validation(`Accepted + rejected quantities cannot exceed delivered quantity for line #${poLine.lineNumber}.`);
        }
        if (rejected.gt(0) && !inputLine.rejectionReason) {
          throw validation(`Rejection reason is mandatory when rejected quantity > 0 for line #${poLine.lineNumber}.`);
        }

        totalDeliveredAcc = totalDeliveredAcc.plus(delivered);
        totalAcceptedAcc = totalAcceptedAcc.plus(accepted);

        return {
          lineNumber: idx + 1,
          purchaseOrderLineId: poLine.id,
          deliveredQuantity: delivered.toFixed(4),
          acceptedQuantity: accepted.toFixed(4),
          rejectedQuantity: rejected.toFixed(4),
          rejectionReason: inputLine.rejectionReason ?? null,
          inspectionNotes: inputLine.inspectionNotes ?? null,
          inspectedByUserId: accepted.plus(rejected).gt(0) ? principal.userId : null,
          inspectedAt: accepted.plus(rejected).gt(0) ? now : null,
          excessQuantity: excessQty.toFixed(4),
          excessApprovalReason: excessReason,
          excessApprovedByUserId: excessApproverId,
          // for updating po line
          deliveredDelta: delivered,
          acceptedDelta: accepted,
          rejectedDelta: rejected,
          currentPoLine: poLine,
        };
      });

      const initialStatus =
        totalAcceptedAcc.gt(0) && totalAcceptedAcc.gte(totalDeliveredAcc)
          ? 'accepted'
          : totalAcceptedAcc.gt(0)
            ? 'partially_rejected'
            : 'draft';

      const [grn] = await tx
        .insert(goodsReceipts)
        .values({
          companyId: principal.companyId,
          purchaseOrderId: po.id,
          grnNumber,
          vendorChallanNumber: input.vendorChallanNumber,
          vendorChallanDate: input.vendorChallanDate,
          receivedAt: now,
          receivedByUserId: principal.userId,
          status: initialStatus,
          deliveryLocation: input.deliveryLocation,
          vehicleNumber: input.vehicleNumber ?? null,
          transporterName: input.transporterName ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      for (const line of processedLines) {
        await tx.insert(goodsReceiptLines).values({
          companyId: principal.companyId,
          goodsReceiptId: grn!.id,
          purchaseOrderLineId: line.purchaseOrderLineId,
          lineNumber: line.lineNumber,
          deliveredQuantity: line.deliveredQuantity,
          acceptedQuantity: line.acceptedQuantity,
          rejectedQuantity: line.rejectedQuantity,
          rejectionReason: line.rejectionReason,
          inspectionNotes: line.inspectionNotes,
          inspectedByUserId: line.inspectedByUserId,
          inspectedAt: line.inspectedAt,
          excessQuantity: line.excessQuantity,
          excessApprovalReason: line.excessApprovalReason,
          excessApprovedByUserId: line.excessApprovedByUserId,
        });

        // Update PO line received/accepted/rejected quantities
        const newReceived = new Decimal(line.currentPoLine.receivedQuantity).plus(line.deliveredDelta);
        const newAccepted = new Decimal(line.currentPoLine.acceptedQuantity).plus(line.acceptedDelta);
        const newRejected = new Decimal(line.currentPoLine.rejectedQuantity).plus(line.rejectedDelta);

        await tx
          .update(purchaseOrderLines)
          .set({
            receivedQuantity: newReceived.toFixed(4),
            acceptedQuantity: newAccepted.toFixed(4),
            rejectedQuantity: newRejected.toFixed(4),
          })
          .where(eq(purchaseOrderLines.id, line.purchaseOrderLineId));
      }

      // Re-evaluate PO status
      const updatedPoLines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.companyId, principal.companyId),
            eq(purchaseOrderLines.purchaseOrderId, po.id),
          ),
        );

      const allFullyAccepted = updatedPoLines.every((pl) =>
        new Decimal(pl.acceptedQuantity).gte(new Decimal(pl.quantity)),
      );
      const nextPoStatus = allFullyAccepted ? 'delivered' : 'partially_delivered';

      await tx
        .update(purchaseOrders)
        .set({
          status: nextPoStatus,
          rowVersion: po.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, po.id));

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: anyExcessApproved ? 'procurement.grn_overdelivery_approved' : 'procurement.goods_receipt_created',
        targetType: 'goods_receipt',
        targetId: grn!.id,
        requestId,
        metadata: {
          poId: po.id,
          poNumber: po.poNumber,
          grnNumber,
          vendorChallanNumber: input.vendorChallanNumber,
          totalDelivered: totalDeliveredAcc.toFixed(4),
          nextPoStatus,
          anyExcessApproved,
          administratorOverride: anyExcessApproved && isSysAdmin,
          excessLines: processedLines
            .filter((l) => new Decimal(l.excessQuantity).gt(0))
            .map((l) => ({
              poLineId: l.purchaseOrderLineId,
              excessQuantity: l.excessQuantity,
              reason: l.excessApprovalReason,
            })),
        },
      });

      return { id: grn!.id, grnNumber, status: initialStatus };
    });
  }

  async inspectGoodsReceipt(
    principal: AuthenticatedPrincipal,
    grnId: string,
    expectedVersion: number,
    inspectionLines: Array<{
      goodsReceiptLineId: string;
      acceptedQuantity: string;
      rejectedQuantity?: string;
      rejectionReason?: string;
      inspectionNotes?: string;
      excessApprovalReason?: string;
    }>,
    requestId: string,
    batchExcessApprovalReason?: string,
  ) {
    this.assert(principal, 'procurement.goods_receipt.inspect');

    return this.database.transaction(async (tx) => {
      const [grn] = await tx
        .select()
        .from(goodsReceipts)
        .where(and(eq(goodsReceipts.companyId, principal.companyId), eq(goodsReceipts.id, grnId)));
      if (!grn) throw new NotFoundError('Goods receipt not found.');
      if (grn.rowVersion !== expectedVersion) {
        throw new ConflictError('The goods receipt was updated by another process. Please reload.');
      }
      if (grn.status === 'accepted') {
        throw validation('This goods receipt has already been fully inspected and accepted.');
      }

      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, grn.purchaseOrderId));

      const existingGrnLines = await tx
        .select()
        .from(goodsReceiptLines)
        .where(
          and(
            eq(goodsReceiptLines.companyId, principal.companyId),
            eq(goodsReceiptLines.goodsReceiptId, grnId),
          ),
        );

      const now = new Date();
      const isSysAdmin = isAdministrator(principal);
      const hasApprovePerm = hasPermission(principal, 'procurement.purchase_order.approve');
      let anyRejected = false;
      let allAccepted = true;

      for (const item of inspectionLines) {
        const line = existingGrnLines.find((l) => l.id === item.goodsReceiptLineId);
        if (!line) throw validation(`GRN line not found: ${item.goodsReceiptLineId}`);

        const delivered = new Decimal(line.deliveredQuantity);
        const accepted = new Decimal(item.acceptedQuantity);
        const rejected = new Decimal(item.rejectedQuantity ?? '0.0000');

        if (accepted.plus(rejected).gt(delivered)) {
          throw validation(`Accepted + rejected quantities cannot exceed delivered quantity (${delivered}) for line #${line.lineNumber}.`);
        }
        if (rejected.gt(0)) {
          anyRejected = true;
          if (!item.rejectionReason) throw validation(`Rejection reason is mandatory for line #${line.lineNumber}.`);
        }
        if (!accepted.gte(delivered)) {
          allAccepted = false;
        }

        const existingExcess = new Decimal(line.excessQuantity);
        let excessReason = line.excessApprovalReason;
        let excessApprovedBy = line.excessApprovedByUserId;
        const candidateReason = item.excessApprovalReason?.trim() || batchExcessApprovalReason?.trim();
        if (existingExcess.gt(0) && candidateReason) {
          if (!hasApprovePerm && !isSysAdmin) {
            throw new ForbiddenError('Overdelivery approval requires Purchase Manager privileges.');
          }
          if (!isSysAdmin && (grn.receivedByUserId === principal.userId || po?.createdByUserId === principal.userId)) {
            throw new ForbiddenError('You cannot self-approve overdelivery on a PO or GRN you created.');
          }
          excessReason = candidateReason;
          excessApprovedBy = principal.userId;
        }

        // Calculate delta adjustments for PO line
        const prevAccepted = new Decimal(line.acceptedQuantity);
        const prevRejected = new Decimal(line.rejectedQuantity);
        const deltaAccepted = accepted.minus(prevAccepted);
        const deltaRejected = rejected.minus(prevRejected);

        await tx
          .update(goodsReceiptLines)
          .set({
            acceptedQuantity: accepted.toFixed(4),
            rejectedQuantity: rejected.toFixed(4),
            rejectionReason: item.rejectionReason ?? null,
            inspectionNotes: item.inspectionNotes ?? null,
            inspectedByUserId: principal.userId,
            inspectedAt: now,
            excessApprovalReason: excessReason,
            excessApprovedByUserId: excessApprovedBy,
          })
          .where(eq(goodsReceiptLines.id, line.id));

        // Adjust PO line accepted and rejected quantities
        const [poLine] = await tx
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.id, line.purchaseOrderLineId));

        if (poLine) {
          const newPoAccepted = new Decimal(poLine.acceptedQuantity).plus(deltaAccepted);
          const newPoRejected = new Decimal(poLine.rejectedQuantity).plus(deltaRejected);
          await tx
            .update(purchaseOrderLines)
            .set({
              acceptedQuantity: newPoAccepted.toFixed(4),
              rejectedQuantity: newPoRejected.toFixed(4),
            })
            .where(eq(purchaseOrderLines.id, poLine.id));
        }
      }

      const nextGrnStatus = allAccepted
        ? 'accepted'
        : anyRejected
          ? 'partially_rejected'
          : 'inspected';

      await tx
        .update(goodsReceipts)
        .set({
          status: nextGrnStatus,
          rowVersion: grn.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(goodsReceipts.id, grnId));

      if (po) {
        const poLines = await tx
          .select()
          .from(purchaseOrderLines)
          .where(
            and(
              eq(purchaseOrderLines.companyId, principal.companyId),
              eq(purchaseOrderLines.purchaseOrderId, po.id),
            ),
          );

        const allFullyAccepted = poLines.every((pl) =>
          new Decimal(pl.acceptedQuantity).gte(new Decimal(pl.quantity)),
        );
        const nextPoStatus = allFullyAccepted ? 'delivered' : 'partially_delivered';

        if (po.status !== nextPoStatus) {
          await tx
            .update(purchaseOrders)
            .set({
              status: nextPoStatus,
              rowVersion: po.rowVersion + 1,
              updatedAt: now,
            })
            .where(eq(purchaseOrders.id, po.id));
        }
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.goods_receipt_inspected',
        targetType: 'goods_receipt',
        targetId: grnId,
        requestId,
        metadata: { grnNumber: grn.grnNumber, nextGrnStatus },
      });

      return { id: grnId, status: nextGrnStatus };
    });
  }

  async createSupplierReturn(
    principal: AuthenticatedPrincipal,
    input: {
      purchaseOrderId: string;
      goodsReceiptId: string;
      resolutionType: 'replacement' | 'credit_note' | 'deduction';
      reason: string;
      lines: Array<{
        goodsReceiptLineId: string;
        returnQuantity: string;
        remarks?: string;
      }>;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    return this.database.transaction(async (tx) => {
      const repo = createPurchaseOrderRepository(tx);
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, principal.companyId), eq(purchaseOrders.id, input.purchaseOrderId)));
      if (!po) throw new NotFoundError('Purchase order not found.');

      const [grn] = await tx
        .select()
        .from(goodsReceipts)
        .where(
          and(
            eq(goodsReceipts.companyId, principal.companyId),
            eq(goodsReceipts.id, input.goodsReceiptId),
            eq(goodsReceipts.purchaseOrderId, po.id),
          ),
        );
      if (!grn) throw new NotFoundError('Goods receipt not found for this Purchase Order.');

      const grnLines = await tx
        .select()
        .from(goodsReceiptLines)
        .where(
          and(
            eq(goodsReceiptLines.companyId, principal.companyId),
            eq(goodsReceiptLines.goodsReceiptId, grn.id),
          ),
        );
      const poLines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(
          and(
            eq(purchaseOrderLines.companyId, principal.companyId),
            eq(purchaseOrderLines.purchaseOrderId, po.id),
          ),
        );

      const grnLineIds = input.lines.map((l) => l.goodsReceiptLineId);
      const priorReturns = await tx
        .select({
          goodsReceiptLineId: supplierReturnLines.goodsReceiptLineId,
          returnQuantity: supplierReturnLines.returnQuantity,
        })
        .from(supplierReturnLines)
        .where(
          and(
            eq(supplierReturnLines.companyId, principal.companyId),
            inArray(supplierReturnLines.goodsReceiptLineId, grnLineIds),
          ),
        );

      const resolvedLines = input.lines.map((item) => {
        const grnLine = grnLines.find((l) => l.id === item.goodsReceiptLineId);
        if (!grnLine) throw validation(`GRN line ${item.goodsReceiptLineId} does not belong to GRN ${grn.grnNumber}.`);
        const poLine = poLines.find((pl) => pl.id === grnLine.purchaseOrderLineId);
        if (!poLine) throw validation('Matching PO line not found for GRN line.');

        const rejectedQty = new Decimal(grnLine.rejectedQuantity);
        const alreadyReturned = priorReturns
          .filter((pr) => pr.goodsReceiptLineId === grnLine.id)
          .reduce((sum, pr) => sum.plus(pr.returnQuantity), new Decimal(0));
        const returnable = Decimal.max(new Decimal(0), rejectedQty.minus(alreadyReturned));
        const requested = new Decimal(item.returnQuantity);
        if (requested.gt(returnable)) {
          throw validation(
            `Return quantity (${requested.toFixed(4)}) exceeds returnable rejected quantity (${returnable.toFixed(4)}) on GRN line #${grnLine.lineNumber}.`,
          );
        }

        return {
          goodsReceiptLineId: grnLine.id,
          purchaseOrderLineId: poLine.id,
          itemId: poLine.itemId,
          brandOfferingId: poLine.brandOfferingId,
          returnQuantity: requested.toFixed(4),
          remarks: item.remarks ?? null,
        };
      });

      const now = new Date();
      const rtvNumber = await repo.allocateRtvNumber(principal.companyId, now);

      const [rtv] = await tx
        .insert(supplierReturns)
        .values({
          companyId: principal.companyId,
          rtvNumber,
          purchaseOrderId: po.id,
          goodsReceiptId: grn.id,
          vendorId: po.vendorId,
          projectId: po.projectId,
          status: 'draft',
          resolutionType: input.resolutionType,
          reason: input.reason,
          createdByUserId: principal.userId,
        })
        .returning();

      await tx.insert(supplierReturnLines).values(
        resolvedLines.map((l) => ({
          companyId: principal.companyId,
          supplierReturnId: rtv!.id,
          goodsReceiptLineId: l.goodsReceiptLineId,
          purchaseOrderLineId: l.purchaseOrderLineId,
          itemId: l.itemId,
          brandOfferingId: l.brandOfferingId,
          returnQuantity: l.returnQuantity,
          remarks: l.remarks,
        })),
      );

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.supplier_return_created',
        targetType: 'supplier_return',
        targetId: rtv!.id,
        requestId,
        metadata: {
          rtvNumber,
          poId: po.id,
          grnId: grn.id,
          resolutionType: input.resolutionType,
          lineCount: resolvedLines.length,
        },
      });

      return rtv!;
    });
  }

  async dispatchSupplierReturn(
    principal: AuthenticatedPrincipal,
    rtvId: string,
    input: {
      expectedVersion: number;
      transporterName?: string;
      vehicleNumber?: string;
      dispatchDate: string;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    const [rtvRow] = await this.database
      .select()
      .from(supplierReturns)
      .where(and(eq(supplierReturns.companyId, principal.companyId), eq(supplierReturns.id, rtvId)));
    if (!rtvRow) throw new NotFoundError('Supplier return (RTV) not found.');
    if (rtvRow.rowVersion !== input.expectedVersion) {
      throw new ConflictError('This supplier return was modified by another process. Reload and try again.');
    }
    if (rtvRow.status !== 'draft') {
      throw validation(`Only draft supplier returns can be dispatched (current status: ${rtvRow.status}).`);
    }

    const [poRow, grnRow, vendorRow, projectRow, companyRow, rtvLines] = await Promise.all([
      this.database.select().from(purchaseOrders).where(eq(purchaseOrders.id, rtvRow.purchaseOrderId)).limit(1).then((r) => r[0]),
      this.database.select().from(goodsReceipts).where(eq(goodsReceipts.id, rtvRow.goodsReceiptId)).limit(1).then((r) => r[0]),
      this.database.select().from(vendors).where(eq(vendors.id, rtvRow.vendorId)).limit(1).then((r) => r[0]),
      rtvRow.projectId
        ? this.database.select().from(projects).where(eq(projects.id, rtvRow.projectId)).limit(1).then((r) => r[0])
        : Promise.resolve(undefined),
      this.database.select({ name: companies.name }).from(companies).where(eq(companies.id, principal.companyId)).limit(1).then((r) => r[0]),
      this.database
        .select({
          id: supplierReturnLines.id,
          itemCode: purchaseOrderLines.itemCodeSnapshot,
          itemName: purchaseOrderLines.itemNameSnapshot,
          brandOffered: purchaseOrderLines.brandOffered,
          unitSymbol: purchaseOrderLines.unitSymbolSnapshot,
          returnQuantity: supplierReturnLines.returnQuantity,
          remarks: supplierReturnLines.remarks,
        })
        .from(supplierReturnLines)
        .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.id, supplierReturnLines.purchaseOrderLineId))
        .where(and(eq(supplierReturnLines.companyId, principal.companyId), eq(supplierReturnLines.supplierReturnId, rtvId))),
    ]);

    const pdfBytes = await renderSupplierReturnPdf({
      rtvNumber: rtvRow.rtvNumber,
      poNumber: poRow?.poNumber ?? 'PO',
      grnNumber: grnRow?.grnNumber ?? 'GRN',
      resolutionType: rtvRow.resolutionType,
      dispatchDate: input.dispatchDate,
      companyName: companyRow?.name ?? 'Fire Safety Operations',
      vendor: {
        name: vendorRow?.displayName ?? 'Vendor',
        code: vendorRow?.code ?? '',
      },
      project: projectRow ? { number: projectRow.projectNumber, title: projectRow.title } : null,
      transporterName: input.transporterName?.trim() || null,
      vehicleNumber: input.vehicleNumber?.trim() || null,
      reason: rtvRow.reason,
      lines: rtvLines.map((l, idx) => ({
        lineNumber: idx + 1,
        itemCode: l.itemCode,
        itemName: l.itemName,
        brandOffered: l.brandOffered,
        unitSymbol: l.unitSymbol,
        returnQuantity: l.returnQuantity,
        remarks: l.remarks,
      })),
    });

    const storageName = `${randomUUID()}.pdf`;
    await ensureUploadRoot();
    await writeFile(resolvePrivateFile(storageName), pdfBytes);
    const checksumSha256 = createHash('sha256').update(pdfBytes).digest('hex');

    try {
      return await this.database.transaction(async (tx) => {
        const now = new Date();
        const [updated] = await tx
          .update(supplierReturns)
          .set({
            status: 'dispatched',
            transporterName: input.transporterName?.trim() || null,
            vehicleNumber: input.vehicleNumber?.trim() || null,
            dispatchDate: input.dispatchDate,
            pdfStorageName: storageName,
            pdfChecksumSha256: checksumSha256,
            rowVersion: rtvRow.rowVersion + 1,
            updatedAt: now,
          })
          .where(and(eq(supplierReturns.id, rtvId), eq(supplierReturns.rowVersion, input.expectedVersion)))
          .returning();

        if (!updated) {
          throw new ConflictError('This supplier return changed concurrently. Reload and try again.');
        }

        await createAuthRepository(tx).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'procurement.supplier_return_dispatched',
          targetType: 'supplier_return',
          targetId: rtvId,
          requestId,
          metadata: {
            rtvNumber: rtvRow.rtvNumber,
            dispatchDate: input.dispatchDate,
            checksumSha256,
          },
        });

        return {
          ...updated,
          hasPdf: true,
          pdfStorageName: undefined,
          pdfChecksumSha256: undefined,
        };
      });
    } catch (err) {
      await removePrivateFile(storageName);
      throw err;
    }
  }

  async getSupplierReturnPdfFile(principal: AuthenticatedPrincipal, rtvId: string) {
    this.assert(principal, 'procurement.purchase_order.read');
    const [rtv] = await this.database
      .select()
      .from(supplierReturns)
      .where(and(eq(supplierReturns.companyId, principal.companyId), eq(supplierReturns.id, rtvId)));
    if (!rtv) throw new NotFoundError('Supplier return (RTV) not found.');

    const repo = createPurchaseOrderRepository(this.database);
    const po = await repo.getById(principal.companyId, principal.userId, rtv.purchaseOrderId);
    if (!po) throw new NotFoundError('Purchase order scope check failed for supplier return PDF.');

    if (!rtv.pdfStorageName) {
      throw new NotFoundError('RTV Challan PDF has not been generated yet. Dispatch the RTV first.');
    }
    const absolutePath = resolvePrivateFile(rtv.pdfStorageName);
    if (!existsSync(absolutePath)) {
      throw new NotFoundError('RTV Challan PDF file is missing from storage.');
    }
    return {
      absolutePath,
      fileName: `${rtv.rtvNumber}.pdf`,
    };
  }

  async recordSupplierReturnReplacement(
    principal: AuthenticatedPrincipal,
    rtvId: string,
    input: {
      expectedVersion: number;
      lines: Array<{
        supplierReturnLineId: string;
        receivedQuantity: string;
        remarks?: string;
      }>;
    },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.create');

    return this.database.transaction(async (tx) => {
      const [rtv] = await tx
        .select()
        .from(supplierReturns)
        .where(and(eq(supplierReturns.companyId, principal.companyId), eq(supplierReturns.id, rtvId)));
      if (!rtv) throw new NotFoundError('Supplier return (RTV) not found.');
      if (rtv.rowVersion !== input.expectedVersion) {
        throw new ConflictError('This supplier return changed concurrently. Reload and try again.');
      }
      if (rtv.resolutionType !== 'replacement') {
        throw validation('Replacement receipts apply only to RTVs marked for replacement.');
      }
      if (!['dispatched', 'replacement_received'].includes(rtv.status)) {
        throw validation(`Cannot record replacement when RTV status is "${rtv.status}".`);
      }

      const rtvLines = await tx
        .select()
        .from(supplierReturnLines)
        .where(and(eq(supplierReturnLines.companyId, principal.companyId), eq(supplierReturnLines.supplierReturnId, rtvId)));

      const updatedLines: Array<{ id: string; replacementReceivedQuantity: string; returnQuantity: string }> = [];
      for (const reqLine of input.lines) {
        const target = rtvLines.find((l) => l.id === reqLine.supplierReturnLineId);
        if (!target) throw validation(`RTV line ${reqLine.supplierReturnLineId} not found.`);

        const delta = new Decimal(reqLine.receivedQuantity);
        const alreadyReplaced = new Decimal(target.replacementReceivedQuantity);
        const remainingToReplace = new Decimal(target.returnQuantity).minus(alreadyReplaced);
        if (delta.gt(remainingToReplace)) {
          throw validation(`Replacement quantity (${delta.toFixed(4)}) exceeds remaining returned balance (${remainingToReplace.toFixed(4)}).`);
        }

        const newReplaced = alreadyReplaced.plus(delta);
        await tx
          .update(supplierReturnLines)
          .set({
            replacementReceivedQuantity: newReplaced.toFixed(4),
            remarks: reqLine.remarks?.trim() || target.remarks,
          })
          .where(eq(supplierReturnLines.id, target.id));
        updatedLines.push({
          id: target.id,
          replacementReceivedQuantity: newReplaced.toFixed(4),
          returnQuantity: target.returnQuantity,
        });

        // Credit replacement acceptance without exceeding PO ordered/received envelope
        const [poLine] = await tx
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.id, target.purchaseOrderLineId));
        if (poLine) {
          const nextRejected = Decimal.max(new Decimal(0), new Decimal(poLine.rejectedQuantity).minus(delta));
          const maxAllowedAccepted = new Decimal(poLine.receivedQuantity).minus(nextRejected);
          const nextAccepted = Decimal.min(maxAllowedAccepted, new Decimal(poLine.acceptedQuantity).plus(delta));
          await tx
            .update(purchaseOrderLines)
            .set({
              acceptedQuantity: nextAccepted.toFixed(4),
              rejectedQuantity: nextRejected.toFixed(4),
            })
            .where(eq(purchaseOrderLines.id, poLine.id));
        }
      }

      const allReplaced = rtvLines.every((orig) => {
        const upd = updatedLines.find((u) => u.id === orig.id);
        const rec = upd ? new Decimal(upd.replacementReceivedQuantity) : new Decimal(orig.replacementReceivedQuantity);
        return rec.gte(new Decimal(orig.returnQuantity));
      });

      const nextRtvStatus = allReplaced ? 'closed' : 'replacement_received';
      const now = new Date();
      await tx
        .update(supplierReturns)
        .set({
          status: nextRtvStatus,
          settledAt: allReplaced ? now : rtv.settledAt,
          rowVersion: rtv.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(supplierReturns.id, rtvId));

      // Re-evaluate parent PO delivered status
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, rtv.purchaseOrderId));
      if (po && ['issued', 'partially_delivered'].includes(po.status)) {
        const poLines = await tx
          .select()
          .from(purchaseOrderLines)
          .where(and(eq(purchaseOrderLines.companyId, principal.companyId), eq(purchaseOrderLines.purchaseOrderId, po.id)));
        const allPoAccepted = poLines.every((pl) =>
          new Decimal(pl.acceptedQuantity).gte(new Decimal(pl.quantity)),
        );
        if (allPoAccepted) {
          await tx
            .update(purchaseOrders)
            .set({ status: 'delivered', rowVersion: po.rowVersion + 1, updatedAt: now })
            .where(eq(purchaseOrders.id, po.id));
        }
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.supplier_return_replacement_received',
        targetType: 'supplier_return',
        targetId: rtvId,
        requestId,
        metadata: {
          rtvNumber: rtv.rtvNumber,
          nextRtvStatus,
          lines: updatedLines,
        },
      });

      return { id: rtvId, status: nextRtvStatus };
    });
  }

  async settleSupplierReturnCredit(
    principal: AuthenticatedPrincipal,
    rtvId: string,
    input: { expectedVersion: number; creditNoteReference: string },
    requestId: string,
  ) {
    this.assert(principal, 'procurement.purchase_order.approve');

    return this.database.transaction(async (tx) => {
      const [rtv] = await tx
        .select()
        .from(supplierReturns)
        .where(and(eq(supplierReturns.companyId, principal.companyId), eq(supplierReturns.id, rtvId)));
      if (!rtv) throw new NotFoundError('Supplier return (RTV) not found.');
      if (rtv.rowVersion !== input.expectedVersion) {
        throw new ConflictError('This supplier return changed concurrently. Reload and try again.');
      }
      if (rtv.resolutionType === 'replacement') {
        throw validation('Credit note settlement only applies to credit_note or deduction RTVs.');
      }
      if (rtv.status !== 'dispatched') {
        throw validation(`Only dispatched RTVs can be settled with a credit note (current status: ${rtv.status}).`);
      }

      const now = new Date();
      await tx
        .update(supplierReturns)
        .set({
          status: 'credit_settled',
          creditNoteReference: input.creditNoteReference,
          settledAt: now,
          rowVersion: rtv.rowVersion + 1,
          updatedAt: now,
        })
        .where(eq(supplierReturns.id, rtvId));

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'procurement.supplier_return_credit_settled',
        targetType: 'supplier_return',
        targetId: rtvId,
        requestId,
        metadata: {
          rtvNumber: rtv.rtvNumber,
          creditNoteReference: input.creditNoteReference,
          resolutionType: rtv.resolutionType,
        },
      });

      return { id: rtvId, status: 'credit_settled', creditNoteReference: input.creditNoteReference };
    });
  }
}

export const purchaseOrderService = new PurchaseOrderService();
