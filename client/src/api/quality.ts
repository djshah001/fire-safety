import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type ChecklistCategory =
  | 'hydrant_piping'
  | 'fire_alarm'
  | 'sprinkler_system'
  | 'fire_pump'
  | 'extinguishers'
  | 'general';

export type InspectionStatus =
  | 'scheduled'
  | 'in_progress'
  | 'passed'
  | 'failed_with_punch_items'
  | 'rejected';

export type TestReportType =
  | 'hydrostatic_pressure'
  | 'flushing'
  | 'smoke_detector_response'
  | 'sounder_db_level'
  | 'insulation_resistance'
  | 'pump_flow_head'
  | 'other';

export type TestReportStatus = 'draft' | 'verified' | 'rejected';

export type PunchSeverity = 'critical' | 'major' | 'minor';
export type PunchStatus = 'open' | 'assigned' | 'rectified' | 'verified_closed' | 'cancelled';

export type HandoverDocStatus = 'pending' | 'uploaded' | 'accepted' | 'rejected';
export type HandoverStatus =
  | 'in_progress'
  | 'ready_for_inspection'
  | 'documents_submitted'
  | 'operationally_complete'
  | 'closed';

export type ChecklistItem = {
  itemKey: string;
  title: string;
  description?: string;
  acceptanceCriteria: string;
  isMandatory: boolean;
};

export type ChecklistTemplate = {
  id: string;
  code: string;
  title: string;
  category: ChecklistCategory;
  description: string | null;
  items: ChecklistItem[];
  isActive: boolean;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type InspectionResultItem = {
  itemKey: string;
  title: string;
  status: 'pass' | 'fail' | 'na';
  remarks: string | null;
  photoUrl: string | null;
};

export type QualityInspection = {
  id: string;
  inspectionNumber: string;
  projectId: string;
  templateId: string | null;
  title: string;
  category: ChecklistCategory;
  inspectionDate: string;
  inspectorUserId: string;
  inspectorName: string | null;
  witnessName: string | null;
  status: InspectionStatus;
  results: InspectionResultItem[];
  summaryRemarks: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type QualityTestReport = {
  id: string;
  reportNumber: string;
  projectId: string;
  inspectionId: string | null;
  testType: TestReportType;
  testDate: string;
  testLocation: string;
  parameters: Record<string, unknown>;
  conductedByUserId: string;
  conductedByName: string | null;
  witnessedBy: string | null;
  status: TestReportStatus;
  certificateUrl: string | null;
  remarks: string | null;
  createdAt: string;
};

export type ProjectPunchItem = {
  id: string;
  itemNumber: string;
  projectId: string;
  inspectionId: string | null;
  title: string;
  description: string;
  location: string;
  severity: PunchSeverity;
  status: PunchStatus;
  assignedToUserId: string | null;
  assignedToName: string | null;
  dueDate: string | null;
  photoUrl: string | null;
  rectifiedAt: string | null;
  rectificationNotes: string | null;
  rectificationPhotoUrl: string | null;
  closedByUserId: string | null;
  closedAt: string | null;
  closureRemarks: string | null;
  reportedByUserId: string;
  createdAt: string;
};

export type ProjectHandoverRecord = {
  id: string;
  companyId: string;
  projectId: string;
  status: HandoverStatus;
  clearanceCertificateNumber: string | null;
  clearanceCertificateIssuer: string | null;
  clearanceCertificateDate: string | null;
  clearanceCertificateFileUrl: string | null;
  clearanceCertificateStatus: HandoverDocStatus;
  nocNumber: string | null;
  nocIssuer: string | null;
  nocDate: string | null;
  nocExpiryDate: string | null;
  nocFileUrl: string | null;
  nocStatus: HandoverDocStatus;
  completionDocumentNumber: string | null;
  completionSignatoryName: string | null;
  completionDate: string | null;
  completionDocumentFileUrl: string | null;
  completionDocumentStatus: HandoverDocStatus;
  operationalCompletionDate: string | null;
  completedByUserId: string | null;
  completionNotes: string | null;
  commercialClosureDate: string | null;
  commercialClosureNotes: string | null;
  unresolvedCriticalMajorCount: number;
  isReadyForOperationalCompletion: boolean;
};

// ==========================================
// TanStack Query Options
// ==========================================

export function checklistTemplatesQueryOptions(category?: ChecklistCategory) {
  return queryOptions({
    queryKey: ['quality', 'templates', { category }],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ templates: ChecklistTemplate[] }>>(
        '/quality/templates',
        { params: category ? { category } : undefined },
      );
      return response.data.data.templates;
    },
  });
}

export function projectInspectionsQueryOptions(projectId: string, status?: InspectionStatus) {
  return queryOptions({
    queryKey: ['projects', projectId, 'inspections', { status }],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ inspections: QualityInspection[] }>>(
        `/quality/projects/${projectId}/inspections`,
        { params: status ? { status } : undefined },
      );
      return response.data.data.inspections;
    },
    enabled: Boolean(projectId),
  });
}

export function projectTestReportsQueryOptions(projectId: string, testType?: TestReportType) {
  return queryOptions({
    queryKey: ['projects', projectId, 'test-reports', { testType }],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ testReports: QualityTestReport[] }>>(
        `/quality/projects/${projectId}/test-reports`,
        { params: testType ? { testType } : undefined },
      );
      return response.data.data.testReports;
    },
    enabled: Boolean(projectId),
  });
}

export function projectPunchItemsQueryOptions(
  projectId: string,
  filters?: { severity?: PunchSeverity; status?: PunchStatus; assignedToUserId?: string },
) {
  return queryOptions({
    queryKey: ['projects', projectId, 'punch-items', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ punchItems: ProjectPunchItem[] }>>(
        `/quality/projects/${projectId}/punch-items`,
        { params: filters },
      );
      return response.data.data.punchItems;
    },
    enabled: Boolean(projectId),
  });
}

export function projectHandoverQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: ['projects', projectId, 'handover'],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ handover: ProjectHandoverRecord }>>(
        `/quality/projects/${projectId}/handover`,
      );
      return response.data.data.handover;
    },
    enabled: Boolean(projectId),
  });
}

// ==========================================
// Mutation Functions
// ==========================================

export async function createInspection(
  projectId: string,
  payload: {
    templateId?: string | null;
    title: string;
    category: ChecklistCategory;
    inspectionDate: string;
    witnessName?: string | null;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ inspection: QualityInspection }>>(
    `/quality/projects/${projectId}/inspections`,
    payload,
  );
  return response.data.data.inspection;
}

export async function executeInspection(
  projectId: string,
  inspectionId: string,
  payload: {
    results: Array<{
      itemKey: string;
      title: string;
      status: 'pass' | 'fail' | 'na';
      remarks?: string | null;
      photoUrl?: string | null;
    }>;
    summaryRemarks?: string | null;
    witnessName?: string | null;
    status: 'in_progress' | 'passed' | 'failed_with_punch_items' | 'rejected';
  },
) {
  const response = await apiClient.put<ApiEnvelope<{ inspection: QualityInspection }>>(
    `/quality/projects/${projectId}/inspections/${inspectionId}/execute`,
    payload,
  );
  return response.data.data.inspection;
}

export async function reviewInspection(
  projectId: string,
  inspectionId: string,
  payload: {
    status: 'passed' | 'failed_with_punch_items' | 'rejected';
    summaryRemarks?: string | null;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ inspection: QualityInspection }>>(
    `/quality/projects/${projectId}/inspections/${inspectionId}/review`,
    payload,
  );
  return response.data.data.inspection;
}

export async function createTestReport(
  projectId: string,
  payload: {
    inspectionId?: string | null;
    testType: TestReportType;
    testDate: string;
    testLocation: string;
    parameters: Record<string, unknown>;
    witnessedBy?: string | null;
    certificateUrl?: string | null;
    remarks?: string | null;
    status: TestReportStatus;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ testReport: QualityTestReport }>>(
    `/quality/projects/${projectId}/test-reports`,
    payload,
  );
  return response.data.data.testReport;
}

export async function createPunchItem(
  projectId: string,
  payload: {
    inspectionId?: string | null;
    title: string;
    description: string;
    location: string;
    severity: PunchSeverity;
    assignedToUserId?: string | null;
    dueDate?: string | null;
    photoUrl?: string | null;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ punchItem: ProjectPunchItem }>>(
    `/quality/projects/${projectId}/punch-items`,
    payload,
  );
  return response.data.data.punchItem;
}

export async function rectifyPunchItem(
  projectId: string,
  itemId: string,
  payload: {
    rectificationNotes: string;
    rectificationPhotoUrl?: string | null;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ punchItem: ProjectPunchItem }>>(
    `/quality/projects/${projectId}/punch-items/${itemId}/rectify`,
    payload,
  );
  return response.data.data.punchItem;
}

export async function closePunchItem(
  projectId: string,
  itemId: string,
  payload: {
    closureRemarks: string;
    status: 'verified_closed' | 'assigned';
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ punchItem: ProjectPunchItem }>>(
    `/quality/projects/${projectId}/punch-items/${itemId}/close`,
    payload,
  );
  return response.data.data.punchItem;
}

export async function updateClearanceCertificate(
  projectId: string,
  payload: {
    clearanceCertificateNumber: string;
    clearanceCertificateIssuer: string;
    clearanceCertificateDate: string;
    clearanceCertificateFileUrl: string;
    clearanceCertificateStatus: HandoverDocStatus;
  },
) {
  const response = await apiClient.put<ApiEnvelope<{ handover: ProjectHandoverRecord }>>(
    `/quality/projects/${projectId}/handover/clearance`,
    payload,
  );
  return response.data.data.handover;
}

export async function updateNocCertificate(
  projectId: string,
  payload: {
    nocNumber: string;
    nocIssuer: string;
    nocDate: string;
    nocExpiryDate?: string | null;
    nocFileUrl: string;
    nocStatus: HandoverDocStatus;
  },
) {
  const response = await apiClient.put<ApiEnvelope<{ handover: ProjectHandoverRecord }>>(
    `/quality/projects/${projectId}/handover/noc`,
    payload,
  );
  return response.data.data.handover;
}

export async function updateCompletionDocument(
  projectId: string,
  payload: {
    completionDocumentNumber: string;
    completionSignatoryName: string;
    completionDate: string;
    completionDocumentFileUrl: string;
    completionDocumentStatus: HandoverDocStatus;
  },
) {
  const response = await apiClient.put<ApiEnvelope<{ handover: ProjectHandoverRecord }>>(
    `/quality/projects/${projectId}/handover/completion-document`,
    payload,
  );
  return response.data.data.handover;
}

export async function certifyOperationalCompletion(
  projectId: string,
  payload: {
    completionNotes?: string | null;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ handover: ProjectHandoverRecord }>>(
    `/quality/projects/${projectId}/handover/certify-completion`,
    payload,
  );
  return response.data.data.handover;
}

export async function executeCommercialClosure(
  projectId: string,
  payload: {
    commercialClosureNotes?: string | null;
  },
) {
  const response = await apiClient.post<ApiEnvelope<{ handover: ProjectHandoverRecord }>>(
    `/quality/projects/${projectId}/handover/commercial-closure`,
    payload,
  );
  return response.data.data.handover;
}
