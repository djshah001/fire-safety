import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type WarehouseType = 'central_warehouse' | 'regional_depot' | 'project_site_store';
export type StockTransferStatus = 'draft' | 'dispatched' | 'received' | 'cancelled';
export type StockReservationStatus = 'active' | 'fulfilled' | 'released';
export type StockDocumentType = 'opening_balance' | 'site_issue' | 'site_return' | 'adjustment';

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
  itemId: string;
  itemCode: string;
  itemName: string;
  unitId: string;
  unitSymbol: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
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
  itemId: string;
  itemCode: string;
  itemName: string;
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
    await apiClient.post<ApiEnvelope<{ success: boolean; ledgerEntry: StockLedgerEntry; updatedBalance: any }>>(
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
  lines: Array<{ itemId: string; dispatchedQuantity: string; notes?: string }>;
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

