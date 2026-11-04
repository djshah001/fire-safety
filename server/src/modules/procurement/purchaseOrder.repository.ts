import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  goodsReceiptLines,
  goodsReceipts,
  procurementRequisitions,
  projectMembers,
  projects,
  purchaseOrderLines,
  purchaseOrderRevisions,
  purchaseOrders,
  users,
  vendors,
} from '../../infrastructure/database/schema/index.js';
import { administratorScope } from '../../core/security/administrator.js';

const access = (companyId: string, userId: string) =>
  and(
    eq(purchaseOrders.companyId, companyId),
    or(
      administratorScope(companyId, userId),
      eq(purchaseOrders.createdByUserId, userId),
      sql`exists (
        select 1 from ${projectMembers} pm
        where pm.project_id = ${purchaseOrders.projectId}
          and pm.user_id = ${userId}
      )`,
    ),
  );

export function createPurchaseOrderRepository(executor: DatabaseExecutor) {
  return {
    async allocatePoNumber(companyId: string, now: Date) {
      const periodKey = String(now.getUTCFullYear());
      const { documentCounters } = await import('../../infrastructure/database/schema/index.js');
      const [counter] = await executor
        .insert(documentCounters)
        .values({
          companyId,
          documentType: 'PO',
          periodKey,
          nextValue: 2,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey],
          set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now },
        })
        .returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });
      return `PO-${periodKey}-${String(counter!.allocated).padStart(4, '0')}`;
    },

    async allocateGrnNumber(companyId: string, now: Date) {
      const periodKey = String(now.getUTCFullYear());
      const { documentCounters } = await import('../../infrastructure/database/schema/index.js');
      const [counter] = await executor
        .insert(documentCounters)
        .values({
          companyId,
          documentType: 'GRN',
          periodKey,
          nextValue: 2,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey],
          set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now },
        })
        .returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });
      return `GRN-${periodKey}-${String(counter!.allocated).padStart(4, '0')}`;
    },

    async list(
      companyId: string,
      userId: string,
      input: {
        search?: string;
        status?: string;
        vendorId?: string;
        projectId?: string;
        limit: number;
        offset: number;
        sort: 'poNumber' | 'title' | 'status' | 'grandTotal' | 'deliveryDueDate' | 'createdAt' | 'updatedAt';
        direction: 'asc' | 'desc';
      },
    ) {
      const filters = [access(companyId, userId)];
      if (input.status) filters.push(eq(purchaseOrders.status, input.status as never));
      if (input.vendorId) filters.push(eq(purchaseOrders.vendorId, input.vendorId));
      if (input.projectId) filters.push(eq(purchaseOrders.projectId, input.projectId));
      if (input.search) {
        filters.push(
          or(
            ilike(purchaseOrders.poNumber, `%${input.search}%`),
            ilike(purchaseOrders.title, `%${input.search}%`),
            ilike(vendors.displayName, `%${input.search}%`),
            ilike(vendors.code, `%${input.search}%`),
          )!,
        );
      }

      const sortColumn = {
        poNumber: purchaseOrders.poNumber,
        title: purchaseOrders.title,
        status: purchaseOrders.status,
        grandTotal: purchaseOrders.grandTotal,
        deliveryDueDate: purchaseOrders.deliveryDueDate,
        createdAt: purchaseOrders.createdAt,
        updatedAt: purchaseOrders.updatedAt,
      }[input.sort];
      const order = input.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);

      const [totalResult] = await executor
        .select({ value: count() })
        .from(purchaseOrders)
        .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
        .where(and(...filters));

      const items = await executor
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          title: purchaseOrders.title,
          status: purchaseOrders.status,
          currency: purchaseOrders.currency,
          subtotal: purchaseOrders.subtotal,
          taxAmount: purchaseOrders.taxAmount,
          grandTotal: purchaseOrders.grandTotal,
          currentRevisionNumber: purchaseOrders.currentRevisionNumber,
          deliveryDueDate: purchaseOrders.deliveryDueDate,
          deliveryLocation: purchaseOrders.deliveryLocation,
          projectId: purchaseOrders.projectId,
          projectNumber: projects.projectNumber,
          projectTitle: projects.title,
          vendorId: purchaseOrders.vendorId,
          vendorName: vendors.displayName,
          vendorCode: vendors.code,
          rowVersion: purchaseOrders.rowVersion,
          createdAt: purchaseOrders.createdAt,
          updatedAt: purchaseOrders.updatedAt,
        })
        .from(purchaseOrders)
        .innerJoin(projects, eq(projects.id, purchaseOrders.projectId))
        .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
        .where(and(...filters))
        .orderBy(order)
        .limit(input.limit)
        .offset(input.offset);

      return {
        items,
        total: totalResult?.value ?? 0,
      };
    },

    async getById(companyId: string, userId: string, poId: string) {
      const [po] = await executor
        .select({
          id: purchaseOrders.id,
          companyId: purchaseOrders.companyId,
          projectId: purchaseOrders.projectId,
          projectNumber: projects.projectNumber,
          projectTitle: projects.title,
          vendorId: purchaseOrders.vendorId,
          vendorName: vendors.displayName,
          vendorCode: vendors.code,
          requisitionId: purchaseOrders.requisitionId,
          requisitionNumber: procurementRequisitions.requisitionNumber,
          poNumber: purchaseOrders.poNumber,
          title: purchaseOrders.title,
          status: purchaseOrders.status,
          currency: purchaseOrders.currency,
          paymentTerms: purchaseOrders.paymentTerms,
          deliveryTerms: purchaseOrders.deliveryTerms,
          deliveryLocation: purchaseOrders.deliveryLocation,
          deliveryDueDate: purchaseOrders.deliveryDueDate,
          billingAddress: purchaseOrders.billingAddress,
          shippingAddress: purchaseOrders.shippingAddress,
          notes: purchaseOrders.notes,
          currentRevisionNumber: purchaseOrders.currentRevisionNumber,
          subtotal: purchaseOrders.subtotal,
          taxAmount: purchaseOrders.taxAmount,
          grandTotal: purchaseOrders.grandTotal,
          createdByUserId: purchaseOrders.createdByUserId,
          createdByName: users.name,
          rowVersion: purchaseOrders.rowVersion,
          createdAt: purchaseOrders.createdAt,
          updatedAt: purchaseOrders.updatedAt,
        })
        .from(purchaseOrders)
        .innerJoin(projects, eq(projects.id, purchaseOrders.projectId))
        .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
        .innerJoin(users, eq(users.id, purchaseOrders.createdByUserId))
        .leftJoin(procurementRequisitions, eq(procurementRequisitions.id, purchaseOrders.requisitionId))
        .where(and(eq(purchaseOrders.id, poId), access(companyId, userId)));

      return po ?? null;
    },

    async getRevisions(companyId: string, poId: string) {
      return executor
        .select({
          id: purchaseOrderRevisions.id,
          revisionNumber: purchaseOrderRevisions.revisionNumber,
          status: purchaseOrderRevisions.status,
          subtotal: purchaseOrderRevisions.subtotal,
          taxAmount: purchaseOrderRevisions.taxAmount,
          grandTotal: purchaseOrderRevisions.grandTotal,
          changeReason: purchaseOrderRevisions.changeReason,
          preparedByUserId: purchaseOrderRevisions.preparedByUserId,
          preparedByName: users.name,
          submittedAt: purchaseOrderRevisions.submittedAt,
          approvedByUserId: purchaseOrderRevisions.approvedByUserId,
          approvedAt: purchaseOrderRevisions.approvedAt,
          approvalNotes: purchaseOrderRevisions.approvalNotes,
          issuedAt: purchaseOrderRevisions.issuedAt,
          issuedPdfStorageId: purchaseOrderRevisions.issuedPdfStorageId,
          issuedPdfChecksum: purchaseOrderRevisions.issuedPdfChecksum,
          rowVersion: purchaseOrderRevisions.rowVersion,
          createdAt: purchaseOrderRevisions.createdAt,
          updatedAt: purchaseOrderRevisions.updatedAt,
        })
        .from(purchaseOrderRevisions)
        .innerJoin(users, eq(users.id, purchaseOrderRevisions.preparedByUserId))
        .where(and(eq(purchaseOrderRevisions.companyId, companyId), eq(purchaseOrderRevisions.purchaseOrderId, poId)))
        .orderBy(desc(purchaseOrderRevisions.revisionNumber));
    },

    async getLinesForRevision(companyId: string, revisionId: string) {
      return executor
        .select({
          id: purchaseOrderLines.id,
          purchaseOrderId: purchaseOrderLines.purchaseOrderId,
          revisionId: purchaseOrderLines.revisionId,
          lineNumber: purchaseOrderLines.lineNumber,
          itemId: purchaseOrderLines.itemId,
          itemCode: purchaseOrderLines.itemCodeSnapshot,
          itemName: purchaseOrderLines.itemNameSnapshot,
          specification: purchaseOrderLines.specificationSnapshot,
          brandOffered: purchaseOrderLines.brandOffered,
          model: purchaseOrderLines.modelSnapshot,
          unitId: purchaseOrderLines.unitId,
          unitSymbol: purchaseOrderLines.unitSymbolSnapshot,
          quantity: purchaseOrderLines.quantity,
          unitRate: purchaseOrderLines.unitRate,
          taxPercent: purchaseOrderLines.taxPercent,
          taxAmount: purchaseOrderLines.taxAmount,
          lineTotal: purchaseOrderLines.lineTotal,
          receivedQuantity: purchaseOrderLines.receivedQuantity,
          acceptedQuantity: purchaseOrderLines.acceptedQuantity,
          rejectedQuantity: purchaseOrderLines.rejectedQuantity,
          requisitionLineId: purchaseOrderLines.requisitionLineId,
          createdAt: purchaseOrderLines.createdAt,
        })
        .from(purchaseOrderLines)
        .where(and(eq(purchaseOrderLines.companyId, companyId), eq(purchaseOrderLines.revisionId, revisionId)))
        .orderBy(asc(purchaseOrderLines.lineNumber));
    },

    async getGoodsReceiptsForPo(companyId: string, poId: string) {
      const receipts = await executor
        .select({
          id: goodsReceipts.id,
          grnNumber: goodsReceipts.grnNumber,
          vendorChallanNumber: goodsReceipts.vendorChallanNumber,
          vendorChallanDate: goodsReceipts.vendorChallanDate,
          receivedAt: goodsReceipts.receivedAt,
          receivedByUserId: goodsReceipts.receivedByUserId,
          receivedByName: users.name,
          status: goodsReceipts.status,
          deliveryLocation: goodsReceipts.deliveryLocation,
          vehicleNumber: goodsReceipts.vehicleNumber,
          transporterName: goodsReceipts.transporterName,
          notes: goodsReceipts.notes,
          rowVersion: goodsReceipts.rowVersion,
          createdAt: goodsReceipts.createdAt,
        })
        .from(goodsReceipts)
        .innerJoin(users, eq(users.id, goodsReceipts.receivedByUserId))
        .where(and(eq(goodsReceipts.companyId, companyId), eq(goodsReceipts.purchaseOrderId, poId)))
        .orderBy(desc(goodsReceipts.createdAt));

      if (receipts.length === 0) return [];

      const receiptIds = receipts.map((r) => r.id);
      const lines = await executor
        .select({
          id: goodsReceiptLines.id,
          goodsReceiptId: goodsReceiptLines.goodsReceiptId,
          purchaseOrderLineId: goodsReceiptLines.purchaseOrderLineId,
          lineNumber: goodsReceiptLines.lineNumber,
          deliveredQuantity: goodsReceiptLines.deliveredQuantity,
          acceptedQuantity: goodsReceiptLines.acceptedQuantity,
          rejectedQuantity: goodsReceiptLines.rejectedQuantity,
          rejectionReason: goodsReceiptLines.rejectionReason,
          inspectionNotes: goodsReceiptLines.inspectionNotes,
          inspectedByUserId: goodsReceiptLines.inspectedByUserId,
          inspectedAt: goodsReceiptLines.inspectedAt,
        })
        .from(goodsReceiptLines)
        .where(and(eq(goodsReceiptLines.companyId, companyId), inArray(goodsReceiptLines.goodsReceiptId, receiptIds)))
        .orderBy(asc(goodsReceiptLines.lineNumber));

      return receipts.map((r) => ({
        ...r,
        lines: lines.filter((l) => l.goodsReceiptId === r.id),
      }));
    },
  };
}
