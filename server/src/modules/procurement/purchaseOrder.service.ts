import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Decimal } from 'decimal.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import {
  ensureUploadRoot,
  removePrivateFile,
  resolvePrivateFile,
} from '../../infrastructure/storage/localFileStorage.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { isAdministrator } from '../../core/security/administrator.js';
import { createPurchaseOrderRepository } from './purchaseOrder.repository.js';
import { procurementService } from './procurement.service.js';
import { renderPurchaseOrderPdf } from '../../infrastructure/documents/purchaseOrder.pdf.js';
import {
  goodsReceiptLines,
  goodsReceipts,
  projects,
  purchaseOrderLines,
  purchaseOrderRevisions,
  purchaseOrders,
  vendors,
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

    const lines = await repo.getLinesForRevision(principal.companyId, currentRevision.id);
    const receipts = await repo.getGoodsReceiptsForPo(principal.companyId, poId);

    const isSysAdmin = isAdministrator(principal);
    const hasAcceptedDeliveries = lines.some((l) => new Decimal(l.acceptedQuantity).gt(0));

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
      canReceive:
        ['issued', 'partially_delivered'].includes(po.status) &&
        hasPermission(principal, 'procurement.goods_receipt.manage'),
      canInspect:
        hasPermission(principal, 'procurement.goods_receipt.inspect'),
    };

    return {
      purchaseOrder: po,
      currentRevision,
      revisions,
      lines,
      goodsReceipts: receipts,
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

      const qty = new Decimal(rfqLine.quantity);
      const rate = new Decimal(offerLine.unitRate);
      const lineBase = qty.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineTax = lineBase.mul(0.18).toDecimalPlaces(2, Decimal.ROUND_HALF_UP); // Default 18% GST
      const lineTotal = lineBase.plus(lineTax);

      subtotalAcc = subtotalAcc.plus(lineBase);
      taxAmountAcc = taxAmountAcc.plus(lineTax);

      return {
        lineNumber: idx + 1,
        itemId: rfqLine.itemId,
        itemCodeSnapshot: rfqLine.itemCodeSnapshot,
        itemNameSnapshot: rfqLine.itemNameSnapshot,
        specificationSnapshot: offerLine.specificationOffered || rfqLine.specificationSnapshot,
        brandOffered: offerLine.brandOffered,
        modelSnapshot: null,
        unitId: rfqLine.unitId,
        unitSymbolSnapshot: rfqLine.unitSymbolSnapshot,
        quantity: qty.toFixed(4),
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
      project: {
        number: po.projectNumber,
        title: po.projectTitle,
      },
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
          itemCodeSnapshot: l.itemCode,
          itemNameSnapshot: l.itemName,
          specificationSnapshot: l.specification,
          brandOffered: l.brandOffered,
          modelSnapshot: l.model,
          unitId: l.unitId,
          unitSymbolSnapshot: l.unitSymbol,
          quantity: l.quantity,
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
      if (['delivered', 'closed', 'cancelled'].includes(po.status)) {
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
      lines: Array<{
        purchaseOrderLineId: string;
        deliveredQuantity: string;
        acceptedQuantity?: string;
        rejectedQuantity?: string;
        rejectionReason?: string;
        inspectionNotes?: string;
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

      let totalDeliveredAcc = new Decimal(0);
      let totalAcceptedAcc = new Decimal(0);

      // Validate quantities against PO line balances
      const processedLines = input.lines.map((inputLine, idx) => {
        const poLine = poLines.find((pl) => pl.id === inputLine.purchaseOrderLineId);
        if (!poLine) throw validation(`PO Line not found: ${inputLine.purchaseOrderLineId}`);

        const ordered = new Decimal(poLine.quantity);
        const alreadyReceived = new Decimal(poLine.receivedQuantity);
        const delivered = new Decimal(inputLine.deliveredQuantity);
        const remainingToReceive = ordered.minus(alreadyReceived);

        if (delivered.gt(remainingToReceive)) {
          throw validation(
            `Delivered quantity (${delivered}) exceeds remaining un-received balance (${remainingToReceive}) for line #${poLine.lineNumber}.`,
          );
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
        action: 'procurement.goods_receipt_created',
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
    }>,
    requestId: string,
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

      // Re-evaluate parent PO status
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, grn.purchaseOrderId));

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
}

export const purchaseOrderService = new PurchaseOrderService();
