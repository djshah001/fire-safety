import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './organizations.js';
import { projects } from './projects.js';
import { users } from './identity.js';

export const qualityChecklistTemplates = pgTable('quality_checklist_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  description: varchar('description', { length: 1_000 }),
  items: jsonb('items').notNull().default('[]'),
  isActive: boolean('is_active').notNull().default(true),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quality_checklist_templates_code_uidx').on(table.companyId, table.code),
  index('quality_checklist_templates_category_idx').on(table.companyId, table.category, table.isActive),
  check('quality_checklist_templates_category_valid', sql`${table.category} in ('hydrant_piping', 'fire_alarm', 'sprinkler_system', 'fire_pump', 'extinguishers', 'general')`),
  check('quality_checklist_templates_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const qualityInspections = pgTable('quality_inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => qualityChecklistTemplates.id, { onDelete: 'set null' }),
  inspectionNumber: varchar('inspection_number', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  inspectionDate: date('inspection_date').notNull(),
  inspectorUserId: uuid('inspector_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  witnessName: varchar('witness_name', { length: 100 }),
  status: varchar('status', { length: 30 }).notNull().default('scheduled'),
  results: jsonb('results').notNull().default('[]'),
  summaryRemarks: varchar('summary_remarks', { length: 2_000 }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quality_inspections_number_uidx').on(table.companyId, table.inspectionNumber),
  index('quality_inspections_project_status_idx').on(table.companyId, table.projectId, table.status),
  check('quality_inspections_category_valid', sql`${table.category} in ('hydrant_piping', 'fire_alarm', 'sprinkler_system', 'fire_pump', 'extinguishers', 'general')`),
  check('quality_inspections_status_valid', sql`${table.status} in ('scheduled', 'in_progress', 'passed', 'failed_with_punch_items', 'rejected')`),
  check('quality_inspections_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const qualityTestReports = pgTable('quality_test_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  inspectionId: uuid('inspection_id').references(() => qualityInspections.id, { onDelete: 'set null' }),
  reportNumber: varchar('report_number', { length: 50 }).notNull(),
  testType: varchar('test_type', { length: 50 }).notNull(),
  testDate: date('test_date').notNull(),
  testLocation: varchar('test_location', { length: 200 }).notNull(),
  parameters: jsonb('parameters').notNull().default('{}'),
  conductedByUserId: uuid('conducted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  witnessedBy: varchar('witnessed_by', { length: 150 }),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  certificateUrl: varchar('certificate_url', { length: 500 }),
  remarks: varchar('remarks', { length: 1_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quality_test_reports_number_uidx').on(table.companyId, table.reportNumber),
  index('quality_test_reports_project_status_idx').on(table.companyId, table.projectId, table.status),
  check('quality_test_reports_type_valid', sql`${table.testType} in ('hydrostatic_pressure', 'flushing', 'smoke_detector_response', 'sounder_db_level', 'insulation_resistance', 'pump_flow_head', 'other')`),
  check('quality_test_reports_status_valid', sql`${table.status} in ('draft', 'verified', 'rejected')`),
  check('quality_test_reports_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const projectPunchItems = pgTable('project_punch_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  inspectionId: uuid('inspection_id').references(() => qualityInspections.id, { onDelete: 'set null' }),
  itemNumber: varchar('item_number', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: varchar('description', { length: 1_000 }).notNull(),
  location: varchar('location', { length: 200 }).notNull(),
  severity: varchar('severity', { length: 30 }).notNull().default('major'),
  status: varchar('status', { length: 30 }).notNull().default('open'),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  photoUrl: varchar('photo_url', { length: 500 }),
  rectifiedAt: timestamp('rectified_at', { withTimezone: true }),
  rectificationNotes: varchar('rectification_notes', { length: 1_000 }),
  rectificationPhotoUrl: varchar('rectification_photo_url', { length: 500 }),
  closedByUserId: uuid('closed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closureRemarks: varchar('closure_remarks', { length: 1_000 }),
  reportedByUserId: uuid('reported_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_punch_items_number_uidx').on(table.companyId, table.itemNumber),
  index('project_punch_items_project_status_idx').on(table.companyId, table.projectId, table.status),
  index('project_punch_items_severity_idx').on(table.companyId, table.severity),
  check('project_punch_items_severity_valid', sql`${table.severity} in ('critical', 'major', 'minor')`),
  check('project_punch_items_status_valid', sql`${table.status} in ('open', 'assigned', 'rectified', 'verified_closed', 'cancelled')`),
  check('project_punch_items_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const projectHandoverRecords = pgTable('project_handover_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull().default('in_progress'),

  // Document 1: Fire Department Clearance Certificate (Mandatory)
  clearanceCertificateNumber: varchar('clearance_certificate_number', { length: 100 }),
  clearanceCertificateIssuer: varchar('clearance_certificate_issuer', { length: 200 }),
  clearanceCertificateDate: date('clearance_certificate_date'),
  clearanceCertificateFileUrl: varchar('clearance_certificate_file_url', { length: 500 }),
  clearanceCertificateStatus: varchar('clearance_certificate_status', { length: 30 }).notNull().default('pending'),

  // Document 2: Fire Department No Objection Certificate (NOC) (Mandatory)
  nocNumber: varchar('noc_number', { length: 100 }),
  nocIssuer: varchar('noc_issuer', { length: 200 }),
  nocDate: date('noc_date'),
  nocExpiryDate: date('noc_expiry_date'),
  nocFileUrl: varchar('noc_file_url', { length: 500 }),
  nocStatus: varchar('noc_status', { length: 30 }).notNull().default('pending'),

  // Document 3: Practical Project Completion Document signed by client (Mandatory)
  completionDocumentNumber: varchar('completion_document_number', { length: 100 }),
  completionSignatoryName: varchar('completion_signatory_name', { length: 200 }),
  completionDate: date('completion_date'),
  completionDocumentFileUrl: varchar('completion_document_file_url', { length: 500 }),
  completionDocumentStatus: varchar('completion_document_status', { length: 30 }).notNull().default('pending'),

  // Operational Completion Gate
  operationalCompletionDate: timestamp('operational_completion_date', { withTimezone: true }),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  completionNotes: varchar('completion_notes', { length: 2_000 }),

  // Commercial Settlement / Closure (Independent)
  commercialClosureDate: timestamp('commercial_closure_date', { withTimezone: true }),
  commercialClosureNotes: varchar('commercial_closure_notes', { length: 2_000 }),

  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_handover_records_project_uidx').on(table.companyId, table.projectId),
  index('project_handover_records_status_idx').on(table.companyId, table.status),
  check('project_handover_status_valid', sql`${table.status} in ('in_progress', 'ready_for_inspection', 'documents_submitted', 'operationally_complete', 'closed')`),
  check('project_handover_clearance_status_valid', sql`${table.clearanceCertificateStatus} in ('pending', 'uploaded', 'accepted', 'rejected')`),
  check('project_handover_noc_status_valid', sql`${table.nocStatus} in ('pending', 'uploaded', 'accepted', 'rejected')`),
  check('project_handover_comp_doc_status_valid', sql`${table.completionDocumentStatus} in ('pending', 'uploaded', 'accepted', 'rejected')`),
  check('project_handover_row_version_positive', sql`${table.rowVersion} > 0`),
]);
