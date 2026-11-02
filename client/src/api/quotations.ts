import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';
import type { DesignJob } from '@/api/engineering';

export type QuotationStatus = 'draft' | 'submitted' | 'returned' | 'approved' | 'issued' | 'accepted' | 'declined';

export type QuotationDocumentDetails = {
  senderName?: string; senderTagline?: string; senderAddress?: string; senderContact?: string; senderGstin?: string;
  recipientAddress?: string; recipientGstin?: string; documentDate?: string;
  recipientContact?: string; recipientPhone?: string;
  bankDetails?: string; signatory?: string;
};

export type QuotationQueueItem = {
  jobId: string;
  jobTitle: string;
  leadNumber: string;
  opportunityCommercialState: 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold';
  quotationId: string | null;
  quotationNumber: string | null;
  revisionId: string | null;
  revisionNumber: number | null;
  status: QuotationStatus | null;
  currency: string | null;
  grandTotal: string | null;
  updatedAt: string | null;
};

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const quotationQueueQuery = (filters: {
  search?: string;
  status?: QuotationStatus;
  page: number;
  pageSize: number;
  sort: 'quotationNumber' | 'title' | 'status' | 'updatedAt' | 'grandTotal';
  direction: 'asc' | 'desc';
}) => queryOptions({
  queryKey: ['engineering', 'quotations', filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<Page<QuotationQueueItem>>>('/engineering/quotations', { params: filters, signal });
    return response.data.data;
  },
});

export type QuotationLine = {
  id: string;
  boqLineId: string;
  lineNumber: number;
  section: string;
  itemCode: string;
  itemName: string;
  specification: string;
  offeringId: string | null;
  boqCostOptionId: string | null;
  brandId: string | null;
  brandName: string | null;
  manufacturerModel: string | null;
  manufacturerSku: string | null;
  offeringOptions: Array<{ id: string; costOptionId: string; brandId: string | null; brandName: string | null; manufacturerModel: string; manufacturerSku: string | null; isPreferred: boolean; supplyRate: string; labourRate: string; miscellaneousRate: string; markupPercent: string; markupAmount: string; quotedUnitRate: string; lineTotal: string }>;
  unitSymbol: string;
  quantity: string;
  unitRate: string;
  supplyRate: string; labourRate: string; miscellaneousRate: string; markupPercent: string;
  markupAmount: string; quotedUnitRate: string;
  discountAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  notes: string | null;
  rowVersion: number;
};

export type QuotationRevision = {
  documentDetails: QuotationDocumentDetails;
  id: string;
  quotationId: string;
  boqRevisionId: string;
  revisionNumber: number;
  status: QuotationStatus;
  title: string;
  customerName: string;
  currency: string;
  validityDays: number;
  exclusions: string;
  deliveryTerms: string;
  paymentTerms: string;
  taxLabel: string | null;
  subtotal: string;
  lineDiscountTotal: string;
  additionalDiscount: string;
  taxAmount: string;
  roundingAdjustment: string;
  grandTotal: string;
  paymentPlan?: null | { cashPercentage: string; nonCashPercentage: string };
  createdByUserId: string;
  submittedByUserId: string | null;
  submittedAt: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  issuedByUserId: string | null;
  issuedAt: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
  lines: QuotationLine[];
  isContributor: boolean;
  review: null | { decision: 'approved' | 'returned'; reason: string | null; actorUserId: string; actedAt: string };
  issueDocument: null | { id: string; originalName: string; mimeType: string; sizeBytes: number; templateVersion: string; isDemo: boolean; createdAt: string };
  customerDecision: null | { decision: 'accepted' | 'declined'; evidenceReference: string; customerOrderReference: string | null; notes: string | null; recordedByUserId: string; recordedAt: string };
};

export type QuotationWorkspace = {
  defaults: { validityDays: number; exclusions: string; deliveryTerms: string; paymentTerms: string };
  job: DesignJob;
  context: { jobId: string; jobTitle: string; opportunityId: string; opportunityCommercialState: string; leadId: string; leadNumber: string; leadStage: string; customerId: string; customerName: string };
  quotation: null | { id: string; quotationNumber: string; createdAt: string };
  eligibleBoqs: Array<{ id: string; revisionNumber: number; title: string; designRevisionId: string }>;
  revisions: QuotationRevision[];
  capabilities: { canWrite: boolean; canApprove: boolean; canOverrideApprovals: boolean; canIssue: boolean; canRecordDecision: boolean; canViewPaymentPlan: boolean; canWritePaymentPlan: boolean };
  documentMode: 'demo';
};

export const quotationWorkspaceQuery = (jobId?: string) => queryOptions({
  queryKey: ['engineering', 'design-job', jobId, 'quotations'] as const,
  enabled: Boolean(jobId),
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<QuotationWorkspace>>(`/engineering/design-jobs/${jobId}/quotations`, { signal });
    return response.data.data;
  },
});

export async function createQuotationRevision(jobId: string, input: { boqRevisionId: string; sourceRevisionId?: string; title: string; exclusions: string; deliveryTerms: string; paymentTerms: string }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/quotations`, input);
}

export async function updateQuotationHeader(jobId: string, revisionId: string, input: { title: string; validityDays: number; exclusions: string; deliveryTerms: string; paymentTerms: string; additionalDiscount: string; taxLabel?: string; taxAmount: string; roundingAdjustment: string; expectedVersion: number }) {
  await apiClient.patch(`/engineering/design-jobs/${jobId}/quotations/${revisionId}`, input);
}

export const quotationPreviewUrl = (jobId: string, revisionId: string) => apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/quotations/${revisionId}/preview.pdf` });

export async function updateQuotationDocumentDetails(jobId: string, revisionId: string, details: QuotationDocumentDetails, expectedVersion: number) {
  await apiClient.patch(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/document-details`, { details, expectedVersion });
}

export async function updateQuotationLine(jobId: string, revisionId: string, lineId: string, input: { offeringId: string; notes?: string; expectedRevisionVersion: number; expectedLineVersion: number }) {
  await apiClient.patch(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/lines/${lineId}`, input);
}

export async function updateQuotationPaymentPlan(jobId: string, revisionId: string, input: { cashPercentage: string; nonCashPercentage: string; expectedVersion: number }) {
  await apiClient.patch(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/payment-plan`, input);
}

export async function submitQuotation(jobId: string, revisionId: string, expectedVersion: number) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/submit`, { expectedVersion });
}

export async function reviewQuotation(jobId: string, revisionId: string, input: { decision: 'approved' | 'returned'; reason?: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/review`, input);
}

export async function issueQuotation(jobId: string, revisionId: string, expectedVersion: number) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/issue`, { expectedVersion });
}

export async function recordQuotationDecision(jobId: string, revisionId: string, input: { decision: 'accepted' | 'declined'; evidenceReference: string; customerOrderReference?: string; notes?: string; expectedVersion: number }) {
  await apiClient.post(`/engineering/design-jobs/${jobId}/quotations/${revisionId}/customer-decision`, input);
}

export function quotationDocumentUrl(jobId: string, revisionId: string, documentId: string) {
  return apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/quotations/${revisionId}/documents/${documentId}` });
}

export function quotationExcelUrl(jobId: string, revisionId: string) {
  return apiClient.getUri({ url: `/engineering/design-jobs/${jobId}/quotations/${revisionId}/export.xlsx` });
}
