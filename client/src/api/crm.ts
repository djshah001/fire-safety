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
export type CrmActivity = {
  id: string; type: 'call' | 'meeting' | 'note'; summary: string; occurredAt: string;
  createdAt: string; createdByUserId: string; createdByName: string;
};
export type Reminder = {
  id: string; ruleId: string; leadId?: string; leadNumber?: string; leadName?: string;
  title: string; assigneeUserId?: string; assigneeName?: string; dueAt: string; timezone: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly'; status: 'pending' | 'completed' | 'cancelled';
  rowVersion: number; completedAt: string | null;
};
export type LeadAttachment = {
  id: string; originalName: string; mimeType: string; sizeBytes: number; checksumSha256: string;
  createdByUserId: string; createdByName: string; createdAt: string;
};
export type CrmImportType = 'customers' | 'open_leads';
export type CrmImportIssue = { field?: string; message: string };
export type CrmImportRow = {
  id: string;
  rowNumber: number;
  payload: Record<string, string | null>;
  issues: CrmImportIssue[];
  warnings: CrmImportIssue[];
  status: 'valid' | 'invalid' | 'created' | 'failed';
  createdRecordId: string | null;
  resultMessage: string | null;
};
export type CrmImportBatch = {
  id: string;
  type: CrmImportType;
  status: 'staged' | 'committing' | 'completed' | 'cancelled';
  originalName: string;
  checksumSha256: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowVersion: number;
  createdAt: string;
  committedAt: string | null;
  rows: CrmImportRow[];
};

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

export const customersQuery = (filters: { search?: string; status?: MasterStatus; page?: number; pageSize?: number; sort?: 'name' | 'status' | 'updatedAt'; direction?: 'asc' | 'desc' } = {}) => queryOptions({
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

export const leadsQuery = (filters: { search?: string; stage?: LeadStage; page?: number; pageSize?: number; sort?: 'leadNumber' | 'inquiryName' | 'stage' | 'updatedAt'; direction?: 'asc' | 'desc' } = {}) => queryOptions({
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

export const activitiesQuery = (leadId?: string) => queryOptions({
  queryKey: ['crm', 'lead', leadId, 'activities'] as const,
  enabled: Boolean(leadId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: CrmActivity[] }>>(`/crm/leads/${leadId}/activities`, { signal });
    return response.data.data.items;
  },
});

export const leadRemindersQuery = (leadId?: string) => queryOptions({
  queryKey: ['crm', 'lead', leadId, 'reminders'] as const,
  enabled: Boolean(leadId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Reminder[] }>>(`/crm/leads/${leadId}/reminders`, { signal });
    return response.data.data.items;
  },
});

export const attachmentsQuery = (leadId?: string) => queryOptions({
  queryKey: ['crm', 'lead', leadId, 'attachments'] as const,
  enabled: Boolean(leadId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: LeadAttachment[] }>>(`/crm/leads/${leadId}/attachments`, { signal });
    return response.data.data.items;
  },
});

export const remindersQuery = (filters: { search?: string; status?: Reminder['status']; page?: number; pageSize?: number; sort?: 'dueAt' | 'title' | 'status'; direction?: 'asc' | 'desc' } = {}) => queryOptions({
  queryKey: ['crm', 'reminders', filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<Page<Reminder>>>('/crm/reminders', {
      params: compactParams({ ...filters, page: filters.page ?? 1 }), signal,
    });
    return response.data.data;
  },
});

export const assigneesQuery = queryOptions({
  queryKey: ['crm', 'assignees'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Assignee[] }>>('/crm/assignees', { signal });
    return response.data.data.items;
  },
});

export const opportunitiesQuery = (filters: { search?: string; state?: CommercialState; page?: number; pageSize?: number; sort?: 'title' | 'customerName' | 'state' | 'updatedAt'; direction?: 'asc' | 'desc' } = {}) => queryOptions({
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

export async function bulkAssignLeads(input: {
  targets: Array<{ id: string; expectedVersion: number }>;
  assigneeUserId: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ selected: number; updated: number; unchanged: number }>>(
    '/crm/leads/bulk/assign', input,
  );
  return response.data.data;
}

export async function bulkCreateReminders(input: {
  targets: Array<{ id: string; expectedVersion: number }>;
  title: string;
  assigneeUserId?: string;
  timezone: string;
  dueAt: string;
  recurrence: Reminder['recurrence'];
}) {
  const response = await apiClient.post<ApiEnvelope<{ created: number }>>('/crm/leads/bulk/reminders', input);
  return response.data.data;
}

export async function downloadImportTemplate(type: CrmImportType) {
  const response = await apiClient.get<Blob>(`/crm/imports/${type}/template`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fire-safety-${type}-import.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function stageCrmImport(type: CrmImportType, file: File) {
  const data = new FormData();
  data.append('file', file);
  const response = await apiClient.post<ApiEnvelope<{ batch: CrmImportBatch }>>(
    `/crm/imports/${type}/stage`, data,
  );
  return response.data.data.batch;
}

export async function commitCrmImport(batch: CrmImportBatch) {
  const response = await apiClient.post<ApiEnvelope<{ batch: CrmImportBatch }>>(
    `/crm/imports/${batch.id}/commit`,
    { expectedVersion: batch.rowVersion },
  );
  return response.data.data.batch;
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

export async function createActivity(leadId: string, input: { type: CrmActivity['type']; summary: string; occurredAt: string }) {
  const response = await apiClient.post<ApiEnvelope<{ activity: CrmActivity }>>(`/crm/leads/${leadId}/activities`, input);
  return response.data.data.activity;
}

export async function createReminder(leadId: string, input: {
  title: string; assigneeUserId?: string; timezone: string; dueAt: string; recurrence: Reminder['recurrence'];
}) {
  const response = await apiClient.post<ApiEnvelope<{ reminder: Reminder }>>(`/crm/leads/${leadId}/reminders`, input);
  return response.data.data.reminder;
}

export async function completeReminder(reminder: Reminder) {
  const response = await apiClient.post<ApiEnvelope<{ reminder: Reminder }>>(`/crm/reminders/${reminder.id}/complete`, {
    expectedVersion: reminder.rowVersion,
  });
  return response.data.data.reminder;
}

export async function uploadLeadAttachment(leadId: string, file: File) {
  const data = new FormData();
  data.append('file', file);
  const response = await apiClient.post<ApiEnvelope<{ attachment: LeadAttachment }>>(`/crm/leads/${leadId}/attachments`, data);
  return response.data.data.attachment;
}

export async function downloadLeadAttachment(leadId: string, attachment: LeadAttachment) {
  const response = await apiClient.get<Blob>(`/crm/leads/${leadId}/attachments/${attachment.id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.originalName;
  link.click();
  URL.revokeObjectURL(url);
}
