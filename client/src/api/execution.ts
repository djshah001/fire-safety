import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'delayed';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';
export type DailyReportStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export type DelayStatus = 'reported' | 'under_review' | 'approved' | 'rejected';
export type VariationStatus =
  | 'draft'
  | 'under_review'
  | 'approved_internal'
  | 'submitted_to_customer'
  | 'customer_approved'
  | 'rejected'
  | 'superseded';
export type ExpenseStatus = 'submitted' | 'approved' | 'rejected' | 'reimbursed';

export type ProjectMilestone = {
  id: string;
  projectId: string;
  milestoneNumber: string;
  name: string;
  description: string | null;
  targetDate: string;
  actualDate: string | null;
  status: MilestoneStatus;
  billingPercentage: string;
  orderIndex: number;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectTask = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  milestoneName: string | null;
  taskNumber: string;
  title: string;
  description: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: TaskStatus;
  progressPercentage: number;
  weightage: string;
  plannedQuantity: string | null;
  actualQuantity: string;
  unitSymbol: string | null;
  blockedReason: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type DailyReportListItem = {
  id: string;
  projectId: string;
  reportNumber: string;
  reportDate: string;
  status: DailyReportStatus;
  currentRevisionNumber: number;
  siteEngineerUserId: string;
  siteEngineerName: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

export type DailyReportDetail = {
  report: DailyReportListItem & { rowVersion: number; reviewedByUserId: string | null };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    weatherCondition: string;
    workSummary: string;
    obstaclesEncountered: string | null;
    correctiveActions: string | null;
    generalNotes: string | null;
    manpowerCount: number;
    manpowerDetails: Array<{ trade: string; count: number; contractorName?: string }>;
    equipmentDetails: Array<{ equipmentName: string; count: number; status?: string }>;
    sitePhotos: Array<{ url: string; caption?: string; takenAt?: string }>;
    submittedAt: string;
    submittedByUserId: string;
    submittedByName: string;
  }>;
  latestRevision: {
    id: string;
    revisionNumber: number;
    weatherCondition: string;
    workSummary: string;
    obstaclesEncountered: string | null;
    correctiveActions: string | null;
    generalNotes: string | null;
    manpowerCount: number;
    manpowerDetails: Array<{ trade: string; count: number; contractorName?: string }>;
    equipmentDetails: Array<{ equipmentName: string; count: number; status?: string }>;
    sitePhotos: Array<{ url: string; caption?: string; takenAt?: string }>;
    submittedAt: string;
    submittedByUserId: string;
    submittedByName: string;
  } | null;
  taskProgress: Array<{
    taskId: string;
    taskNumber: string;
    taskTitle: string;
    workCompletedToday: string;
    progressPercentage: number;
    quantityCompletedToday: string;
    unitSymbol: string | null;
    notes: string | null;
  }>;
  materialConsumption: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    quantityConsumed: string;
    notes: string | null;
  }>;
};

export type ProjectDelay = {
  id: string;
  projectId: string;
  taskId: string | null;
  taskTitle: string | null;
  delayNumber: string;
  reasonCategory: string;
  responsibleParty: string;
  delayDays: number;
  originalTargetDate: string;
  revisedTargetDate: string;
  impactDescription: string;
  mitigationPlan: string;
  status: DelayStatus;
  reportedByUserId: string;
  reportedByName: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

export type ProjectVariation = {
  id: string;
  projectId: string;
  variationNumber: string;
  title: string;
  description: string;
  reasonCategory: string;
  scopeDeltaSummary: string;
  scheduleImpactDays: number;
  costImpactAmount: string;
  status: VariationStatus;
  initiatorUserId: string;
  initiatorName: string;
  designReviewNotes: string | null;
  designReviewedAt: string | null;
  customerEvidenceSnapshot: string | null;
  customerApprovedAt: string | null;
  revisedBoqRevisionId: string | null;
  revisedDesignRevisionId: string | null;
  createdAt: string;
};

export type ProjectExpense = {
  id: string;
  projectId: string;
  expenseNumber: string;
  category: string;
  amount: string;
  expenseDate: string;
  description: string;
  receiptFileUrl: string | null;
  status: ExpenseStatus;
  submittedByUserId: string;
  submittedByName: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

// --- Queries ---

export const projectMilestonesQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'milestones'] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ milestones: ProjectMilestone[] }>>(
          `/execution/projects/${projectId}/milestones`,
          { signal },
        )
      ).data.data.milestones,
  });

export const projectTasksQuery = (
  projectId?: string,
  filters?: { milestoneId?: string; assignedUserId?: string; status?: string },
) =>
  queryOptions({
    queryKey: ['projects', projectId, 'tasks', filters] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<
          ApiEnvelope<{ tasks: ProjectTask[]; overallProgress: number }>
        >(`/execution/projects/${projectId}/tasks`, { params: filters, signal })
      ).data.data,
  });

export const projectDailyReportsQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'daily-reports'] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ reports: DailyReportListItem[] }>>(
          `/execution/projects/${projectId}/daily-reports`,
          { signal },
        )
      ).data.data.reports,
  });

export const projectDailyReportQuery = (projectId?: string, reportId?: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'daily-reports', reportId] as const,
    enabled: Boolean(projectId && reportId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<DailyReportDetail>>(
          `/execution/projects/${projectId}/daily-reports/${reportId}`,
          { signal },
        )
      ).data.data,
  });

export const projectDelaysQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'delays'] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ delays: ProjectDelay[] }>>(
          `/execution/projects/${projectId}/delays`,
          { signal },
        )
      ).data.data.delays,
  });

export const projectVariationsQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'variations'] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ variations: ProjectVariation[] }>>(
          `/execution/projects/${projectId}/variations`,
          { signal },
        )
      ).data.data.variations,
  });

export const projectExpensesQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'expenses'] as const,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<ApiEnvelope<{ expenses: ProjectExpense[] }>>(
          `/execution/projects/${projectId}/expenses`,
          { signal },
        )
      ).data.data.expenses,
  });

// --- Mutations ---

export async function createProjectMilestone(
  projectId: string,
  input: {
    name: string;
    description?: string;
    targetDate: string;
    billingPercentage?: number;
    orderIndex?: number;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ milestone: ProjectMilestone }>>(
      `/execution/projects/${projectId}/milestones`,
      input,
    )
  ).data.data.milestone;
}

export async function updateProjectMilestone(
  projectId: string,
  milestoneId: string,
  input: Partial<{
    name: string;
    description: string | null;
    targetDate: string;
    actualDate: string | null;
    status: MilestoneStatus;
    billingPercentage: number;
    orderIndex: number;
  }>,
) {
  return (
    await apiClient.put<ApiEnvelope<{ milestone: ProjectMilestone }>>(
      `/execution/projects/${projectId}/milestones/${milestoneId}`,
      input,
    )
  ).data.data.milestone;
}

export async function createProjectTask(
  projectId: string,
  input: {
    milestoneId?: string | null;
    title: string;
    description?: string;
    assignedUserId?: string | null;
    plannedStartDate: string;
    plannedEndDate: string;
    weightage?: number;
    plannedQuantity?: number | null;
    unitSymbol?: string | null;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ task: ProjectTask }>>(
      `/execution/projects/${projectId}/tasks`,
      input,
    )
  ).data.data.task;
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  input: Partial<{
    milestoneId: string | null;
    title: string;
    description: string | null;
    assignedUserId: string | null;
    plannedStartDate: string;
    plannedEndDate: string;
    actualStartDate: string | null;
    actualEndDate: string | null;
    status: TaskStatus;
    progressPercentage: number;
    weightage: number;
    plannedQuantity: number | null;
    actualQuantity: number | null;
    unitSymbol: string | null;
    blockedReason: string | null;
  }>,
) {
  return (
    await apiClient.put<ApiEnvelope<{ task: ProjectTask }>>(
      `/execution/projects/${projectId}/tasks/${taskId}`,
      input,
    )
  ).data.data.task;
}

export async function createDailyReport(
  projectId: string,
  input: {
    reportDate: string;
    weatherCondition?: string;
    workSummary: string;
    obstaclesEncountered?: string;
    correctiveActions?: string;
    generalNotes?: string;
    manpowerCount?: number;
    manpowerDetails?: Array<{ trade: string; count: number; contractorName?: string }>;
    equipmentDetails?: Array<{ equipmentName: string; count: number; status?: string }>;
    sitePhotos?: Array<{ url: string; caption?: string }>;
    taskProgress?: Array<{
      taskId: string;
      workCompletedToday: string;
      progressPercentage: number;
      quantityCompletedToday?: number;
      unitSymbol?: string | null;
      notes?: string | null;
    }>;
    materialConsumption?: Array<{
      itemId: string;
      quantityConsumed: number;
      notes?: string | null;
    }>;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ report: DailyReportListItem }>>(
      `/execution/projects/${projectId}/daily-reports`,
      input,
    )
  ).data.data.report;
}

export async function reviewDailyReport(
  projectId: string,
  reportId: string,
  input: {
    action: 'approve' | 'return';
    reviewNotes: string;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ report: DailyReportListItem }>>(
      `/execution/projects/${projectId}/daily-reports/${reportId}/review`,
      input,
    )
  ).data.data.report;
}

export async function submitDailyReportRevision(
  projectId: string,
  reportId: string,
  input: {
    weatherCondition?: string;
    workSummary: string;
    obstaclesEncountered?: string;
    correctiveActions?: string;
    generalNotes?: string;
    manpowerCount?: number;
    manpowerDetails?: Array<{ trade: string; count: number; contractorName?: string }>;
    equipmentDetails?: Array<{ equipmentName: string; count: number; status?: string }>;
    sitePhotos?: Array<{ url: string; caption?: string }>;
    taskProgress?: Array<{
      taskId: string;
      workCompletedToday: string;
      progressPercentage: number;
      quantityCompletedToday?: number;
      unitSymbol?: string | null;
      notes?: string | null;
    }>;
    materialConsumption?: Array<{
      itemId: string;
      quantityConsumed: number;
      notes?: string | null;
    }>;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ report: DailyReportListItem }>>(
      `/execution/projects/${projectId}/daily-reports/${reportId}/revisions`,
      input,
    )
  ).data.data.report;
}

export async function createProjectDelay(
  projectId: string,
  input: {
    taskId?: string | null;
    reasonCategory: string;
    responsibleParty: string;
    delayDays: number;
    originalTargetDate: string;
    revisedTargetDate: string;
    impactDescription: string;
    mitigationPlan: string;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ delay: ProjectDelay }>>(
      `/execution/projects/${projectId}/delays`,
      input,
    )
  ).data.data.delay;
}

export async function reviewProjectDelay(
  projectId: string,
  delayId: string,
  input: {
    action: 'approve' | 'reject';
    reviewNotes: string;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ delay: ProjectDelay }>>(
      `/execution/projects/${projectId}/delays/${delayId}/review`,
      input,
    )
  ).data.data.delay;
}

export async function createProjectVariation(
  projectId: string,
  input: {
    title: string;
    description: string;
    reasonCategory: string;
    scopeDeltaSummary: string;
    scheduleImpactDays?: number;
    costImpactAmount?: number;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ variation: ProjectVariation }>>(
      `/execution/projects/${projectId}/variations`,
      input,
    )
  ).data.data.variation;
}

export async function reviewProjectVariationInternal(
  projectId: string,
  variationId: string,
  input: {
    action: 'approve_internal' | 'reject';
    designReviewNotes: string;
    revisedBoqRevisionId?: string | null;
    revisedDesignRevisionId?: string | null;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ variation: ProjectVariation }>>(
      `/execution/projects/${projectId}/variations/${variationId}/review-internal`,
      input,
    )
  ).data.data.variation;
}

export async function recordProjectVariationCustomerApproval(
  projectId: string,
  variationId: string,
  input: {
    customerEvidenceSnapshot: string;
    customerApprovedAt?: string;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ variation: ProjectVariation }>>(
      `/execution/projects/${projectId}/variations/${variationId}/customer-approval`,
      input,
    )
  ).data.data.variation;
}

export async function createProjectExpense(
  projectId: string,
  input: {
    category: string;
    amount: number;
    expenseDate: string;
    description: string;
    receiptFileUrl?: string | null;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ expense: ProjectExpense }>>(
      `/execution/projects/${projectId}/expenses`,
      input,
    )
  ).data.data.expense;
}

export async function reviewProjectExpense(
  projectId: string,
  expenseId: string,
  input: {
    action: 'approve' | 'reject';
    reviewNotes?: string;
  },
) {
  return (
    await apiClient.post<ApiEnvelope<{ expense: ProjectExpense }>>(
      `/execution/projects/${projectId}/expenses/${expenseId}/review`,
      input,
    )
  ).data.data.expense;
}

