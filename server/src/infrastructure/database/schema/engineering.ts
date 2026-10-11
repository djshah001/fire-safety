import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { leads, opportunities } from './crm.js';
import { items, units } from './masters.js';
import { users } from './identity.js';
import { companies } from './organizations.js';

export const designJobs = pgTable('design_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 200 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('authorized'),
  designerUserId: uuid('designer_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  designHeadUserId: uuid('design_head_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  surveyRequested: boolean('survey_requested').notNull().default(false),
  authorizationNotes: varchar('authorization_notes', { length: 1_000 }).notNull(),
  authorizedByUserId: uuid('authorized_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('design_jobs_company_lead_uidx').on(table.companyId, table.leadId),
  uniqueIndex('design_jobs_company_opportunity_uidx').on(table.companyId, table.opportunityId),
  index('design_jobs_designer_status_idx').on(table.companyId, table.designerUserId, table.status),
  index('design_jobs_head_status_idx').on(table.companyId, table.designHeadUserId, table.status),
  check('design_jobs_status_valid', sql`${table.status} in ('authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested')`),
  check('design_jobs_assignees_distinct', sql`${table.designerUserId} <> ${table.designHeadUserId}`),
  check('design_jobs_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const designRevisionStatusEnum = pgEnum('design_revision_status', [
  'draft',
  'submitted',
  'returned',
  'internally_approved',
  'sent_to_customer',
  'customer_approved',
  'changes_requested',
]);

export const designFileKindEnum = pgEnum('design_file_kind', ['cad', 'pdf']);
export const designReviewDecisionEnum = pgEnum('design_review_decision', ['approved', 'returned']);
export const designCustomerDecisionEnum = pgEnum('design_customer_decision', ['approved', 'changes_requested']);

export const designPackageRevisions = pgTable('design_package_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  designJobId: uuid('design_job_id').notNull().references(() => designJobs.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  changeSummary: varchar('change_summary', { length: 1_000 }).notNull(),
  status: designRevisionStatusEnum('status').notNull().default('draft'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('design_revisions_job_number_uidx').on(table.designJobId, table.revisionNumber),
  uniqueIndex('design_revisions_one_draft_uidx').on(table.designJobId).where(sql`${table.status} = 'draft'`),
  index('design_revisions_company_job_idx').on(table.companyId, table.designJobId, table.revisionNumber),
  check('design_revisions_number_positive', sql`${table.revisionNumber} > 0`),
  check('design_revisions_row_version_positive', sql`${table.rowVersion} > 0`),
  check('design_revisions_submission_consistent', sql`(${table.status} = 'draft' and ${table.submittedAt} is null and ${table.submittedByUserId} is null) or (${table.status} <> 'draft' and ${table.submittedAt} is not null and ${table.submittedByUserId} is not null)`),
]);

export const designRevisionFiles = pgTable('design_revision_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  revisionId: uuid('revision_id').notNull().references(() => designPackageRevisions.id, { onDelete: 'restrict' }),
  kind: designFileKindEnum('kind').notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageName: varchar('storage_name', { length: 80 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('design_revision_files_storage_uidx').on(table.storageName),
  index('design_revision_files_revision_idx').on(table.companyId, table.revisionId, table.kind),
  check('design_revision_files_size_positive', sql`${table.sizeBytes} > 0`),
  check('design_revision_files_size_limit', sql`(${table.kind} = 'cad' and ${table.sizeBytes} <= 104857600) or (${table.kind} = 'pdf' and ${table.sizeBytes} <= 20971520)`),
]);

export const designReviewActions = pgTable('design_review_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  revisionId: uuid('revision_id').notNull().references(() => designPackageRevisions.id, { onDelete: 'restrict' }),
  decision: designReviewDecisionEnum('decision').notNull(),
  reason: varchar('reason', { length: 1_000 }),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actedAt: timestamp('acted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('design_review_actions_revision_uidx').on(table.revisionId),
  index('design_review_actions_company_idx').on(table.companyId, table.actedAt),
  check('design_review_reason_required', sql`${table.decision} = 'approved' or (${table.reason} is not null and length(trim(${table.reason})) > 0)`),
]);

export const designCustomerDecisions = pgTable('design_customer_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  revisionId: uuid('revision_id').notNull().references(() => designPackageRevisions.id, { onDelete: 'restrict' }),
  decision: designCustomerDecisionEnum('decision').notNull(),
  evidenceReference: varchar('evidence_reference', { length: 1_000 }).notNull(),
  notes: varchar('notes', { length: 1_000 }),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('design_customer_decisions_revision_uidx').on(table.revisionId),
  index('design_customer_decisions_company_idx').on(table.companyId, table.recordedAt),
  check('design_customer_evidence_required', sql`length(trim(${table.evidenceReference})) > 0`),
]);

export const boqRevisionStatusEnum = pgEnum('boq_revision_status', ['draft', 'submitted', 'returned', 'approved']);
export const estimateCostCategoryEnum = pgEnum('estimate_cost_category', [
  'material', 'labour', 'transport', 'subcontracting', 'overhead', 'wastage', 'margin',
]);

export const boqRevisions = pgTable('boq_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  designJobId: uuid('design_job_id').notNull().references(() => designJobs.id, { onDelete: 'restrict' }),
  designRevisionId: uuid('design_revision_id').notNull().references(() => designPackageRevisions.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  changeSummary: varchar('change_summary', { length: 1_000 }).notNull(),
  status: boqRevisionStatusEnum('status').notNull().default('draft'),
  estimateCurrency: varchar('estimate_currency', { length: 3 }).notNull().default('INR'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('boq_revisions_job_number_uidx').on(table.designJobId, table.revisionNumber),
  uniqueIndex('boq_revisions_one_draft_uidx').on(table.designJobId).where(sql`${table.status} = 'draft'`),
  index('boq_revisions_design_idx').on(table.companyId, table.designRevisionId),
  check('boq_revisions_number_positive', sql`${table.revisionNumber} > 0`),
  check('boq_revisions_row_version_positive', sql`${table.rowVersion} > 0`),
  check('boq_revisions_currency_valid', sql`${table.estimateCurrency} ~ '^[A-Z]{3}$'`),
  check('boq_revisions_submission_consistent', sql`(${table.status} = 'draft' and ${table.submittedAt} is null and ${table.submittedByUserId} is null) or (${table.status} <> 'draft' and ${table.submittedAt} is not null and ${table.submittedByUserId} is not null)`),
]);

export const boqLines = pgTable('boq_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').notNull().references(() => boqRevisions.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  section: varchar('section', { length: 120 }).notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  itemCodeSnapshot: varchar('item_code_snapshot', { length: 50 }).notNull(),
  itemNameSnapshot: varchar('item_name_snapshot', { length: 160 }).notNull(),
  specificationSnapshot: varchar('specification_snapshot', { length: 2_000 }).notNull(),
  brand: varchar('brand', { length: 120 }),
  model: varchar('model', { length: 120 }),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
  unitSymbolSnapshot: varchar('unit_symbol_snapshot', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  drawingReference: varchar('drawing_reference', { length: 200 }),
  notes: varchar('notes', { length: 1_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('boq_lines_revision_number_uidx').on(table.boqRevisionId, table.lineNumber),
  index('boq_lines_item_idx').on(table.companyId, table.itemId),
  check('boq_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('boq_lines_quantity_positive', sql`${table.quantity} > 0`),
  check('boq_lines_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const estimateCostLines = pgTable('estimate_cost_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').notNull().references(() => boqRevisions.id, { onDelete: 'restrict' }),
  boqLineId: uuid('boq_line_id').references(() => boqLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  category: estimateCostCategoryEnum('category').notNull(),
  description: varchar('description', { length: 300 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unitRate: numeric('unit_rate', { precision: 18, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 20, scale: 2 }).notNull(),
  notes: varchar('notes', { length: 1_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('estimate_lines_revision_number_uidx').on(table.boqRevisionId, table.lineNumber),
  index('estimate_lines_boq_line_idx').on(table.companyId, table.boqLineId),
  check('estimate_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('estimate_lines_quantity_positive', sql`${table.quantity} > 0`),
  check('estimate_lines_rate_nonnegative', sql`${table.unitRate} >= 0`),
  check('estimate_lines_total_nonnegative', sql`${table.lineTotal} >= 0`),
  check('estimate_lines_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const boqReviewActions = pgTable('boq_review_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').notNull().references(() => boqRevisions.id, { onDelete: 'restrict' }),
  decision: designReviewDecisionEnum('decision').notNull(),
  reason: varchar('reason', { length: 1_000 }),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actedAt: timestamp('acted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('boq_review_actions_revision_uidx').on(table.boqRevisionId),
  index('boq_review_actions_company_idx').on(table.companyId, table.actedAt),
  check('boq_review_reason_required', sql`${table.decision} = 'approved' or (${table.reason} is not null and length(trim(${table.reason})) > 0)`),
]);

export type DesignJob = typeof designJobs.$inferSelect;
