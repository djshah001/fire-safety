import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type MasterStatus = 'active' | 'inactive';
export type MasterSort = 'code' | 'name' | 'status' | 'updatedAt';
export type MasterFilters = {
  search?: string; status?: MasterStatus; page?: number; pageSize?: number;
  sort?: MasterSort; direction?: 'asc' | 'desc';
};
export type Unit = {
  id: string; code: string; name: string; symbol: string; allowFractional: boolean; status: MasterStatus;
  rowVersion: number; updatedAt: string;
};
export type ItemCategory = {
  id: string; code: string; name: string; status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type Brand = {
  id: string; code: string; name: string; status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type ItemFamily = {
  id: string; code: string; name: string; scopeDescription: string; categoryId: string; categoryName: string;
  defaultUnitId: string | null; defaultUnitName: string | null; defaultUnitSymbol: string | null;
  specifications: Array<{ key: string; label: string; valueType: 'text' | 'number' | 'boolean'; unitLabel: string | null; isRequired: boolean; sortOrder: number }>;
  status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type Item = {
  id: string; code: string; name: string; specification: string | null;
  familyId: string | null; familyName: string | null;
  model: string | null; specificationValues: Record<string, string | number | boolean>;
  categoryId: string; categoryName: string; unitId: string; unitName: string; unitSymbol: string;
  brands: Array<{ id: string; code: string; name: string; status: MasterStatus }>;
  status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type ItemRateVersion = {
  id: string; itemId: string; offeringId: string; currency: string; effectiveFrom: string; supplyRate: string;
  labourRate: string; miscellaneousRate: string; miscellaneousNote: string | null; createdAt: string;
};
export type ItemOffering = {
  id: string; itemId: string; brandId: string | null; brandCode: string | null; brandName: string | null;
  manufacturerModel: string; manufacturerSku: string | null; isPreferred: boolean;
  status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type VendorType =
  | 'material_supplier'
  | 'manufacturer'
  | 'distributor_dealer'
  | 'service_provider'
  | 'installation_contractor'
  | 'labour_contractor'
  | 'transport_logistics'
  | 'other';

export type VendorApprovalStatus = 'draft' | 'pending_approval' | 'active' | 'rejected';

export type VendorContact = {
  id: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  isPrimary: boolean;
  status: MasterStatus;
};

export type VendorAddress = {
  id: string;
  addressType: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type VendorBankAccount = {
  id: string;
  accountHolderName: string;
  accountNumber: string;
  accountNumberMasked?: string;
  ifscCode: string;
  bankName: string;
  branch: string | null;
  upiId: string | null;
  isDefault: boolean;
};

export type VendorDocument = {
  id: string;
  documentType: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
};

export type VendorPriceListItem = {
  id: string;
  vendorId: string;
  itemId: string | null;
  vendorProductCode: string | null;
  vendorProductName: string;
  description: string | null;
  unitRate: string;
  currency: string;
  leadTimeDays: number | null;
  minimumOrderQuantity: string;
  effectiveFrom: string;
  itemCode?: string | null;
  itemName?: string | null;
};

export type Vendor = {
  id: string;
  code: string;
  displayName: string;
  tradeName: string | null;
  vendorType: VendorType;
  supplierCategories: string[];
  website: string | null;
  companyDescription: string | null;
  legalName: string | null;
  gstStatus: 'registered' | 'unregistered';
  gstin: string | null;
  pan: string | null;
  taxIdentifier: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  brandsSupplied: string[];
  deliveryLocations: string | null;
  typicalLeadTimeDays: number | null;
  minimumOrderValue: string | null;
  paymentTerms: string | null;
  creditPeriodDays: number | null;
  creditLimit: string | null;
  preferredCurrency: string;
  assignedBuyerUserId: string | null;
  internalNotes: string | null;
  approvalStatus: VendorApprovalStatus;
  isArchived: boolean;
  approvedAt: string | null;
  status: MasterStatus;
  rowVersion: number;
  updatedAt: string;
  createdAt?: string;
  primaryContact: {
    id: string;
    name: string;
    jobTitle: string | null;
    phone: string | null;
    alternatePhone?: string | null;
    email: string | null;
  } | null;
  contacts?: VendorContact[];
  addresses?: VendorAddress[];
  bankAccounts?: VendorBankAccount[];
  documents?: VendorDocument[];
  priceList?: VendorPriceListItem[];
};

export type VendorInvitation = {
  id: string;
  token: string;
  whatsappNumber: string;
  contactName: string;
  companyName: string | null;
  status: string;
  expiresAt: string;
  registrationUrl: string;
  whatsappUrl: string;
  messageText: string;
  msg91Delivery?: {
    success: boolean;
    status: 'sent' | 'unconfigured' | 'failed';
    messageId?: string;
    error?: string;
  };
};

export type MasterPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type MasterResource = 'vendors' | 'items' | 'item-families' | 'item-categories' | 'brands' | 'units';

const compact = (input: MasterFilters) => Object.fromEntries(
  Object.entries(input).filter(([, value]) => value !== undefined && value !== ''),
);

export const masterListQuery = <T>(resource: MasterResource, filters: MasterFilters) => queryOptions({
  queryKey: ['masters', resource, filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<MasterPage<T>>>(`/masters/${resource}`, {
      params: compact({ ...filters, page: filters.page ?? 1 }), signal,
    });
    return response.data.data;
  },
});

export const masterLookupsQuery = (resource: 'units' | 'item-families' | 'item-categories' | 'brands' | 'items') => masterListQuery<Unit | ItemFamily | ItemCategory | Brand | Item>(resource, {
  status: 'active', page: 1, pageSize: 100, sort: 'name', direction: 'asc',
});

export const vendorLookupsQuery = () => masterListQuery<Vendor>('vendors', {
  status: 'active', page: 1, pageSize: 200, sort: 'name', direction: 'asc',
});

export const itemOfferingsQuery = (itemId?: string) => queryOptions({
  queryKey: ['masters', 'items', itemId, 'offerings'] as const,
  enabled: Boolean(itemId),
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<{ offerings: ItemOffering[] }>>(`/masters/items/${itemId}/offerings`, { signal })).data.data.offerings,
});

export const offeringRatesQuery = (itemId?: string, offeringId?: string) => queryOptions({
  queryKey: ['masters', 'items', itemId, 'offerings', offeringId, 'rates'] as const,
  enabled: Boolean(itemId && offeringId),
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<{ rates: ItemRateVersion[] }>>(`/masters/items/${itemId}/offerings/${offeringId}/rates`, { signal })).data.data.rates,
});

export async function createItemOffering(itemId: string, input: Record<string, unknown>) {
  await apiClient.post(`/masters/items/${itemId}/offerings`, input);
}

export async function updateItemOffering(itemId: string, offeringId: string, input: Record<string, unknown>) {
  await apiClient.put(`/masters/items/${itemId}/offerings/${offeringId}`, input);
}

export async function deactivateItemOffering(itemId: string, offeringId: string, expectedVersion: number, reason: string) {
  await apiClient.post(`/masters/items/${itemId}/offerings/${offeringId}/deactivate`, { expectedVersion, reason });
}

export async function createItemRate(itemId: string, offeringId: string, input: Record<string, unknown>) {
  await apiClient.post(`/masters/items/${itemId}/offerings/${offeringId}/rates`, input);
}

export async function createMaster(resource: MasterResource, input: Record<string, unknown>) {
  await apiClient.post(`/masters/${resource}`, input);
}

export async function updateMaster(resource: MasterResource, id: string, input: Record<string, unknown>) {
  await apiClient.put(`/masters/${resource}/${id}`, input);
}

export async function deactivateMaster(resource: MasterResource, id: string, expectedVersion: number, reason: string) {
  await apiClient.post(`/masters/${resource}/${id}/deactivate`, { expectedVersion, reason });
}

export const vendorDetailQuery = (id?: string) => queryOptions({
  queryKey: ['masters', 'vendors', id] as const,
  enabled: Boolean(id),
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<{ vendor: Vendor }>>(`/masters/vendors/${id}`, { signal })).data.data.vendor,
});

export const vendorPriceListQuery = (vendorId?: string) => queryOptions({
  queryKey: ['masters', 'vendors', vendorId, 'price-list'] as const,
  enabled: Boolean(vendorId),
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<{ items: VendorPriceListItem[] }>>(`/masters/vendors/${vendorId}/price-list`, { signal })).data.data.items,
});

export async function checkVendorDuplicates(input: { displayName?: string; gstin?: string; phone?: string; excludeVendorId?: string }) {
  const response = await apiClient.post<ApiEnvelope<{
    gstinMatch?: { id: string; code: string; displayName: string; gstin: string };
    nameMatches: Array<{ id: string; code: string; displayName: string }>;
    phoneMatches: Array<{ id: string; code: string; displayName: string; contactPhone: string }>;
    hasWarnings: boolean;
    hasBlockingDuplicate: boolean;
  }>>('/masters/vendors/check-duplicates', input);
  return response.data.data;
}

export async function createVendor(input: Record<string, unknown>) {
  const response = await apiClient.post<ApiEnvelope<{ vendor: Vendor }>>('/masters/vendors', input);
  return response.data.data.vendor;
}

export async function updateVendor(id: string, input: Record<string, unknown>) {
  const response = await apiClient.put<ApiEnvelope<{ vendor: Vendor }>>(`/masters/vendors/${id}`, input);
  return response.data.data.vendor;
}

export async function archiveVendor(id: string, expectedVersion: number, reason?: string) {
  const response = await apiClient.post<ApiEnvelope<{ vendor: Vendor }>>(`/masters/vendors/${id}/archive`, { expectedVersion, reason });
  return response.data.data.vendor;
}

export async function approveVendor(id: string, expectedVersion: number) {
  const response = await apiClient.post<ApiEnvelope<{ vendor: Vendor }>>(`/masters/vendors/${id}/approve`, { expectedVersion });
  return response.data.data.vendor;
}

export async function createVendorInvitation(input: {
  whatsappNumber: string;
  contactName: string;
  companyName?: string;
  validDays?: number;
  sendViaMsg91?: boolean;
}) {
  const response = await apiClient.post<ApiEnvelope<{ invitation: VendorInvitation }>>('/masters/vendors/invitations', input);
  return response.data.data.invitation;
}

export async function sendVendorInvitationMsg91(invitationId: string) {
  const response = await apiClient.post<ApiEnvelope<{
    result: {
      success: boolean;
      status: 'sent' | 'unconfigured' | 'failed';
      messageId?: string;
      error?: string;
    };
  }>>(`/masters/vendors/invitations/${invitationId}/send-msg91`);
  return response.data.data.result;
}

export async function createVendorPriceListItem(vendorId: string, input: Record<string, unknown>) {
  const response = await apiClient.post<ApiEnvelope<{ item: VendorPriceListItem }>>(`/masters/vendors/${vendorId}/price-list`, input);
  return response.data.data.item;
}

export async function updateVendorPriceListItem(vendorId: string, priceListId: string, input: Record<string, unknown>) {
  const response = await apiClient.put<ApiEnvelope<{ item: VendorPriceListItem }>>(`/masters/vendors/${vendorId}/price-list/${priceListId}`, input);
  return response.data.data.item;
}

export async function deleteVendorPriceListItem(vendorId: string, priceListId: string) {
  await apiClient.delete(`/masters/vendors/${vendorId}/price-list/${priceListId}`);
}

export async function uploadVendorDocument(vendorId: string, documentType: string, file: File) {
  const formData = new FormData();
  formData.append('documentType', documentType);
  formData.append('file', file);
  const response = await apiClient.post<ApiEnvelope<{ document: VendorDocument }>>(`/masters/vendors/${vendorId}/documents`, formData);
  return response.data.data.document;
}

export async function deleteVendorDocument(vendorId: string, documentId: string) {
  await apiClient.delete(`/masters/vendors/${vendorId}/documents/${documentId}`);
}

// Public Vendor Onboarding APIs
export const publicOnboardingInvitationQuery = (token?: string) => queryOptions({
  queryKey: ['public-onboarding', token] as const,
  enabled: Boolean(token),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{
      status: 'pending' | 'submitted' | 'expired';
      invitation: { contactName: string; companyName: string | null; whatsappNumber: string };
    }>>(`/vendor-onboarding/${token}`, { signal });
    return response.data.data;
  },
});

export async function submitPublicOnboarding(token: string, input: Record<string, unknown>) {
  const response = await apiClient.post<ApiEnvelope<{ success: boolean; vendorId: string; code: string; displayName: string }>>(`/vendor-onboarding/${token}/submit`, input);
  return response.data.data;
}

export async function uploadPublicOnboardingDocument(token: string, documentType: string, file: File) {
  const formData = new FormData();
  formData.append('documentType', documentType);
  formData.append('file', file);
  const response = await apiClient.post<ApiEnvelope<{ document: VendorDocument }>>(`/vendor-onboarding/${token}/documents`, formData);
  return response.data.data.document;
}

// Master Bulk Import Types & APIs (Items & Vendors)
export type MasterImportType = 'items' | 'vendors';
export type MasterImportBatchStatus = 'staged' | 'committing' | 'completed' | 'cancelled';
export type MasterImportRowStatus = 'valid' | 'invalid' | 'created' | 'failed';
export type MasterImportIssue = { field?: string; message: string };

export type MasterImportRow = {
  id: string;
  rowNumber: number;
  payload: Record<string, string | null>;
  issues: MasterImportIssue[];
  warnings: MasterImportIssue[];
  status: MasterImportRowStatus;
  createdRecordId: string | null;
  resultMessage: string | null;
};

export type MasterImportBatch = {
  id: string;
  type: MasterImportType;
  status: MasterImportBatchStatus;
  originalName: string;
  checksumSha256: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowVersion: number;
  createdAt: string;
  committedAt: string | null;
  rows: MasterImportRow[];
};

export async function downloadMasterImportTemplate(type: MasterImportType) {
  const response = await apiClient.get<Blob>(`/masters/imports/${type}/template`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fire-safety-${type}-import.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function stageMasterImport(type: MasterImportType, file: File) {
  const data = new FormData();
  data.append('file', file);
  const response = await apiClient.post<ApiEnvelope<{ batch: MasterImportBatch }>>(
    `/masters/imports/${type}/stage`,
    data,
  );
  return response.data.data.batch;
}

export async function commitMasterImport(batch: MasterImportBatch) {
  const response = await apiClient.post<ApiEnvelope<{ batch: MasterImportBatch }>>(
    `/masters/imports/${batch.id}/commit`,
    { expectedVersion: batch.rowVersion },
  );
  return response.data.data.batch;
}
