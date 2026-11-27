import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type ProjectStatus = 'started' | 'on_hold' | 'completed' | 'cancelled';
export type CommercialState = 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold';
export type Project = { id: string; projectNumber: string; title: string; status: ProjectStatus; startDate: string; targetCompletionDate: string; rowVersion: number; commercialState: CommercialState; customerName: string; siteName: string; updatedAt: string };
export type ProjectDetail = { project: Project & { opportunityId: string; customerId: string; siteId: string; startReason: string; startedByUserId: string; createdAt: string }; members: Array<{ userId: string; role: string; name: string; email: string; createdAt: string }>; designBaseline: null | { id: string; designJobId: string; designRevisionId: string; designRevisionNumber: number; designTitle: string; boqRevisionId: string | null; customerEvidence: string; createdAt: string }; commercialBaseline: null | { id: string; quotationRevisionId: string; quotationRevisionNumber: number; customerEvidence: string; customerOrderReference: string | null; acceptedAt: string } };
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const projectsQuery = (filters: { search?: string; status?: ProjectStatus; commercialState?: CommercialState; page: number; pageSize: number; sort: 'projectNumber' | 'title' | 'status' | 'startDate' | 'targetCompletionDate'; direction: 'asc' | 'desc' }) => queryOptions({ queryKey: ['projects', 'list', filters] as const, queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<Page<Project>>>('/projects', { params: filters, signal })).data.data });
export const projectQuery = (projectId?: string) => queryOptions({ queryKey: ['projects', 'detail', projectId] as const, enabled: Boolean(projectId), queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<ProjectDetail>>(`/projects/${projectId}`, { signal })).data.data });

export type AcceptedQuotationSummary = {
  revisionId: string;
  revisionNumber: number;
  title: string;
  currency: string;
  grandTotal: string;
  decisionId: string;
  evidenceReference: string;
  customerOrderReference: string | null;
  recordedAt: string;
};

export type ProjectStartOptions = {
  context: { designJobId: string; opportunityId: string; customerId: string; siteId: string | null; siteName: string | null; siteStatus: 'active' | 'inactive' | null; customerName: string; title: string; commercialState: CommercialState };
  designRevisions: Array<{ id: string; revisionNumber: number; title: string; decisionId: string; evidenceReference: string }>;
  boqRevisions: Array<{ id: string; revisionNumber: number; title: string; designRevisionId: string }>;
  acceptedQuotation: AcceptedQuotationSummary | null;
  eligibleMembers: Array<{ id: string; name: string; email: string; isOnLeave?: boolean }>;
  existingProjectId: string | null;
};
export const projectStartOptionsQuery = (jobId?: string, enabled = true) => queryOptions({ queryKey: ['projects', 'start-options', jobId] as const, enabled: Boolean(jobId) && enabled, queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<ProjectStartOptions>>(`/projects/start-options/${jobId}`, { signal })).data.data });
export async function startProject(jobId: string, input: { title: string; designRevisionId: string; boqRevisionId?: string; projectManagerUserId: string; memberUserIds: string[]; startDate: string; targetCompletionDate: string; startReason: string; idempotencyKey: string }) { return (await apiClient.post<ApiEnvelope<ProjectDetail>>(`/projects/from-design/${jobId}`, input)).data.data; }

export type EligibleMember = { id: string; name: string; email: string };
export const eligibleProjectMembersQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['projects', 'eligible-members', projectId] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (await apiClient.get<ApiEnvelope<EligibleMember[]>>(`/projects/${projectId}/eligible-members`, { signal })).data.data,
  });

export async function addProjectMember(projectId: string, input: { userId: string; role?: string }) {
  return (await apiClient.post<ApiEnvelope<ProjectDetail>>(`/projects/${projectId}/members`, input)).data.data;
}

export async function removeProjectMember(projectId: string, userId: string) {
  return (await apiClient.delete<ApiEnvelope<ProjectDetail>>(`/projects/${projectId}/members/${userId}`)).data.data;
}
