import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'issued'
  | 'partially_delivered'
  | 'delivered'
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
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderWorkspace = {
  purchaseOrder: PurchaseOrder;
  currentRevision: PurchaseOrderRevision;
  revisions: PurchaseOrderRevision[];
  lines: PurchaseOrderLine[];
  goodsReceipts: GoodsReceipt[];
  capabilities: {
    canSubmit: boolean;
    canApprove: boolean;
    canIssue: boolean;
    canAmend: boolean;
    canCancel: boolean;
    canReceive: boolean;
    canInspect: boolean;
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
    lines: Array<{
      purchaseOrderLineId: string;
      deliveredQuantity: string;
      acceptedQuantity?: string;
      rejectedQuantity?: string;
      rejectionReason?: string;
      inspectionNotes?: string;
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
  }>,
) {
  const response = await apiClient.post<
    ApiEnvelope<{ goodsReceipt: { id: string; status: string } }>
  >(`/procurement/goods-receipts/${grnId}/inspect`, { expectedVersion, lines });
  return response.data.data.goodsReceipt;
}

