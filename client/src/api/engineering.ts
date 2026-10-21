import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type DesignStatus = 'awaiting_designer' | 'authorized' | 'draft' | 'under_review' | 'returned' | 'internally_approved' | 'sent_to_customer' | 'customer_approved' | 'changes_requested';
export type RevisionStatus = 'draft' | 'submitted' | 'returned' | 'internally_approved' | 'sent_to_customer' | 'customer_approved' | 'changes_requested';

export type DesignJob = {
  id: string; leadId: string; opportunityId: string; leadNumber: string; title: string; status: DesignStatus;
  designerUserId: string | null; designHeadUserId: string; designerName?: string | null; designHeadName?: string;
  surveyRequested: boolean; authorizationNotes: string; authorizedAt: string; rowVersion: number; updatedAt: string;
  designerAssignedAt: string | null; designDueAt: string | null; bufferExtensionsUsed: number; designerCompletedAt: string | null;
};
export type DesignDeadlineExtension = { id: string; sequenceNumber: number; previousDueAt: string; newDueAt: string; reason: string; requestedByUserId: string; createdAt: string };
export type DesignFile = {
  id: string; kind: 'cad' | 'pdf'; originalName: string; mimeType: string; sizeBytes: number; checksumSha256: string; createdAt: string;
};
export type DesignRevision = {
  id: string; revisionNumber: number; title: string; changeSummary: string; status: RevisionStatus;
  createdByUserId: string; submittedByUserId: string | null; submittedAt: string | null; rowVersion: number; createdAt: string; updatedAt: string;
  files: DesignFile[];
  review: null | { decision: 'approved' | 'returned'; reason: string | null; actorUserId: string; actedAt: string };
  customerDecision: null | { decision: 'approved' | 'changes_requested'; evidenceReference: string; notes: string | null; recordedByUserId: string; recordedAt: string };
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const designJobsQuery = (filters: { search?: string; status?: DesignStatus; page: number; pageSize: number; sort: 'title' | 'status' | 'updatedAt'; direction: 'asc' | 'desc' }) => queryOptions({
  queryKey: ['engineering', 'design-jobs', filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<Page<DesignJob>>>('/engineering/design-jobs', { params: filters, signal });
    return response.data.data;
  },
});

export const designJobQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ job: DesignJob; deadlineExtensions: DesignDeadlineExtension[]; revisions: DesignRevision[] }>>(`/engineering/design-jobs/${jobId}`, { signal });
    return response.data.data;
  },
});

export const eligibleDesignersQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId, 'eligible-designers'] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Array<{ id: string; name: string; email: string }> }>>(`/engineering/design-jobs/${jobId}/eligible-designers`, { signal });
    return response.data.data.items;
  },
});
export async function assignDesignEngineer(jobId: string, input: { designerUserId: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/assign-designer`, input);
}
export async function useDesignDeadlineBuffer(jobId: string, input: { reason: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/use-buffer`, input);
}

export async function createDesignRevision(jobId: string, input: { title: string; changeSummary: string; expectedJobVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions`, input);
}
export async function uploadDesignFile(jobId: string, revisionId: string, kind: 'cad' | 'pdf', file: File) {
  const body = new FormData(); body.append('file', file);
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions/${revisionId}/files/${kind}`, body);
}
export async function submitDesignRevision(jobId: string, revisionId: string, expectedVersion: number) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions/${revisionId}/submit`, { expectedVersion });
}
export async function reviewDesignRevision(jobId: string, revisionId: string, input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions/${revisionId}/review`, input);
}
export async function sendDesignToCustomer(jobId: string, revisionId: string, expectedVersion: number) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions/${revisionId}/send-to-customer`, { expectedVersion });
}
export async function recordDesignCustomerDecision(jobId: string, revisionId: string, input: { decision: 'approved' | 'changes_requested'; evidenceReference: string; notes?: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions/${revisionId}/customer-decision`, input);
}
export function designFileUrl(jobId: string, revisionId: string, fileId: string) {
  return apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/revisions/${revisionId}/files/${fileId}` });
}

export type BoqLine = {
  id: string; lineNumber: number; section: string; itemId: string; itemCode: string; itemName: string;
  specification: string; brand: string | null; model: string | null; unitId: string; unitSymbol: string;
  quantity: string; drawingReference: string | null; notes: string | null; rowVersion: number;
};
export type EstimateCategory = 'material' | 'labour' | 'transport' | 'subcontracting' | 'overhead' | 'wastage' | 'margin';
export type EstimateLine = {
  id: string; boqLineId: string | null; lineNumber: number; category: EstimateCategory; description: string;
  quantity: string; unitRate: string; lineTotal: string; notes: string | null; rowVersion: number;
};
export type BoqRevision = {
  id: string; designRevisionId: string; revisionNumber: number; title: string; changeSummary: string;
  status: 'draft' | 'submitted' | 'costing' | 'purchase_review' | 'admin_review' | 'returned' | 'approved'; estimateCurrency: string;
  createdByUserId: string; submittedByUserId: string | null; submittedAt: string | null; rowVersion: number;
  templateId: string | null; templateNameSnapshot: string | null; costingUserId: string | null;
  purchaseHeadUserId: string | null; adminApproverUserId: string | null;
  technicalLines: BoqLine[];
  estimateLines?: EstimateLine[];
  estimateTotals?: { byCategory: Record<string, string>; total: string };
  reviews: Array<{ reviewStage: 'legacy' | 'purchase' | 'admin'; decision: 'approved' | 'returned'; reason: string | null; actorUserId: string; actedAt: string }>;
  canViewEstimate: boolean; canEditQuantity: boolean; canEditCosting: boolean; canPurchaseReview: boolean; canFinalReview: boolean;
};
export type BoqCatalogItem = { id: string; code: string; name: string; specification: string | null; unitId: string; unitName: string; unitSymbol: string };
export type BoqWorkspace = {
  job: DesignJob;
  eligibleDesignRevisions: Array<{ id: string; revisionNumber: number; title: string; status: 'customer_approved' }>;
  boqs: BoqRevision[];
};

export type BoqTemplate = {
  id: string; sectorId: string; sectorName: string; name: string; costingUserId: string; costingUserName: string;
  purchaseHeadUserId: string; purchaseHeadUserName: string; adminApproverUserId: string; adminApproverUserName: string;
  status: 'active' | 'inactive'; rowVersion: number; updatedAt: string;
  items: Array<{ id: string; itemId: string; section: string; sortOrder: number; itemCode: string; itemName: string; unitSymbol: string }>;
};
export type BoqTemplateOptions = {
  sectors: Array<{ id: string; name: string; code: string; status: 'active' | 'inactive'; rowVersion: number }>;
  items: BoqCatalogItem[];
  costingUsers: Array<{ id: string; name: string; email: string }>;
  purchaseHeads: Array<{ id: string; name: string; email: string }>;
  adminApprovers: Array<{ id: string; name: string; email: string }>;
};

export const boqWorkspaceQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId, 'boqs'] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<BoqWorkspace>>(`/engineering/design-jobs/${jobId}/boqs`, { signal });
    return response.data.data;
  },
});

export const boqCatalogQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId, 'boq-items'] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: BoqCatalogItem[] }>>(`/engineering/design-jobs/${jobId}/boq-items`, { signal });
    return response.data.data.items;
  },
});

export const boqTemplatesQuery = queryOptions({
  queryKey: ['engineering', 'boq-templates'] as const,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<{ items: BoqTemplate[] }>>('/engineering/boq-templates', { signal })).data.data.items,
});
export const boqTemplateOptionsQuery = queryOptions({
  queryKey: ['engineering', 'boq-templates', 'options'] as const,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<BoqTemplateOptions>>('/engineering/boq-templates/options', { signal })).data.data,
});
export async function saveBoqTemplate(templateId: string | undefined, input: { sectorId: string; name: string; costingUserId: string; purchaseHeadUserId: string; adminApproverUserId: string; expectedVersion?: number; items: Array<{ itemId: string; section: string }> }) {
  await apiClient.request({ method: templateId ? 'patch' : 'post', url: `/engineering/boq-templates${templateId ? `/${templateId}` : ''}`, data: input });
}

export async function createBoqRevision(jobId: string, input: { designRevisionId: string; sourceBoqRevisionId?: string; title: string; changeSummary: string }) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs`, input); }
export async function saveBoqQuantity(jobId: string, boqId: string, line: BoqLine, quantity: string, expectedBoqVersion: number) { await apiClient.patch(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines/${line.id}`, { quantity, expectedBoqVersion, expectedLineVersion: line.rowVersion }); }
export async function saveEstimateLine(jobId: string, boqId: string, lineId: string | undefined, input: { boqLineId?: string; category: EstimateCategory; description: string; quantity: string; unitRate: string; notes?: string; expectedBoqVersion: number; expectedLineVersion?: number }) { await apiClient.request({ method: lineId ? 'patch' : 'post', url: `/engineering/design-jobs/${jobId}/boqs/${boqId}/estimate-lines${lineId ? `/${lineId}` : ''}`, data: input }); }
export async function deleteEstimateLine(jobId: string, boqId: string, line: EstimateLine, expectedBoqVersion: number) { await apiClient.delete(`/engineering/design-jobs/${jobId}/boqs/${boqId}/estimate-lines/${line.id}`, { data: { expectedBoqVersion, expectedLineVersion: line.rowVersion } }); }
export async function submitBoq(jobId: string, boqId: string, expectedVersion: number) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs/${boqId}/submit`, { expectedVersion }); }
export async function submitBoqCosting(jobId: string, boqId: string, expectedVersion: number) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs/${boqId}/submit-costing`, { expectedVersion }); }
export async function reviewBoq(jobId: string, boqId: string, stage: 'purchase' | 'final', input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs/${boqId}/${stage === 'purchase' ? 'purchase-review' : 'final-review'}`, input); }
