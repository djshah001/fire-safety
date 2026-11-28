import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type WarehouseType = 'central_warehouse' | 'regional_depot' | 'project_site_store';
export type StockTransferStatus = 'draft' | 'dispatched' | 'received' | 'cancelled';
export type StockReservationStatus = 'active' | 'fulfilled' | 'released';
export type StockDocumentType = 'opening_balance' | 'site_issue' | 'site_return' | 'adjustment';
export type MirStatus = 'open' | 'partially_dispatched' | 'dispatched' | 'completed' | 'short_closed' | 'cancelled';
export type DcStatus = 'dispatched' | 'verified' | 'discrepancy_pending' | 'resolved' | 'cancelled';
export type SrrStatus = 'open' | 'ordered' | 'dismissed';
export type SiteReturnStatus = 'submitted' | 'accepted' | 'rejected' | 'cancelled';

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  warehouseType: WarehouseType;
  projectId: string | null;
  projectTitle: string | null;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string | null;
  inChargeUserId: string | null;
  inChargeUserName: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type StockBalance = {
  id: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseType: WarehouseType;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationType: 'main' | 'in_transit' | 'site' | 'staging';
  projectId: string | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  manufacturerModel: string | null;
  unitId: string;
  unitSymbol: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  minStock: string | null;
  maxStock: string | null;
  lowStockAlertActive: boolean;
  inTransitQty: string;
  lastMovementAt: string | null;
  updatedAt: string;
};

export type StockLedgerEntry = {
  id: string;
  entryNumber: string;
  postingDate: string;
  sourceType: string;
  sourceId: string;
  sourceReference: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  locationId?: string;
  locationCode?: string;
  locationType?: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId?: string | null;
  brandName?: string | null;
  manufacturerModel?: string | null;
  unitSymbol: string;
  direction: 'in' | 'out';
  quantity: string;
  balanceBefore: string;
  balanceAfter: string;
  unitCost: string | null;
  notes: string | null;
  postedByUserId: string;
  postedByUserName: string;
  createdAt: string;
};

export type StockTransferLine = {
  id: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId?: string | null;
  brandName?: string | null;
  manufacturerModel?: string | null;
  unitSymbol: string;
  dispatchedQuantity: string;
  receivedQuantity: string;
  notes: string | null;
};

export type StockTransfer = {
  id: string;
  transferNumber: string;
  status: StockTransferStatus;
  sourceWarehouseId: string;
  sourceWarehouseCode?: string;
  sourceWarehouseName: string;
  destinationWarehouseId: string;
  destinationWarehouseCode?: string;
  destinationWarehouseName: string;
  projectId: string | null;
  projectTitle?: string | null;
  challanNumber: string | null;
  vehicleNumber: string | null;
  transporterName?: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  lines?: StockTransferLine[];
};

export type StockReservation = {
  id: string;
  reservationNumber: string;
  projectId: string;
  projectTitle: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId?: string | null;
  brandName?: string | null;
  manufacturerModel?: string | null;
  unitSymbol: string;
  quantityReserved: string;
  quantityIssued: string;
  status: StockReservationStatus;
  reservedByUserId: string;
  reservedByUserName: string;
  notes: string | null;
  createdAt: string;
};

export type StockDocument = {
  id: string;
  documentNumber: string;
  documentType: StockDocumentType;
  status: 'draft' | 'posted' | 'cancelled';
  sourceWarehouseId: string | null;
  destinationWarehouseId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  referenceNumber: string | null;
  documentDate: string;
  notes: string;
  postedAt: string | null;
  postedByUserId: string | null;
  postedByUserName: string | null;
  createdAt: string;
};

export const inventoryQueryKeys = {
  warehouses: (includeInactive = false) => ['inventory', 'warehouses', { includeInactive }] as const,
  balances: (filters?: { warehouseId?: string; search?: string; categoryId?: string }) =>
    ['inventory', 'balances', filters] as const,
  ledger: (filters?: { warehouseId?: string; itemId?: string; sourceType?: string }) =>
    ['inventory', 'ledger', filters] as const,
  transfers: (filters?: { status?: string }) => ['inventory', 'transfers', filters] as const,
  transfer: (id: string) => ['inventory', 'transfers', id] as const,
  reservations: (filters?: { projectId?: string; status?: string }) =>
    ['inventory', 'reservations', filters] as const,
  documents: (filters?: { documentType?: string }) => ['inventory', 'documents', filters] as const,
  thresholds: (warehouseId?: string) => ['inventory', 'thresholds', warehouseId] as const,
  replenishmentRequests: (filters?: { warehouseId?: string; status?: string }) =>
    ['inventory', 'replenishment-requests', filters] as const,
  materialIssueRequests: (filters?: { warehouseId?: string; projectId?: string; status?: string }) =>
    ['inventory', 'material-issue-requests', filters] as const,
  deliveryChallans: (filters?: { projectId?: string; status?: string }) =>
    ['inventory', 'delivery-challans', filters] as const,
  siteReturns: (filters?: { projectId?: string; status?: string }) =>
    ['inventory', 'site-returns', filters] as const,
};

export const warehousesQuery = (includeInactive = false) =>
  queryOptions({
    queryKey: inventoryQueryKeys.warehouses(includeInactive),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ warehouses: Warehouse[] }>>('/inventory/warehouses', {
          params: { includeInactive },
          signal,
        })
      ).data.data.warehouses,
  });

export const stockBalancesQuery = (filters?: { warehouseId?: string; search?: string; categoryId?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.balances(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ balances: StockBalance[] }>>('/inventory/balances', {
          params: filters,
          signal,
        })
      ).data.data.balances,
  });

export const stockLedgerQuery = (filters?: { warehouseId?: string; itemId?: string; sourceType?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.ledger(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ entries: StockLedgerEntry[] }>>('/inventory/ledger', {
          params: filters,
          signal,
        })
      ).data.data.entries,
  });

export const stockTransfersQuery = (filters?: { status?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.transfers(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ transfers: StockTransfer[] }>>('/inventory/transfers', {
          params: filters,
          signal,
        })
      ).data.data.transfers,
  });

export const stockTransferDetailQuery = (id?: string) =>
  queryOptions({
    queryKey: inventoryQueryKeys.transfer(id || ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ transfer: StockTransfer }>>(`/inventory/transfers/${id}`, {
          signal,
        })
      ).data.data.transfer,
  });

export const stockReservationsQuery = (filters?: { projectId?: string; status?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.reservations(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ reservations: StockReservation[] }>>('/inventory/reservations', {
          params: filters,
          signal,
        })
      ).data.data.reservations,
  });

export const stockDocumentsQuery = (filters?: { documentType?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.documents(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ documents: StockDocument[] }>>('/inventory/documents', {
          params: filters,
          signal,
        })
      ).data.data.documents,
  });

export async function createWarehouse(input: {
  code: string;
  name: string;
  warehouseType: WarehouseType;
  projectId?: string | null;
  addressLine1: string;
  city: string;
  state: string;
  postalCode?: string | null;
  inChargeUserId?: string | null;
}) {
  return (await apiClient.post<ApiEnvelope<{ warehouse: Warehouse }>>('/inventory/warehouses', input)).data.data
    .warehouse;
}

export async function postGrnToStock(input: {
  warehouseId: string;
  goodsReceiptLineId: string;
  notes?: string;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ success: boolean; ledgerEntry: StockLedgerEntry; updatedBalance: unknown }>>(
      '/inventory/post-grn',
      input
    )
  ).data.data;
}

export async function createStockTransfer(input: {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  projectId?: string | null;
  challanNumber?: string | null;
  vehicleNumber?: string | null;
  transporterName?: string | null;
  notes?: string | null;
  lines: Array<{ itemId: string; brandOfferingId?: string | null; dispatchedQuantity: string; notes?: string }>;
}) {
  return (await apiClient.post<ApiEnvelope<{ transfer: StockTransfer }>>('/inventory/transfers', input)).data.data
    .transfer;
}

export async function dispatchStockTransfer(transferId: string) {
  return (
    await apiClient.post<ApiEnvelope<{ transfer: StockTransfer }>>(`/inventory/transfers/${transferId}/dispatch`)
  ).data.data.transfer;
}

export async function receiveStockTransfer(
  transferId: string,
  input: {
    lines: Array<{ transferLineId: string; receivedQuantity: string }>;
    notes?: string;
  }
) {
  return (
    await apiClient.post<ApiEnvelope<{ transfer: StockTransfer }>>(
      `/inventory/transfers/${transferId}/receive`,
      input
    )
  ).data.data.transfer;
}

export async function createStockReservation(input: {
  projectId: string;
  warehouseId: string;
  itemId: string;
  brandOfferingId?: string | null;
  quantityReserved: string;
  boqLineId?: string | null;
  notes?: string;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ reservation: StockReservation }>>('/inventory/reservations', input)
  ).data.data.reservation;
}

export async function releaseStockReservation(reservationId: string) {
  return (
    await apiClient.post<ApiEnvelope<{ reservation: StockReservation }>>(
      `/inventory/reservations/${reservationId}/release`
    )
  ).data.data.reservation;
}

export async function createStockDocument(input: {
  documentType: StockDocumentType;
  sourceWarehouseId?: string | null;
  destinationWarehouseId?: string | null;
  projectId?: string | null;
  referenceNumber?: string | null;
  documentDate: string;
  notes: string;
  lines: Array<{ itemId: string; quantity: string; unitRate?: string | null; notes?: string }>;
}) {
  return (await apiClient.post<ApiEnvelope<{ document: StockDocument }>>('/inventory/documents', input)).data.data
    .document;
}

// ─── Thresholds ────────────────────────────────────────────────────────────

export type WarehouseItemThreshold = {
  id: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  manufacturerModel: string | null;
  unitSymbol: string;
  minStock: string;
  maxStock: string;
  lowStockAlertActive: boolean;
  lowStockAlertSentAt: string | null;
  updatedByUserId: string;
  updatedByUserName: string | null;
  rowVersion: number;
  updatedAt: string;
};

export const thresholdsQuery = (warehouseId?: string) =>
  queryOptions({
    queryKey: inventoryQueryKeys.thresholds(warehouseId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ thresholds: WarehouseItemThreshold[] }>>('/inventory/thresholds', {
          params: warehouseId ? { warehouseId } : undefined,
          signal,
        })
      ).data.data.thresholds,
  });

export async function upsertThreshold(input: {
  warehouseId: string;
  itemId: string;
  brandOfferingId?: string | null;
  minStock: string;
  maxStock: string;
}) {
  return (
    await apiClient.put<ApiEnvelope<{ threshold: WarehouseItemThreshold }>>('/inventory/thresholds', input)
  ).data.data.threshold;
}

// ─── Replenishment Requests ────────────────────────────────────────────────

export type ReplenishmentRequest = {
  id: string;
  srrNumber: string;
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  unitId: string;
  unitSymbol: string;
  requestedQty: string;
  currentFreeQty: string;
  minStock: string;
  maxStock: string;
  status: SrrStatus;
  linkedPoId: string | null;
  requestedByUserName: string;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
};

export const replenishmentRequestsQuery = (filters?: { warehouseId?: string; status?: string }, enabled = true) =>
  queryOptions({
    queryKey: inventoryQueryKeys.replenishmentRequests(filters),
    enabled,
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ requests: ReplenishmentRequest[] }>>(
          '/inventory/replenishment-requests',
          { params: filters, signal }
        )
      ).data.data.requests,
  });

export async function createReplenishmentRequest(input: {
  warehouseId: string;
  itemId: string;
  brandOfferingId?: string | null;
  requestedQty: string;
  notes?: string;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ request: ReplenishmentRequest }>>(
      '/inventory/replenishment-requests',
      input
    )
  ).data.data.request;
}

// ─── Material Issue Requests ───────────────────────────────────────────────

export type MirLine = {
  id: string;
  lineNumber: number;
  quotationLineId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  manufacturerModel?: string | null;
  unitId: string;
  unitSymbol: string;
  requestedQty: string;
  reservedQty: string;
  dispatchedQty: string;
  verifiedReceivedQty: string;
  damagedOrShortQty: string;
};

export type MaterialIssueRequest = {
  id: string;
  mirNumber: string;
  projectId: string;
  projectNumber: string;
  projectTitle: string;
  quotationRevisionId: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  status: MirStatus;
  requestedByUserName: string;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
  lines: MirLine[];
};

export const mirQuery = (filters?: { warehouseId?: string; projectId?: string; status?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.materialIssueRequests(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ requests: MaterialIssueRequest[] }>>(
          '/inventory/material-issue-requests',
          { params: filters, signal }
        )
      ).data.data.requests,
  });

export async function createMir(input: {
  quotationRevisionId: string;
  projectId: string;
  warehouseId: string;
  notes?: string;
  lines: Array<{
    quotationLineId: string;
    itemId: string;
    brandOfferingId?: string | null;
    unitId: string;
    requestedQty: string;
  }>;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ request: MaterialIssueRequest }>>(
      '/inventory/material-issue-requests',
      input
    )
  ).data.data.request;
}

// ─── Delivery Challans ─────────────────────────────────────────────────────

export type DcLine = {
  id: string;
  lineNumber: number;
  mirLineId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  unitSymbol: string;
  dispatchedQty: string;
  verifiedReceivedQty: string;
  damagedOrShortQty: string;
  lineRemarks: string | null;
};

export type DeliveryChallan = {
  id: string;
  dcNumber: string;
  mirId: string;
  mirNumber: string;
  projectId: string;
  projectNumber: string;
  projectTitle: string;
  warehouseId: string;
  warehouseName: string;
  status: DcStatus;
  dispatchedByUserId: string;
  dispatchedByUserName: string;
  dispatchedAt: string;
  transporterName: string | null;
  vehicleNumber: string | null;
  receiverName: string | null;
  hasPdf: boolean;
  verifiedByUserName: string | null;
  verifiedAt: string | null;
  hasPodPhoto: boolean;
  verificationNotes: string | null;
  resolvedByUserName: string | null;
  resolvedAt: string | null;
  discrepancyResolutionNotes: string | null;
  rowVersion: number;
  createdAt: string;
  lines: DcLine[];
};

export const deliveryChallanPdfUrl = (dcId: string) =>
  apiClient.getUri({ url: `/inventory/delivery-challans/${dcId}/pdf` });

export const deliveryChallanPodPhotoUrl = (dcId: string) =>
  apiClient.getUri({ url: `/inventory/delivery-challans/${dcId}/pod-photo` });

export const deliveryChallansQuery = (filters?: { projectId?: string; status?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.deliveryChallans(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ challans: DeliveryChallan[] }>>('/inventory/delivery-challans', {
          params: filters,
          signal,
        })
      ).data.data.challans,
  });

export async function dispatchMir(mirId: string, input: {
  lines: Array<{ mirLineId: string; dispatchedQty: string }>;
  transporterName?: string;
  vehicleNumber?: string;
  receiverName?: string;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ challan: DeliveryChallan }>>(
      `/inventory/material-issue-requests/${mirId}/dispatch`,
      input
    )
  ).data.data.challan;
}

export async function verifyPod(dcId: string, formData: FormData) {
  return (
    await apiClient.post<ApiEnvelope<{ challan: DeliveryChallan }>>(
      `/inventory/delivery-challans/${dcId}/verify-pod`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  ).data.data.challan;
}

export async function resolveDiscrepancy(dcId: string, input: {
  rowVersion: number;
  resolution: 'return_to_store' | 'write_off_transit_loss' | 'picking_error_restock';
  resolutionNotes: string;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ challan: DeliveryChallan }>>(
      `/inventory/delivery-challans/${dcId}/resolve-discrepancy`,
      input
    )
  ).data.data.challan;
}

// ─── Site Returns ──────────────────────────────────────────────────────────

export type SiteReturnLine = {
  id: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  unitSymbol: string;
  quantity: string;
  conditionNotes: string | null;
};

export type SiteReturn = {
  id: string;
  returnNumber: string;
  projectId: string;
  projectTitle: string;
  warehouseId: string;
  warehouseName: string;
  status: SiteReturnStatus;
  submittedByUserId: string;
  submittedByUserName: string;
  submittedAt: string;
  acceptedAt: string | null;
  reason: string;
  notes: string | null;
  lines: SiteReturnLine[];
};

export const siteReturnsQuery = (filters?: { projectId?: string; status?: string }) =>
  queryOptions({
    queryKey: inventoryQueryKeys.siteReturns(filters),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ returns: SiteReturn[] }>>('/inventory/site-returns', {
          params: filters,
          signal,
        })
      ).data.data.returns,
  });

export async function createSiteReturn(input: {
  projectId: string;
  warehouseId: string;
  reason: string;
  notes?: string;
  lines: Array<{
    itemId: string;
    brandOfferingId?: string | null;
    quantity: string;
    conditionNotes?: string;
  }>;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ siteReturn: SiteReturn }>>('/inventory/site-returns', input)
  ).data.data.siteReturn;
}

export async function acceptSiteReturn(returnId: string) {
  return (
    await apiClient.post<ApiEnvelope<{ siteReturn: SiteReturn }>>(`/inventory/site-returns/${returnId}/accept`)
  ).data.data.siteReturn;
}

// ─── Fulfillment Plan ──────────────────────────────────────────────────────

export type AcceptedQuotationSummary = {
  quotationRevisionId: string;
  quotationId: string;
  quotationNumber: string;
  revisionNumber: number;
  title: string;
  customerName: string;
  grandTotal: string;
  currency: string;
  acceptedAt: string;
  projectId: string;
  projectNumber: string;
  projectTitle: string;
};

export type FulfillmentPlanLine = {
  quotationLineId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  unitId: string;
  unitSymbol: string;
  quotedQty: string;
  alreadyRequestedFromStoreQty: string;
  alreadyDispatchedQty: string;
  alreadyVerifiedAtSiteQty: string;
  alreadyOrderedForProjectQty: string;
  remainingProjectNeed: string;
  warehouseOnHand: string;
  warehouseReserved: string;
  freeAvailable: string;
  incomingStoreOpenPoQty: string;
  minStock: string;
  maxStock: string;
  suggestedStoreIssueQty: string;
  projectShortageQty: string;
  projectedStoreAfterIssue: string;
  suggestedStoreReplenishmentQty: string;
  suggestedTotalPoQty: string;
};

export type FulfillmentPlan = {
  quotationRevisionId: string;
  quotationNumber: string;
  projectId: string;
  projectNumber: string;
  projectTitle: string;
  warehouseId: string;
  warehouseName: string;
  lines: FulfillmentPlanLine[];
};

export const fulfillmentPlanQueryKeys = {
  acceptedQuotations: ['procurement', 'accepted-quotations'] as const,
  plan: (quotationRevisionId?: string, warehouseId?: string) =>
    ['procurement', 'fulfillment-plan', quotationRevisionId, warehouseId] as const,
};

export const acceptedQuotationsQuery = (enabled = true) =>
  queryOptions({
    queryKey: fulfillmentPlanQueryKeys.acceptedQuotations,
    enabled,
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ quotations: AcceptedQuotationSummary[] }>>(
          '/procurement/accepted-quotations',
          { signal }
        )
      ).data.data.quotations,
  });

export const fulfillmentPlanQuery = (quotationRevisionId?: string, warehouseId?: string) =>
  queryOptions({
    queryKey: fulfillmentPlanQueryKeys.plan(quotationRevisionId, warehouseId),
    enabled: Boolean(quotationRevisionId && warehouseId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ plan: FulfillmentPlan }>>(
          `/procurement/quotations/${quotationRevisionId}/fulfillment-plan`,
          { params: { warehouseId }, signal }
        )
      ).data.data.plan,
  });

export async function createRequisitionFromFulfillmentPlan(input: {
  quotationRevisionId: string;
  projectId: string;
  lines: Array<{
    quotationLineId: string;
    projectAllocationQty: string;
    storeReplenishmentQty: string;
    destinationType: 'warehouse' | 'direct_to_site';
  }>;
}) {
  return (
    await apiClient.post<ApiEnvelope<{ requisitionId: string; requisitionNumber: string }>>(
      '/procurement/requisitions/from-fulfillment-plan',
      input
    )
  ).data.data;
}

export async function createRequisitionFromSrr(input: { srrIds: string[]; notes?: string }) {
  return (
    await apiClient.post<ApiEnvelope<{ requisitionId: string; requisitionNumber: string }>>(
      '/procurement/requisitions/from-srr',
      input
    )
  ).data.data;
}
