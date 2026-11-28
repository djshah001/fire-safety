import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'issued'
  | 'partially_delivered'
  | 'delivered'
  | 'short_closed'
  | 'closed'
  | 'cancelled';

export type PurchaseOrderRevisionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'issued'
  | 'superseded'
  | 'cancelled';

export type GoodsReceiptStatus =
  | 'draft'
  | 'inspected'
  | 'accepted'
  | 'partially_rejected'
  | 'rejected';

export type PurchaseOrderLine = {
  id: string;
  purchaseOrderId: string;
  revisionId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  specification: string;
  brandOffered: string;
  model: string | null;
  unitId: string;
  unitSymbol: string;
  quantity: string;
  unitRate: string;
  taxPercent: string;
  taxAmount: string;
  lineTotal: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  shortClosedQuantity: string;
  requisitionLineId: string | null;
  createdAt: string;
};

export type PurchaseOrderRevision = {
  id: string;
  revisionNumber: number;
  status: PurchaseOrderRevisionStatus;
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  changeReason: string | null;
  preparedByUserId: string;
  preparedByName: string;
  submittedAt: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  issuedAt: string | null;
  issuedPdfStorageId: string | null;
  issuedPdfChecksum: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type GoodsReceiptLine = {
  id: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  lineNumber: number;
  deliveredQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  rejectionReason: string | null;
  inspectionNotes: string | null;
  inspectedByUserId: string | null;
  inspectedAt: string | null;
  excessQuantity: string;
  excessApprovalReason: string | null;
  excessApprovedByUserId: string | null;
};

export type GoodsReceipt = {
  id: string;
  grnNumber: string;
  vendorChallanNumber: string;
  vendorChallanDate: string;
  receivedAt: string;
  receivedByUserId: string;
  receivedByName: string;
  status: GoodsReceiptStatus;
  deliveryLocation: string;
  vehicleNumber: string | null;
  transporterName: string | null;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
  lines: GoodsReceiptLine[];
};

export type PurchaseOrder = {
  id: string;
  companyId: string;
  projectId: string;
  projectNumber: string;
  projectTitle: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  requisitionId: string | null;
  requisitionNumber: string | null;
  poNumber: string;
  title: string;
  status: PurchaseOrderStatus;
  currency: string;
  paymentTerms: string;
  deliveryTerms: string;
  deliveryLocation: string;
  deliveryDueDate: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  currentRevisionNumber: number;
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  createdByUserId: string;
  createdByName?: string;
  shortClosedAt?: string | null;
  shortClosedByUserId?: string | null;
  shortCloseReason?: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderDispatch = {
  id: string;
  purchaseOrderId: string;
  revisionId: string;
  channel: 'email' | 'whatsapp_msg91' | 'whatsapp_manual';
  recipientName: string;
  recipientContact: string;
  status: 'queued' | 'sent' | 'failed' | 'manual_opened';
  providerMessageId: string | null;
  sentByUserId: string;
  sentByName: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type SupplierReturnLine = {
  id: string;
  supplierReturnId: string;
  goodsReceiptLineId: string;
  purchaseOrderLineId: string;
  itemId: string;
  brandOfferingId: string | null;
  itemCode: string;
  itemName: string;
  brandOffered: string;
  unitSymbol: string;
  returnQuantity: string;
  replacementReceivedQuantity: string;
  remarks: string | null;
};

export type SupplierReturn = {
  id: string;
  rtvNumber: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  grnNumber: string;
  vendorId: string;
  projectId: string | null;
  status: 'draft' | 'dispatched' | 'replacement_received' | 'credit_settled' | 'closed';
  resolutionType: 'replacement' | 'credit_note' | 'deduction';
  transporterName: string | null;
  vehicleNumber: string | null;
  dispatchDate: string | null;
  reason: string;
  creditNoteReference: string | null;
  settledAt: string | null;
  hasPdf: boolean;
  createdByUserId: string;
  createdByName: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
  lines: SupplierReturnLine[];
};

export type PurchaseOrderWorkspace = {
  purchaseOrder: PurchaseOrder;
  currentRevision: PurchaseOrderRevision;
  revisions: PurchaseOrderRevision[];
  lines: PurchaseOrderLine[];
  goodsReceipts: GoodsReceipt[];
  vendorContact: { name: string; email: string | null; phone: string | null } | null;
  dispatches: PurchaseOrderDispatch[];
  supplierReturns: SupplierReturn[];
  capabilities: {
    canSubmit: boolean;
    canApprove: boolean;
    canIssue: boolean;
    canAmend: boolean;
    canCancel: boolean;
    canShortClose: boolean;
    canDispatchVendor: boolean;
    canReceive: boolean;
    canInspect: boolean;
    canApproveOverdelivery: boolean;
    canCreateRtv: boolean;
  };
};

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export type PurchaseOrderListFilters = {
  search?: string;
  status?: PurchaseOrderStatus;
  vendorId?: string;
  projectId?: string;
  page: number;
  pageSize: number;
  sort: 'poNumber' | 'title' | 'status' | 'grandTotal' | 'deliveryDueDate' | 'createdAt' | 'updatedAt';
  direction: 'asc' | 'desc';
};

export const purchaseOrdersQuery = (filters: PurchaseOrderListFilters) =>
  queryOptions({
    queryKey: ['procurement', 'purchase-orders', filters] as const,
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<Page<PurchaseOrder>>>('/procurement/purchase-orders', {
          params: filters,
          signal,
        })
      ).data.data,
  });

export const purchaseOrderWorkspaceQuery = (poId?: string) =>
  queryOptions({
    queryKey: ['procurement', 'purchase-orders', poId] as const,
    enabled: Boolean(poId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<PurchaseOrderWorkspace>>(
          `/procurement/purchase-orders/${poId}`,
          { signal },
        )
      ).data.data,
  });

export async function createPurchaseOrderFromRequisition(input: {
  requisitionId: string;
  title?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  deliveryLocation?: string;
  deliveryDueDate?: string;
  billingAddress?: string;
  shippingAddress?: string;
  notes?: string;
}) {
  const response = await apiClient.post<
    ApiEnvelope<{ purchaseOrder: { id: string; poNumber: string } }>
  >('/procurement/purchase-orders/from-requisition', input);
  return response.data.data.purchaseOrder;
}

export async function createPurchaseOrderDirect(input: {
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
}) {
  const response = await apiClient.post<
    ApiEnvelope<{ purchaseOrder: { id: string; poNumber: string } }>
  >('/procurement/purchase-orders', input);
  return response.data.data.purchaseOrder;
}

export async function submitPoRevision(poId: string, expectedVersion: number) {
  const response = await apiClient.post<ApiEnvelope<{ revision: { id: string; status: string } }>>(
    `/procurement/purchase-orders/${poId}/submit`,
    { expectedVersion },
  );
  return response.data.data.revision;
}

export async function approvePoRevision(
  poId: string,
  expectedVersion: number,
  notes?: string,
) {
  const response = await apiClient.post<ApiEnvelope<{ revision: { id: string; status: string } }>>(
    `/procurement/purchase-orders/${poId}/approve`,
    { expectedVersion, notes },
  );
  return response.data.data.revision;
}

export async function issuePurchaseOrder(poId: string, expectedVersion: number) {
  const response = await apiClient.post<
    ApiEnvelope<{ id: string; status: string; storageName: string }>
  >(`/procurement/purchase-orders/${poId}/issue`, { expectedVersion });
  return response.data.data;
}

export async function amendPurchaseOrder(
  poId: string,
  expectedVersion: number,
  changeReason: string,
) {
  const response = await apiClient.post<
    ApiEnvelope<{ revision: { id: string; revisionNumber: number } }>
  >(`/procurement/purchase-orders/${poId}/amend`, { expectedVersion, changeReason });
  return response.data.data.revision;
}

export async function cancelPurchaseOrder(
  poId: string,
  expectedVersion: number,
  cancellationReason: string,
) {
  const response = await apiClient.post<ApiEnvelope<{ id: string; status: string }>>(
    `/procurement/purchase-orders/${poId}/cancel`,
    { expectedVersion, cancellationReason },
  );
  return response.data.data;
}

export async function createGoodsReceipt(
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
) {
  const response = await apiClient.post<
    ApiEnvelope<{ goodsReceipt: { id: string; grnNumber: string; status: string } }>
  >(`/procurement/purchase-orders/${poId}/goods-receipts`, input);
  return response.data.data.goodsReceipt;
}

export async function inspectGoodsReceipt(
  grnId: string,
  expectedVersion: number,
  lines: Array<{
    goodsReceiptLineId: string;
    acceptedQuantity: string;
    rejectedQuantity?: string;
    rejectionReason?: string;
    inspectionNotes?: string;
    excessApprovalReason?: string;
  }>,
  excessApprovalReason?: string,
) {
  const response = await apiClient.post<
    ApiEnvelope<{ goodsReceipt: { id: string; status: string } }>
  >(`/procurement/goods-receipts/${grnId}/inspect`, { expectedVersion, lines, excessApprovalReason });
  return response.data.data.goodsReceipt;
}

export const poPdfUrl = (poId: string) =>
  apiClient.getUri({ url: `/procurement/purchase-orders/${poId}/pdf` });

export const supplierReturnPdfUrl = (rtvId: string) =>
  apiClient.getUri({ url: `/procurement/supplier-returns/${rtvId}/pdf` });

export async function createPurchaseOrdersFromAwards(input: {
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
}) {
  const response = await apiClient.post<
    ApiEnvelope<{
      purchaseOrders: Array<{ id: string; poNumber: string; vendorId: string; vendorName: string }>;
    }>
  >('/procurement/purchase-orders/from-requisition-awards', input);
  return response.data.data.purchaseOrders;
}

export async function shortClosePurchaseOrder(
  poId: string,
  expectedVersion: number,
  reason: string,
) {
  const response = await apiClient.post<
    ApiEnvelope<{ id: string; status: string; shortCloseReason: string }>
  >(`/procurement/purchase-orders/${poId}/short-close`, { expectedVersion, reason });
  return response.data.data;
}

export async function dispatchPurchaseOrderToVendor(
  poId: string,
  input: {
    channel: 'email' | 'whatsapp_msg91' | 'whatsapp_manual';
    recipientName: string;
    recipientContact: string;
    customMessage?: string;
  },
) {
  const response = await apiClient.post<
    ApiEnvelope<{
      dispatch: PurchaseOrderDispatch;
      manualWhatsAppUrl?: string;
      fallbackToManual?: boolean;
    }>
  >(`/procurement/purchase-orders/${poId}/dispatch-vendor`, input);
  return response.data.data;
}

export async function createSupplierReturn(input: {
  purchaseOrderId: string;
  goodsReceiptId: string;
  resolutionType: 'replacement' | 'credit_note' | 'deduction';
  reason: string;
  lines: Array<{ goodsReceiptLineId: string; returnQuantity: string; remarks?: string }>;
}) {
  const response = await apiClient.post<ApiEnvelope<{ supplierReturn: SupplierReturn }>>(
    '/procurement/supplier-returns',
    input,
  );
  return response.data.data.supplierReturn;
}

export async function dispatchSupplierReturn(
  rtvId: string,
  input: {
    expectedVersion: number;
    transporterName?: string;
    vehicleNumber?: string;
    dispatchDate: string;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ supplierReturn: SupplierReturn }>>(
    `/procurement/supplier-returns/${rtvId}/dispatch`,
    input,
  );
  return response.data.data.supplierReturn;
}

export async function recordSupplierReturnReplacement(
  rtvId: string,
  input: {
    expectedVersion: number;
    lines: Array<{ supplierReturnLineId: string; receivedQuantity: string; remarks?: string }>;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ id: string; status: string }>>(
    `/procurement/supplier-returns/${rtvId}/record-replacement`,
    input,
  );
  return response.data.data;
}

export async function settleSupplierReturnCredit(
  rtvId: string,
  input: { expectedVersion: number; creditNoteReference: string },
) {
  const response = await apiClient.post<
    ApiEnvelope<{ id: string; status: string; creditNoteReference: string }>
  >(`/procurement/supplier-returns/${rtvId}/settle-credit`, input);
  return response.data.data;
}

