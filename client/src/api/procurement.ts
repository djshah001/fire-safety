import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type RequisitionStatus = 'open' | 'sourcing' | 'selected';
export type Equivalence = 'equivalent' | 'deviation' | 'unknown';

export type ProcurementRequisition = {
  id: string; requisitionNumber: string; title: string; status: RequisitionStatus;
  projectId: string; projectNumber: string; projectTitle: string;
  buyerUserId: string; purchaseManagerUserId: string; requiredBy: string;
  deliveryLocation: string; rowVersion: number; updatedAt: string;
  rfqId: string | null; rfqNumber: string | null; rfqStatus: 'open' | 'selected' | 'cancelled' | null;
  offerCount: number;
};

export type DemandLine = {
  id: string; lineNumber: number; itemId: string; itemCodeSnapshot: string; itemNameSnapshot: string;
  specificationSnapshot: string; unitId: string; unitSymbolSnapshot: string; quantity: string;
};

export type EligibleBrand = {
  id: string;
  name: string;
  code: string;
  model: string | null;
  sku: string | null;
  isPreferred: boolean;
};

export type RfqLine = DemandLine & {
  rfqId: string;
  requisitionLineId: string;
  eligibleBrands?: EligibleBrand[];
};

export type VendorOfferLine = {
  id: string; vendorOfferId: string; rfqLineId: string; lineNumber: number; unitRate: string; lineTotal: string;
  brandOffered: string; specificationOffered: string; equivalence: Equivalence; deviationNotes: string | null;
  substitutionReview: null | { id: string; vendorOfferLineId: string; decision: 'approved' | 'rejected'; reason: string; reviewedByUserId: string; reviewedByName: string; reviewedAt: string };
};

export type VendorOffer = {
  id: string; vendorId: string; vendorName: string; vendorCode: string; vendorReference: string;
  currency: string; taxBasis: string; freightAmount: string; leadTimeDays: number | null;
  paymentTerms: string; warranty: string; validUntil: string | null; subtotal: string; total: string;
  status: 'submitted'; recordedByUserId: string; submittedAt: string; lines: VendorOfferLine[];
};

export type ProcurementWorkspace = {
  requisition: ProcurementRequisition & { boqRevisionId: string; notes: string | null; createdAt: string; buyerName: string; purchaseManagerName: string };
  lines: DemandLine[];
  activeVendors: Array<{ id: string; code: string; name: string }>;
  rfq: null | { id: string; rfqNumber: string; status: 'open' | 'selected' | 'cancelled'; responseDueDate: string; commercialTerms: string; rowVersion: number; createdAt: string };
  rfqLines: RfqLine[];
  invitedVendors: Array<{ id: string; code: string; name: string }>;
  offers: VendorOffer[];
  comparison: null | { id: string; status: 'open' | 'selected'; rowVersion: number; createdAt: string; updatedAt: string };
  selection: null | { id: string; selectedOfferId: string; selectionReason: string; singleSourceExceptionReason: string | null; selectedByUserId: string; selectedAt: string };
  capabilities: { canManageRfq: boolean; canRecordOffer: boolean; canSelect: boolean };
};

export type ProcurementCreateOptions = { projects: Array<{
  id: string; projectNumber: string; title: string;
  boqs: Array<{ id: string; revisionNumber: number; title: string; lines: Array<{ id: string; lineNumber: number; itemId: string; itemCode: string; itemName: string; specification: string; unitId: string; unitSymbol: string; quantity: string }> }>;
  managers: Array<{ id: string; name: string; email: string }>;
}> };

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type ListFilters = { search?: string; status?: RequisitionStatus; page: number; pageSize: number; sort: 'requisitionNumber' | 'title' | 'status' | 'requiredBy' | 'updatedAt'; direction: 'asc' | 'desc' };

export const procurementRequisitionsQuery = (filters: ListFilters) => queryOptions({
  queryKey: ['procurement', 'requisitions', filters] as const,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<Page<ProcurementRequisition>>>('/procurement/requisitions', { params: filters, signal })).data.data,
});

export const procurementCreateOptionsQuery = (enabled = true) => queryOptions({
  queryKey: ['procurement', 'requisitions', 'create-options'] as const,
  enabled,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<ProcurementCreateOptions>>('/procurement/requisitions/create-options', { signal })).data.data,
});

export const procurementWorkspaceQuery = (requisitionId?: string) => queryOptions({
  queryKey: ['procurement', 'requisitions', requisitionId] as const,
  enabled: Boolean(requisitionId),
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<ProcurementWorkspace>>(`/procurement/requisitions/${requisitionId}`, { signal })).data.data,
});

export async function createProcurementRequisition(input: { projectId: string; boqRevisionId: string; title: string; purchaseManagerUserId: string; requiredBy: string; deliveryLocation: string; notes?: string; lines: Array<{ boqLineId: string; quantity: string }> }) {
  return (await apiClient.post<ApiEnvelope<{ requisition: { id: string } }>>('/procurement/requisitions', input)).data.data.requisition;
}

export async function createProcurementRfq(requisitionId: string, input: { vendorIds: string[]; responseDueDate: string; commercialTerms: string; expectedVersion: number }) {
  return (await apiClient.post<ApiEnvelope<{ rfq: { id: string } }>>(`/procurement/requisitions/${requisitionId}/rfq`, input)).data.data.rfq;
}

export async function recordVendorOffer(requisitionId: string, input: { vendorId: string; vendorReference: string; currency: string; taxBasis: string; freightAmount: string; leadTimeDays?: number; paymentTerms: string; warranty: string; validUntil?: string; lines: Array<{ rfqLineId: string; unitRate: string; brandOffered: string; specificationOffered: string; equivalence: Equivalence; deviationNotes?: string }> }) {
  return (await apiClient.post<ApiEnvelope<{ offer: { id: string } }>>(`/procurement/requisitions/${requisitionId}/offers`, input)).data.data.offer;
}

export async function selectVendorOffer(requisitionId: string, input: { offerId: string; selectionReason: string; singleSourceExceptionReason?: string; expectedVersion: number }) {
  return (await apiClient.post<ApiEnvelope<{ selection: { id: string } }>>(`/procurement/requisitions/${requisitionId}/select`, input)).data.data.selection;
}

export type SubstitutionReviewQueueItem = {
  id: string; requisitionId: string; requisitionNumber: string; projectNumber: string; projectTitle: string;
  vendorName: string; itemName: string; itemCode: string; offeredBrand: string; equivalence: 'deviation' | 'unknown';
  status: 'pending' | 'approved' | 'rejected'; updatedAt: string;
};

export type SubstitutionReviewWorkspace = {
  context: { requisitionId: string; requisitionNumber: string; requisitionTitle: string; requisitionStatus: RequisitionStatus; projectId: string; projectNumber: string; projectTitle: string; designJobId: string; designTitle: string; buyerUserId: string; purchaseManagerUserId: string };
  items: Array<{ offerLineId: string; offerId: string; vendorName: string; vendorCode: string; vendorReference: string; lineNumber: number; itemCode: string; itemName: string; approvedSpecification: string; offeredBrand: string; offeredSpecification: string; equivalence: 'deviation' | 'unknown'; deviationNotes: string | null; recordedByUserId: string; decision: 'approved' | 'rejected' | null; reviewReason: string | null; reviewedByUserId: string | null; reviewedByName: string | null; reviewedAt: string | null }>;
  capabilities: { canReview: boolean };
};

export const substitutionReviewsQuery = (filters: { search?: string; status?: 'pending' | 'approved' | 'rejected'; page: number; pageSize: number; sort: 'requisitionNumber' | 'vendorName' | 'itemName' | 'status' | 'updatedAt'; direction: 'asc' | 'desc' }) => queryOptions({
  queryKey: ['procurement', 'substitution-reviews', filters] as const,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<Page<SubstitutionReviewQueueItem>>>('/procurement/substitution-reviews', { params: filters, signal })).data.data,
});

export const substitutionReviewWorkspaceQuery = (requisitionId?: string) => queryOptions({
  queryKey: ['procurement', 'substitution-reviews', requisitionId] as const,
  enabled: Boolean(requisitionId),
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<SubstitutionReviewWorkspace>>(`/procurement/substitution-reviews/${requisitionId}`, { signal })).data.data,
});

export async function reviewSubstitution(requisitionId: string, offerLineId: string, input: { decision: 'approved' | 'rejected'; reason: string }) {
  return (await apiClient.post<ApiEnvelope<{ review: { id: string } }>>(`/procurement/substitution-reviews/${requisitionId}/lines/${offerLineId}/decision`, input)).data.data.review;
}
