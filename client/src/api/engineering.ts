import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type DesignStatus = 'awaiting_designer' | 'authorized' | 'draft' | 'under_review' | 'returned' | 'internally_approved' | 'sent_to_customer' | 'customer_approved' | 'changes_requested' | 'paused' | 'cancelled' | 'abandoned';
export type RevisionStatus = 'draft' | 'submitted' | 'returned' | 'internally_approved' | 'sent_to_customer' | 'customer_approved' | 'changes_requested';

export type DesignJob = {
  id: string; leadId: string; opportunityId: string; leadNumber: string; title: string; status: DesignStatus;
  previousStatus?: string | null; closedReason?: string | null; closedAt?: string | null;
  designerUserId: string | null; designHeadUserId: string; designerName?: string | null; designHeadName?: string;
  designerIsOnLeave?: boolean | null; designHeadIsOnLeave?: boolean;
  authorizedByUserId?: string; authorizedByName?: string;
  lastModifiedByUserId?: string; lastModifiedByName?: string;
  customerName?: string; sectorId?: string; sectorName?: string;
  serviceCategoryId?: string; serviceCategoryName?: string;
  surveyRequested: boolean; authorizationNotes: string; authorizedAt: string; rowVersion: number; updatedAt: string;
  designerAssignedAt: string | null; designDueAt: string | null; bufferExtensionsUsed: number; designerCompletedAt: string | null;
};
export type DesignJobFilterOptions = {
  users: Array<{ id: string; name: string; email: string; isOnLeave: boolean }>;
  sectors: Array<{ id: string; name: string }>;
  serviceCategories: Array<{ id: string; name: string }>;
};
export type DesignJobSortField = 'title' | 'status' | 'updatedAt' | 'authorizedAt' | 'designDueAt' | 'customerName';
export type DesignDeadlineExtension = { id: string; sequenceNumber: number; previousDueAt: string; newDueAt: string; reason: string; requestedByUserId: string; createdAt: string };
export type DesignFile = {
  id: string; kind: 'cad' | 'pdf'; originalName: string; mimeType: string; sizeBytes: number; checksumSha256: string; createdAt: string;
};
export type DesignRevision = {
  id: string; revisionNumber: number; title: string; changeSummary: string; status: RevisionStatus;
  createdByUserId: string; submittedByUserId: string | null; submittedAt: string | null; rowVersion: number; createdAt: string; updatedAt: string;
  files: DesignFile[];
  review: null | { decision: 'approved' | 'returned'; reason: string | null; actorUserId: string; actedAt: string };
  customerDecision: null | { decision: 'approved' | 'changes_requested' | 'abandoned'; evidenceReference: string; notes: string | null; recordedByUserId: string; recordedAt: string };
};
export type SurveyFile = {
  id: string; originalName: string; mimeType: string; sizeBytes: number; checksumSha256: string;
  createdByUserId: string; createdAt: string;
};
export type SurveyRevision = {
  id: string; revisionNumber: number; title: string; changeSummary: string; surveyedOn: string;
  status: 'draft' | 'finalized'; createdByUserId: string; finalizedByUserId: string | null;
  finalizedAt: string | null; rowVersion: number; createdAt: string; updatedAt: string; files: SurveyFile[];
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const designJobsQuery = (filters: {
  search?: string;
  status?: DesignStatus;
  designerUserId?: string;
  designHeadUserId?: string;
  surveyRequested?: 'yes' | 'no';
  deadlineState?: 'overdue' | 'due_soon' | 'on_track' | 'completed' | 'unassigned';
  sectorId?: string;
  serviceCategoryId?: string;
  updatedByUserId?: string;
  authorizedFrom?: string;
  authorizedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  page: number;
  pageSize: number;
  sort: DesignJobSortField;
  direction: 'asc' | 'desc';
}) => queryOptions({
  queryKey: ['engineering', 'design-jobs', filters] as const,
  queryFn: async ({ signal }) => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''));
    const response = await apiClient.get<ApiEnvelope<Page<DesignJob>>>('/engineering/design-jobs', { params, signal });
    return response.data.data;
  },
});

export const designJobFilterOptionsQuery = queryOptions({
  queryKey: ['engineering', 'design-jobs', 'filter-options'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<DesignJobFilterOptions>>('/engineering/design-jobs/filter-options', { signal });
    return response.data.data;
  },
});

export const designJobQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ job: DesignJob; deadlineExtensions: DesignDeadlineExtension[]; surveyRevisions: SurveyRevision[]; revisions: DesignRevision[] }>>(`/engineering/design-jobs/${jobId}`, { signal });
    return response.data.data;
  },
});

export const eligibleDesignersQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId, 'eligible-designers'] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Array<{ id: string; name: string; email: string; isOnLeave?: boolean }> }>>(`/engineering/design-jobs/${jobId}/eligible-designers`, { signal });
    return response.data.data.items;
  },
});
export async function assignDesignEngineer(jobId: string, input: { designerUserId: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/assign-designer`, input);
}
export const eligibleDesignAssigneesQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId, 'eligible-assignees'] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{
      designHeads: Array<{ id: string; name: string; email: string; isOnLeave?: boolean }>;
      designers: Array<{ id: string; name: string; email: string; isOnLeave?: boolean }>;
    }>>(`/engineering/design-jobs/${jobId}/eligible-assignees`, { signal });
    return response.data.data;
  },
});
export async function reassignDesignJob(jobId: string, input: { designHeadUserId?: string; designerUserId?: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/reassign`, input);
}
export async function useDesignDeadlineBuffer(jobId: string, input: { reason: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/use-buffer`, input);
}

export async function createDesignRevision(jobId: string, input: { title: string; changeSummary: string; expectedJobVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions`, input);
}
export async function createSurveyRevision(jobId: string, input: { title: string; changeSummary: string; surveyedOn: string }) {
  const response = await apiClient.post<ApiEnvelope<{ revision: SurveyRevision }>>(`/engineering/design-jobs/${jobId}/surveys`, input);
  return response.data.data.revision;
}
export async function uploadSurveyFile(jobId: string, surveyRevisionId: string, file: File) {
  const body = new FormData(); body.append('file', file);
  await apiClient.post(`/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/files`, body);
}
export async function finalizeSurveyRevision(jobId: string, surveyRevisionId: string, expectedVersion: number) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/finalize`, { expectedVersion });
}
export function surveyFileUrl(jobId: string, surveyRevisionId: string, fileId: string) {
  return apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/files/${fileId}` });
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
export async function recordDesignCustomerDecision(jobId: string, revisionId: string, input: { decision: 'approved' | 'changes_requested' | 'abandoned'; evidenceReference: string; lossReason?: string; notes?: string; expectedVersion: number }) {
  // Match the API constraints before sending a decision; whitespace is not evidence.
  const payload = z.object({
    decision: z.enum(['approved', 'changes_requested', 'abandoned']),
    evidenceReference: z.string().trim()
      .min(3, 'Enter a traceable evidence reference of at least 3 characters.')
      .max(1_000, 'Evidence reference must be 1,000 characters or fewer.'),
    lossReason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1_000, 'Notes must be 1,000 characters or fewer.').optional(),
    expectedVersion: z.number().int().positive('The revision version is unavailable. Refresh and try again.'),
  }).parse(input);
  await apiClient.post(`/engineering/design-jobs/${jobId}/revisions/${revisionId}/customer-decision`, payload);
}
export function designFileUrl(jobId: string, revisionId: string, fileId: string) {
  return apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/revisions/${revisionId}/files/${fileId}` });
}

export type BoqLine = {
  id: string; lineNumber: number; sortOrder: number; section: string; itemId: string; itemCode: string; itemName: string;
  specification: string; categoryName: string; familyName: string | null; allowFractional: boolean;
  brand: string | null; model: string | null; unitId: string; unitSymbol: string;
  quantity: string; drawingReference: string | null; notes: string | null; rowVersion: number;
};
export type EstimateCategory = 'material' | 'labour' | 'transport' | 'subcontracting' | 'overhead' | 'wastage' | 'margin';
export const boqPdfUrl = (jobId: string, boqId: string) => apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/boqs/${boqId}/export.pdf` });
export type EstimateLine = {
  id: string; boqLineId: string | null; lineNumber: number; category: EstimateCategory; description: string;
  quantity: string; unitRate: string; lineTotal: string; notes: string | null; rowVersion: number;
  rateVersionId: string | null; offeringId: string | null; brandId: string | null; brandName: string | null;
  manufacturerModel: string | null; manufacturerSku: string | null; isPreferredOffering: boolean | null;
  supplyRate: string | null; labourRate: string | null; miscellaneousRate: string | null;
  markupPercent: string | null; markupAmount: string | null; quotedUnitRate: string | null;
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
  hasStaleRates?: boolean;
  staleLineIds?: string[];
  staleEstimateLineIds?: string[];
  reviews: Array<{ reviewStage: 'legacy' | 'purchase' | 'admin'; decision: 'approved' | 'returned'; reason: string | null; actorUserId: string; actedAt: string }>;
  canViewEstimate: boolean; canEditQuantity: boolean; canEditCosting: boolean; canPurchaseReview: boolean; canFinalReview: boolean; canReassignChain?: boolean;
};
export type BoqCatalogItem = {
  id: string; code: string; name: string; specification: string | null;
  categoryId: string; categoryName: string; familyId: string | null; familyName: string | null;
  unitId: string; unitName: string; unitSymbol: string; allowFractional: boolean;
};
export type BoqTemplateSummary = { id: string; sectorId: string; sectorName: string; name: string; itemCount: number };
export type BoqChainUser = { id: string; name: string; email: string; isOnLeave?: boolean };
export type BoqWorkspace = {
  job: DesignJob;
  eligibleDesignRevisions: Array<{ id: string; revisionNumber: number; title: string; status: 'customer_approved' }>;
  availableTemplates: BoqTemplateSummary[];
  canCreateBoq?: boolean;
  chainOptions?: { costingUsers: BoqChainUser[]; purchaseHeads: BoqChainUser[]; adminApprovers: BoqChainUser[] };
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
export async function saveBoqQuantitiesBatch(jobId: string, boqId: string, input: { expectedVersion: number; updates: Array<{ lineId: string; quantity: string }> }) {
  return (await apiClient.patch<ApiEnvelope<{ rowVersion: number; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines/quantities`, input)).data.data;
}
export async function reorderBoqLines(jobId: string, boqId: string, input: { expectedVersion: number; orderedLineIds: string[] }) {
  return (await apiClient.patch<ApiEnvelope<{ rowVersion: number; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines/reorder`, input)).data.data;
}
export async function applyBoqTemplate(jobId: string, boqId: string, input: { expectedVersion: number; templateId: string; mode: 'replace' | 'append' }) {
  return (await apiClient.post<ApiEnvelope<{ revision: BoqRevision; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/apply-template`, input)).data.data;
}
export async function addBoqLines(jobId: string, boqId: string, input: { expectedVersion: number; items: Array<{ itemId: string; section?: string; quantity?: string; drawingReference?: string; notes?: string }> }) {
  return (await apiClient.post<ApiEnvelope<{ rowVersion: number; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines`, input)).data.data;
}
export async function removeBoqLine(jobId: string, boqId: string, lineId: string, expectedVersion: number) {
  return (await apiClient.delete<ApiEnvelope<{ rowVersion: number; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines/${lineId}`, { data: { expectedVersion } })).data.data;
}
export async function bulkDeleteBoqLines(jobId: string, boqId: string, input: { expectedVersion: number; lineIds: string[] }) {
  return (await apiClient.post<ApiEnvelope<{ rowVersion: number; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines/bulk-delete`, input)).data.data;
}
export async function bulkUpdateBoqLines(jobId: string, boqId: string, input: { expectedVersion: number; lineIds: string[]; patch: { sectionName?: string; quantity?: string } }) {
  return (await apiClient.patch<ApiEnvelope<{ rowVersion: number; technicalLines: BoqLine[] }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/lines/bulk-update`, input)).data.data;
}
export async function bulkMarkupBoq(jobId: string, boqId: string, input: { expectedVersion: number; lineIds?: string[]; sectionName?: string; markupPercent: string }) {
  return (await apiClient.patch<ApiEnvelope<{ rowVersion: number; estimateLines: EstimateLine[]; estimateTotals: { byCategory: Record<string, string>; total: string } }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/costing/bulk-markup`, input)).data.data;
}
export async function refreshBoqCostingRates(jobId: string, boqId: string, expectedVersion: number) {
  return (await apiClient.post<ApiEnvelope<{ rowVersion: number; costingDate: string; estimateLines: EstimateLine[]; estimateTotals: { byCategory: Record<string, string>; total: string }; hasStaleRates: boolean }>>(`/engineering/design-jobs/${jobId}/boqs/${boqId}/costing/refresh-rates`, { expectedVersion })).data.data;
}
export async function saveBoqMarkup(jobId: string, boqId: string, line: EstimateLine, markupPercent: string, expectedBoqVersion: number) { await apiClient.patch(`/engineering/design-jobs/${jobId}/boqs/${boqId}/cost-lines/${line.id}/markup`, { markupPercent, expectedBoqVersion, expectedLineVersion: line.rowVersion }); }
export async function submitBoq(jobId: string, boqId: string, expectedVersion: number) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs/${boqId}/submit`, { expectedVersion }); }
export async function submitBoqCosting(jobId: string, boqId: string, expectedVersion: number) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs/${boqId}/submit-costing`, { expectedVersion }); }
export async function reviewBoq(jobId: string, boqId: string, stage: 'purchase' | 'final', input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }) { await apiClient.post(`/engineering/design-jobs/${jobId}/boqs/${boqId}/${stage === 'purchase' ? 'purchase-review' : 'final-review'}`, input); }
export async function reassignBoqChain(jobId: string, boqId: string, input: { expectedVersion: number; costingUserId: string; purchaseHeadUserId: string; adminApproverUserId: string }) {
  await apiClient.patch(`/engineering/design-jobs/${jobId}/boqs/${boqId}/reassign-chain`, input);
}
