import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type MasterStatus = 'active' | 'inactive';
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'design_authorized' | 'commercial_negotiation' | 'won' | 'lost' | 'on_hold';
export type CommercialState = 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold';
export type DuplicateHint = { type: 'customer' | 'lead'; id: string; label: string; reason: string };

export type ServiceCategory = {
  id: string; code: string; name: string; status: MasterStatus; rowVersion: number;
};
export type CustomerSummary = {
  id: string; displayName: string; legalName: string | null; status: MasterStatus;
  rowVersion: number; createdAt?: string; updatedAt: string;
};
export type CustomerContact = {
  id: string; name: string; jobTitle: string | null; phone: string | null; email: string | null;
  isPrimary: boolean; status: MasterStatus; rowVersion: number;
};
export type CustomerSite = {
  id: string; name: string; addressLine1: string; addressLine2: string | null; city: string;
  state: string | null; postalCode: string | null; country: string | null;
  status: MasterStatus; rowVersion: number;
};
export type CustomerDetail = CustomerSummary & {
  contacts: CustomerContact[];
  addresses: Array<{
    id: string; label: string; addressLine1: string; addressLine2: string | null; city: string;
    state: string | null; postalCode: string | null; country: string | null;
    status: MasterStatus; rowVersion: number;
  }>;
  sites: CustomerSite[];
};
export type Lead = {
  id: string; leadNumber: string; inquiryName: string; companyName: string | null;
  contactName: string; phone: string | null; email: string | null; source: string;
  stage: LeadStage; ownerUserId: string; rowVersion: number; updatedAt: string;
  serviceCategoryName?: string; address?: string | null; serviceCategoryId?: string;
  customerId?: string | null; primaryContactId?: string | null; siteId?: string | null;
  lostReason?: string | null; qualificationNotes?: string | null; createdAt?: string;
};
export type Opportunity = {
  id: string; leadId: string; leadNumber?: string; title: string; customerId: string;
  customerName?: string; siteId: string | null; commercialState: CommercialState;
  rowVersion: number; updatedAt: string;
};
export type Assignee = { id: string; name: string; email: string };

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
const compactParams = (input: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ''));

export const serviceCategoriesQuery = (includeInactive = false) => queryOptions({
  queryKey: ['crm', 'service-categories', { includeInactive }] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: ServiceCategory[] }>>('/crm/service-categories', {
      params: includeInactive ? { includeInactive: true } : undefined, signal,
    });
    return response.data.data.items;
  },
});

export const customersQuery = (filters: { search?: string; status?: MasterStatus; page?: number } = {}) => queryOptions({
  queryKey: ['crm', 'customers', filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<Page<CustomerSummary>>>('/crm/customers', {
      params: compactParams({ ...filters, page: filters.page ?? 1 }), signal,
    });
    return response.data.data;
  },
});

export const customerQuery = (id?: string) => queryOptions({
  queryKey: ['crm', 'customer', id] as const,
  enabled: Boolean(id),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ customer: CustomerDetail }>>(`/crm/customers/${id}`, { signal });
    return response.data.data.customer;
  },
});

export const leadsQuery = (filters: { search?: string; stage?: LeadStage; page?: number } = {}) => queryOptions({
  queryKey: ['crm', 'leads', filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<Page<Lead>>>('/crm/leads', {
      params: compactParams({ ...filters, page: filters.page ?? 1 }), signal,
    });
    return response.data.data;
  },
});

export const leadQuery = (id?: string) => queryOptions({
  queryKey: ['crm', 'lead', id] as const,
  enabled: Boolean(id),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ lead: Lead }>>(`/crm/leads/${id}`, { signal });
    return response.data.data.lead;
  },
});

export const assigneesQuery = queryOptions({
  queryKey: ['crm', 'assignees'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Assignee[] }>>('/crm/assignees', { signal });
    return response.data.data.items;
  },
});

export const opportunitiesQuery = (filters: { search?: string; state?: CommercialState; page?: number } = {}) => queryOptions({
  queryKey: ['crm', 'opportunities', filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<Page<Opportunity>>>('/crm/opportunities', {
      params: compactParams({ ...filters, page: filters.page ?? 1 }), signal,
    });
    return response.data.data;
  },
});

export async function createServiceCategory(input: { code: string; name: string }) {
  const response = await apiClient.post<ApiEnvelope<{ category: ServiceCategory }>>('/crm/service-categories', input);
  return response.data.data.category;
}

export type CreateCustomerInput = {
  displayName: string;
  legalName?: string;
  contacts: Array<{ name: string; jobTitle?: string; phone?: string; email?: string; isPrimary: boolean }>;
  addresses: Array<never>;
  sites: Array<{ name: string; addressLine1: string; city: string; state?: string; postalCode?: string; country?: string }>;
};

export async function createCustomer(input: CreateCustomerInput) {
  const response = await apiClient.post<ApiEnvelope<{ customer: CustomerDetail; duplicateHints: DuplicateHint[] }>>('/crm/customers', input);
  return response.data.data;
}

export async function addCustomerContact(customerId: string, input: {
  name: string; jobTitle?: string; phone?: string; email?: string; isPrimary: boolean;
}) {
  const response = await apiClient.post<ApiEnvelope<{ contact: CustomerContact }>>(`/crm/customers/${customerId}/contacts`, input);
  return response.data.data.contact;
}

export async function addCustomerSite(customerId: string, input: {
  name: string; addressLine1: string; city: string; state?: string; postalCode?: string; country?: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ site: CustomerSite }>>(`/crm/customers/${customerId}/sites`, input);
  return response.data.data.site;
}

export async function createLead(input: {
  inquiryName: string; companyName?: string; contactName: string; phone?: string; email?: string;
  address?: string; source: string; serviceCategoryId: string; ownerUserId?: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ lead: Lead; duplicateHints: DuplicateHint[] }>>('/crm/leads', input);
  return response.data.data;
}

export async function changeLeadStage(input: {
  leadId: string; expectedVersion: number; stage: 'contacted' | 'on_hold' | 'lost'; reason?: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ lead: Lead }>>(`/crm/leads/${input.leadId}/stage`, {
    expectedVersion: input.expectedVersion, stage: input.stage, reason: input.reason,
  });
  return response.data.data.lead;
}

export async function qualifyLead(input: {
  leadId: string; expectedVersion: number; customerId: string; primaryContactId: string;
  siteId?: string; title: string; qualificationNotes: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ opportunity: Opportunity; replayed: boolean }>>(
    `/crm/leads/${input.leadId}/qualify`, input,
  );
  return response.data.data;
}
