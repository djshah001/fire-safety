import { z } from "zod";

export const checklistCategoryEnum = z.enum([
  "hydrant_piping",
  "fire_alarm",
  "sprinkler_system",
  "fire_pump",
  "extinguishers",
  "general",
]);

export const inspectionTypeEnum = z.enum([
  "hydrant_piping",
  "fire_alarm",
  "sprinkler_system",
  "fire_pump",
  "extinguishers",
  "general",
]);

export const inspectionStatusEnum = z.enum([
  "scheduled",
  "in_progress",
  "passed",
  "failed_with_punch_items",
  "rejected",
]);

export const testReportTypeEnum = z.enum([
  "hydrostatic_pressure",
  "flushing",
  "smoke_detector_response",
  "sounder_db_level",
  "insulation_resistance",
  "pump_flow_head",
  "other",
]);

export const testReportStatusEnum = z.enum(["draft", "verified", "rejected"]);

export const punchItemSeverityEnum = z.enum(["critical", "major", "minor"]);
export const punchItemStatusEnum = z.enum([
  "open",
  "assigned",
  "rectified",
  "verified_closed",
  "cancelled",
]);

export const handoverDocumentStatusEnum = z.enum([
  "pending",
  "uploaded",
  "accepted",
  "rejected",
]);

export const handoverStatusEnum = z.enum([
  "in_progress",
  "ready_for_inspection",
  "documents_submitted",
  "operationally_complete",
  "closed",
]);

// --- Checklist Templates ---

export const createChecklistTemplateSchema = z.object({
  code: z.string().trim().min(2).max(50),
  title: z.string().trim().min(3).max(200),
  category: checklistCategoryEnum,
  description: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        itemKey: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().trim().optional(),
        acceptanceCriteria: z.string().trim().min(1),
        isMandatory: z.boolean().default(true),
      }),
    )
    .min(1, "At least one checklist item is required"),
});

export const updateChecklistTemplateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  category: checklistCategoryEnum.optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        itemKey: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().trim().optional(),
        acceptanceCriteria: z.string().trim().min(1),
        isMandatory: z.boolean().default(true),
      }),
    )
    .optional(),
  isActive: z.boolean().optional(),
});

// --- Quality Inspections ---

export const createInspectionSchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3).max(200),
  category: checklistCategoryEnum,
  inspectionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  witnessName: z.string().trim().max(100).optional().nullable(),
  inspectorUserId: z.string().uuid().optional(), // defaults to current user
});

export const executeInspectionSchema = z.object({
  results: z
    .array(
      z.object({
        itemKey: z.string().trim().min(1),
        title: z.string().trim().min(1),
        status: z.enum(["pass", "fail", "na"]),
        remarks: z.string().trim().optional().nullable(),
        photoUrl: z.string().trim().url().optional().nullable(),
      }),
    )
    .min(1, "Results are required"),
  summaryRemarks: z.string().trim().max(2000).optional().nullable(),
  witnessName: z.string().trim().max(100).optional().nullable(),
  status: z.enum([
    "in_progress",
    "passed",
    "failed_with_punch_items",
    "rejected",
  ]),
});

export const reviewInspectionSchema = z.object({
  status: z.enum(["passed", "failed_with_punch_items", "rejected"]),
  summaryRemarks: z.string().trim().max(2000).optional().nullable(),
});

// --- Test Reports ---

export const createTestReportSchema = z.object({
  projectId: z.string().uuid(),
  inspectionId: z.string().uuid().optional().nullable(),
  testType: testReportTypeEnum,
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  testLocation: z.string().trim().min(2).max(200),
  parameters: z.record(z.string(), z.unknown()).default({}),
  witnessedBy: z.string().trim().max(150).optional().nullable(),
  certificateUrl: z.string().trim().max(500).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(["draft", "verified", "rejected"]).default("draft"),
});

export const updateTestReportSchema = z.object({
  testLocation: z.string().trim().min(2).max(200).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  witnessedBy: z.string().trim().max(150).optional().nullable(),
  certificateUrl: z.string().trim().max(500).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(["draft", "verified", "rejected"]).optional(),
});

// --- Punch Items ---

export const createPunchItemSchema = z.object({
  projectId: z.string().uuid(),
  inspectionId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(1000),
  location: z.string().trim().min(2).max(200),
  severity: punchItemSeverityEnum.default("major"),
  assignedToUserId: z.string().uuid().optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required")
    .optional()
    .nullable(),
  photoUrl: z.string().trim().max(500).optional().nullable(),
});

export const updatePunchItemSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(5).max(1000).optional(),
  location: z.string().trim().min(2).max(200).optional(),
  severity: punchItemSeverityEnum.optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required")
    .optional()
    .nullable(),
  photoUrl: z.string().trim().max(500).optional().nullable(),
});

export const rectifyPunchItemSchema = z.object({
  rectificationNotes: z.string().trim().min(3).max(1000),
  rectificationPhotoUrl: z.string().trim().max(500).optional().nullable(),
});

export const closePunchItemSchema = z.object({
  closureRemarks: z.string().trim().min(3).max(1000),
  status: z.enum(["verified_closed", "assigned"]), // re-assign if rectification failed
});

// --- Handover & Statutory Documents ---

export const updateClearanceCertificateSchema = z.object({
  clearanceCertificateNumber: z.string().trim().min(1).max(100),
  clearanceCertificateIssuer: z.string().trim().min(2).max(200),
  clearanceCertificateDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  clearanceCertificateFileUrl: z.string().trim().min(1).max(500),
  clearanceCertificateStatus: handoverDocumentStatusEnum,
});

export const updateNocCertificateSchema = z.object({
  nocNumber: z.string().trim().min(1).max(100),
  nocIssuer: z.string().trim().min(2).max(200),
  nocDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  nocExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required")
    .optional()
    .nullable(),
  nocFileUrl: z.string().trim().min(1).max(500),
  nocStatus: handoverDocumentStatusEnum,
});

export const updateCompletionDocumentSchema = z.object({
  completionDocumentNumber: z.string().trim().min(1).max(100),
  completionSignatoryName: z.string().trim().min(2).max(200),
  completionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  completionDocumentFileUrl: z.string().trim().min(1).max(500),
  completionDocumentStatus: handoverDocumentStatusEnum,
});

export const certifyOperationalCompletionSchema = z.object({
  completionNotes: z.string().trim().max(2000).optional().nullable(),
});

export const executeCommercialClosureSchema = z.object({
  commercialClosureNotes: z.string().trim().max(2000).optional().nullable(),
});
