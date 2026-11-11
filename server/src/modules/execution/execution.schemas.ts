import { z } from 'zod';

export const createMilestoneSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  billingPercentage: z.number().min(0).max(100).default(0),
  orderIndex: z.number().int().min(1).default(1),
});

export const updateMilestoneSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'delayed']).optional(),
  billingPercentage: z.number().min(0).max(100).optional(),
  orderIndex: z.number().int().min(1).optional(),
});

export const createTaskSchema = z.object({
  milestoneId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  plannedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  weightage: z.number().min(0.01).max(100).default(1.0),
  plannedQuantity: z.number().positive().optional().nullable(),
  unitSymbol: z.string().trim().max(20).optional().nullable(),
});

export const updateTaskSchema = z.object({
  milestoneId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  plannedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  actualStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional().nullable(),
  actualEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional().nullable(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']).optional(),
  progressPercentage: z.number().int().min(0).max(100).optional(),
  weightage: z.number().min(0.01).max(100).optional(),
  plannedQuantity: z.number().positive().optional().nullable(),
  actualQuantity: z.number().min(0).optional().nullable(),
  unitSymbol: z.string().trim().max(20).optional().nullable(),
  blockedReason: z.string().trim().max(500).optional().nullable(),
});

export const createDailyReportSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  weatherCondition: z.enum(['clear', 'sunny', 'cloudy', 'rainy', 'dust_storm', 'extreme_heat']).default('clear'),
  workSummary: z.string().trim().min(5).max(2000),
  obstaclesEncountered: z.string().trim().max(1000).optional().nullable(),
  correctiveActions: z.string().trim().max(1000).optional().nullable(),
  generalNotes: z.string().trim().max(1000).optional().nullable(),
  manpowerCount: z.number().int().min(0).default(0),
  manpowerDetails: z.array(z.object({
    trade: z.string().trim().min(1),
    count: z.number().int().min(0),
    contractorName: z.string().trim().optional(),
  })).default([]),
  equipmentDetails: z.array(z.object({
    equipmentName: z.string().trim().min(1),
    count: z.number().int().min(1),
    status: z.string().trim().optional(),
  })).default([]),
  sitePhotos: z.array(z.object({
    url: z.string().trim().min(1),
    caption: z.string().trim().optional(),
    takenAt: z.string().optional(),
  })).default([]),
  taskProgress: z.array(z.object({
    taskId: z.string().uuid(),
    workCompletedToday: z.string().trim().min(1).max(500),
    progressPercentage: z.number().int().min(0).max(100),
    quantityCompletedToday: z.number().min(0).default(0),
    unitSymbol: z.string().trim().max(20).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })).default([]),
  materialConsumption: z.array(z.object({
    itemId: z.string().uuid(),
    quantityConsumed: z.number().positive(),
    notes: z.string().trim().max(500).optional().nullable(),
  })).default([]),
});

export const submitDailyReportRevisionSchema = z.object({
  weatherCondition: z.enum(['clear', 'sunny', 'cloudy', 'rainy', 'dust_storm', 'extreme_heat']).default('clear'),
  workSummary: z.string().trim().min(5).max(2000),
  obstaclesEncountered: z.string().trim().max(1000).optional().nullable(),
  correctiveActions: z.string().trim().max(1000).optional().nullable(),
  generalNotes: z.string().trim().max(1000).optional().nullable(),
  manpowerCount: z.number().int().min(0).default(0),
  manpowerDetails: z.array(z.object({
    trade: z.string().trim().min(1),
    count: z.number().int().min(0),
    contractorName: z.string().trim().optional(),
  })).default([]),
  equipmentDetails: z.array(z.object({
    equipmentName: z.string().trim().min(1),
    count: z.number().int().min(1),
    status: z.string().trim().optional(),
  })).default([]),
  sitePhotos: z.array(z.object({
    url: z.string().trim().min(1),
    caption: z.string().trim().optional(),
    takenAt: z.string().optional(),
  })).default([]),
  taskProgress: z.array(z.object({
    taskId: z.string().uuid(),
    workCompletedToday: z.string().trim().min(1).max(500),
    progressPercentage: z.number().int().min(0).max(100),
    quantityCompletedToday: z.number().min(0).default(0),
    unitSymbol: z.string().trim().max(20).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })).default([]),
  materialConsumption: z.array(z.object({
    itemId: z.string().uuid(),
    quantityConsumed: z.number().positive(),
    notes: z.string().trim().max(500).optional().nullable(),
  })).default([]),
});

export const reviewDailyReportSchema = z.object({
  action: z.enum(['approve', 'return']),
  reviewNotes: z.string().trim().min(2).max(1000),
});

export const createDelaySchema = z.object({
  taskId: z.string().uuid().optional().nullable(),
  reasonCategory: z.enum([
    'client_delay',
    'site_access',
    'material_unavailability',
    'contractor_delay',
    'force_majeure',
    'design_clarification',
    'other',
  ]),
  responsibleParty: z.enum(['customer', 'company', 'vendor', 'third_party']),
  delayDays: z.number().int().positive(),
  originalTargetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  revisedTargetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  impactDescription: z.string().trim().min(5).max(1000),
  mitigationPlan: z.string().trim().min(5).max(1000),
});

export const reviewDelaySchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNotes: z.string().trim().min(2).max(1000),
});

export const createVariationSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(1000),
  reasonCategory: z.enum([
    'customer_request',
    'site_condition',
    'regulatory_compliance',
    'design_optimization',
    'error_omission',
    'other',
  ]),
  scopeDeltaSummary: z.string().trim().min(5).max(2000),
  scheduleImpactDays: z.number().int().min(0).default(0),
  costImpactAmount: z.number().min(0).default(0),
});

export const reviewVariationSchema = z.object({
  action: z.enum(['approve_internal', 'reject']),
  designReviewNotes: z.string().trim().min(2).max(1000),
  revisedBoqRevisionId: z.string().uuid().optional().nullable(),
  revisedDesignRevisionId: z.string().uuid().optional().nullable(),
});

export const recordCustomerVariationSchema = z.object({
  customerEvidenceSnapshot: z.string().trim().min(3).max(1000),
  customerApprovedAt: z.string().datetime().optional(),
});

export const createExpenseSchema = z.object({
  category: z.enum([
    'travel',
    'transport',
    'local_purchase',
    'labour_wages',
    'permits',
    'miscellaneous',
  ]),
  amount: z.number().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  description: z.string().trim().min(3).max(1000),
  receiptFileUrl: z.string().trim().max(500).optional().nullable(),
});

export const reviewExpenseSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});

