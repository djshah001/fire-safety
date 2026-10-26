import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, numeric, pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { leads, marketSectors, opportunities } from './crm.js';
import { brands, items, units } from './masters.js';
import { users } from './identity.js';
import { companies } from './organizations.js';

export const designJobs = pgTable('design_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 200 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('authorized'),
  designerUserId: uuid('designer_user_id').references(() => users.id, { onDelete: 'restrict' }),
  designHeadUserId: uuid('design_head_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  designerAssignedAt: timestamp('designer_assigned_at', { withTimezone: true }),
  designDueAt: timestamp('design_due_at', { withTimezone: true }),
  bufferExtensionsUsed: integer('buffer_extensions_used').notNull().default(0),
  designerCompletedAt: timestamp('designer_completed_at', { withTimezone: true }),
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
  check('design_jobs_status_valid', sql`${table.status} in ('awaiting_designer', 'authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested')`),
  check('design_jobs_assignees_distinct', sql`${table.designerUserId} <> ${table.designHeadUserId}`),
  check('design_jobs_buffer_extensions_valid', sql`${table.bufferExtensionsUsed} between 0 and 3`),
  check('design_jobs_deadline_consistent', sql`(${table.designerUserId} is null and ${table.designerAssignedAt} is null and ${table.designDueAt} is null and ${table.bufferExtensionsUsed} = 0 and ${table.designerCompletedAt} is null) or (${table.designerUserId} is not null and ${table.designerAssignedAt} is not null and ${table.designDueAt} is not null and ${table.designDueAt} > ${table.designerAssignedAt} and (${table.designerCompletedAt} is null or ${table.designerCompletedAt} >= ${table.designerAssignedAt}))`),
  check('design_jobs_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const designDeadlineExtensions = pgTable('design_deadline_extensions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  designJobId: uuid('design_job_id').notNull().references(() => designJobs.id, { onDelete: 'restrict' }),
  sequenceNumber: integer('sequence_number').notNull(),
  previousDueAt: timestamp('previous_due_at', { withTimezone: true }).notNull(),
  newDueAt: timestamp('new_due_at', { withTimezone: true }).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('design_deadline_extensions_job_sequence_uidx').on(table.designJobId, table.sequenceNumber),
  index('design_deadline_extensions_company_job_idx').on(table.companyId, table.designJobId, table.createdAt),
  check('design_deadline_extensions_sequence_valid', sql`${table.sequenceNumber} between 1 and 3`),
  check('design_deadline_extensions_duration_valid', sql`${table.newDueAt} = ${table.previousDueAt} + interval '3 days'`),
  check('design_deadline_extensions_reason_required', sql`length(trim(${table.reason})) > 0`),
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

export const boqTemplates = pgTable('boq_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  sectorId: uuid('sector_id').notNull().references(() => marketSectors.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 160 }).notNull(),
  costingUserId: uuid('costing_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  purchaseHeadUserId: uuid('purchase_head_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  adminApproverUserId: uuid('admin_approver_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('boq_templates_company_sector_uidx').on(table.companyId, table.sectorId),
  index('boq_templates_company_status_idx').on(table.companyId, table.status),
  check('boq_templates_status_valid', sql`${table.status} in ('active', 'inactive')`),
  check('boq_templates_assignees_distinct', sql`${table.costingUserId} <> ${table.purchaseHeadUserId} and ${table.costingUserId} <> ${table.adminApproverUserId} and ${table.purchaseHeadUserId} <> ${table.adminApproverUserId}`),
  check('boq_templates_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const boqTemplateItems = pgTable('boq_template_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  templateId: uuid('template_id').notNull().references(() => boqTemplates.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  section: varchar('section', { length: 120 }).notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('boq_template_items_template_item_uidx').on(table.templateId, table.itemId),
  uniqueIndex('boq_template_items_template_order_uidx').on(table.templateId, table.sortOrder),
  index('boq_template_items_company_item_idx').on(table.companyId, table.itemId),
  check('boq_template_items_sort_positive', sql`${table.sortOrder} > 0`),
]);

export const boqRevisionStatusEnum = pgEnum('boq_revision_status', [
  'draft', 'submitted', 'costing', 'purchase_review', 'admin_review', 'returned', 'approved',
]);
export const estimateCostCategoryEnum = pgEnum('estimate_cost_category', [
  'material', 'labour', 'transport', 'subcontracting', 'overhead', 'wastage', 'margin',
]);

export const boqRevisions = pgTable('boq_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  designJobId: uuid('design_job_id').notNull().references(() => designJobs.id, { onDelete: 'restrict' }),
  designRevisionId: uuid('design_revision_id').notNull().references(() => designPackageRevisions.id, { onDelete: 'restrict' }),
  templateId: uuid('template_id').references(() => boqTemplates.id, { onDelete: 'restrict' }),
  templateNameSnapshot: varchar('template_name_snapshot', { length: 160 }),
  costingUserId: uuid('costing_user_id').references(() => users.id, { onDelete: 'restrict' }),
  purchaseHeadUserId: uuid('purchase_head_user_id').references(() => users.id, { onDelete: 'restrict' }),
  adminApproverUserId: uuid('admin_approver_user_id').references(() => users.id, { onDelete: 'restrict' }),
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
  index('boq_revisions_costing_idx').on(table.companyId, table.costingUserId, table.status),
  index('boq_revisions_purchase_head_idx').on(table.companyId, table.purchaseHeadUserId, table.status),
  index('boq_revisions_admin_approver_idx').on(table.companyId, table.adminApproverUserId, table.status),
  check('boq_revisions_number_positive', sql`${table.revisionNumber} > 0`),
  check('boq_revisions_row_version_positive', sql`${table.rowVersion} > 0`),
  check('boq_revisions_currency_valid', sql`${table.estimateCurrency} ~ '^[A-Z]{3}$'`),
  check('boq_revisions_submission_consistent', sql`(${table.status} = 'draft' and ${table.submittedAt} is null and ${table.submittedByUserId} is null) or (${table.status} <> 'draft' and ${table.submittedAt} is not null and ${table.submittedByUserId} is not null)`),
  check('boq_revisions_template_assignment_consistent', sql`${table.templateId} is null or (${table.templateNameSnapshot} is not null and ${table.costingUserId} is not null and ${table.purchaseHeadUserId} is not null and ${table.adminApproverUserId} is not null)`),
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
  check('boq_lines_quantity_nonnegative', sql`${table.quantity} >= 0`),
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
  reviewStage: varchar('review_stage', { length: 30 }).notNull().default('legacy'),
  decision: designReviewDecisionEnum('decision').notNull(),
  reason: varchar('reason', { length: 1_000 }),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actedAt: timestamp('acted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('boq_review_actions_revision_stage_uidx').on(table.boqRevisionId, table.reviewStage),
  index('boq_review_actions_company_idx').on(table.companyId, table.actedAt),
  check('boq_review_stage_valid', sql`${table.reviewStage} in ('legacy', 'purchase', 'admin')`),
  check('boq_review_reason_required', sql`${table.decision} = 'approved' or (${table.reason} is not null and length(trim(${table.reason})) > 0)`),
]);

export const boqRevisionContributors = pgTable('boq_revision_contributors', {
  boqRevisionId: uuid('boq_revision_id').notNull().references(() => boqRevisions.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  contribution: varchar('contribution', { length: 30 }).notNull(),
  contributedAt: timestamp('contributed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'boq_revision_contributors_pk', columns: [table.boqRevisionId, table.userId] }),
  index('boq_revision_contributors_user_idx').on(table.companyId, table.userId),
  check('boq_revision_contribution_valid', sql`${table.contribution} in ('quantity', 'costing')`),
]);

export const quotationRevisionStatusEnum = pgEnum('quotation_revision_status', [
  'draft', 'submitted', 'returned', 'approved', 'issued', 'accepted', 'declined',
]);
export const quotationCustomerDecisionEnum = pgEnum('quotation_customer_decision', ['accepted', 'declined']);

export const quotations = pgTable('quotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  designJobId: uuid('design_job_id').notNull().references(() => designJobs.id, { onDelete: 'restrict' }),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'restrict' }),
  quotationNumber: varchar('quotation_number', { length: 40 }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quotations_company_number_uidx').on(table.companyId, table.quotationNumber),
  uniqueIndex('quotations_job_uidx').on(table.designJobId),
  uniqueIndex('quotations_opportunity_uidx').on(table.opportunityId),
]);

export const quotationRevisions = pgTable('quotation_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  quotationId: uuid('quotation_id').notNull().references(() => quotations.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').notNull().references(() => boqRevisions.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  status: quotationRevisionStatusEnum('status').notNull().default('draft'),
  title: varchar('title', { length: 200 }).notNull(),
  customerNameSnapshot: varchar('customer_name_snapshot', { length: 200 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  validityDays: integer('validity_days').notNull().default(30),
  exclusions: varchar('exclusions', { length: 4_000 }).notNull(),
  deliveryTerms: varchar('delivery_terms', { length: 2_000 }).notNull(),
  paymentTerms: varchar('payment_terms', { length: 2_000 }).notNull(),
  taxLabel: varchar('tax_label', { length: 120 }),
  subtotal: numeric('subtotal', { precision: 20, scale: 2 }).notNull().default('0'),
  lineDiscountTotal: numeric('line_discount_total', { precision: 20, scale: 2 }).notNull().default('0'),
  additionalDiscount: numeric('additional_discount', { precision: 20, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 20, scale: 2 }).notNull().default('0'),
  roundingAdjustment: numeric('rounding_adjustment', { precision: 20, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 20, scale: 2 }).notNull().default('0'),
  cashPercentage: numeric('cash_percentage', { precision: 5, scale: 2 }),
  nonCashPercentage: numeric('non_cash_percentage', { precision: 5, scale: 2 }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  issuedByUserId: uuid('issued_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quotation_revisions_number_uidx').on(table.quotationId, table.revisionNumber),
  uniqueIndex('quotation_revisions_one_draft_uidx').on(table.quotationId).where(sql`${table.status} = 'draft'`),
  index('quotation_revisions_company_status_idx').on(table.companyId, table.status, table.updatedAt),
  index('quotation_revisions_boq_idx').on(table.companyId, table.boqRevisionId),
  check('quotation_revisions_number_positive', sql`${table.revisionNumber} > 0`),
  check('quotation_revisions_validity', sql`${table.validityDays} between 1 and 365`),
  check('quotation_revisions_currency_valid', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check('quotation_revisions_amounts_nonnegative', sql`${table.subtotal} >= 0 and ${table.lineDiscountTotal} >= 0 and ${table.additionalDiscount} >= 0 and ${table.taxAmount} >= 0 and ${table.grandTotal} >= 0`),
  check('quotation_revisions_payment_split_valid', sql`(${table.cashPercentage} is null and ${table.nonCashPercentage} is null) or (${table.cashPercentage} between 0 and 100 and ${table.nonCashPercentage} between 0 and 100 and ${table.cashPercentage} + ${table.nonCashPercentage} = 100)`),
  check('quotation_revisions_tax_label_consistent', sql`${table.taxAmount} = 0 or (${table.taxLabel} is not null and length(trim(${table.taxLabel})) > 0)`),
  check('quotation_revisions_row_version_positive', sql`${table.rowVersion} > 0`),
  check('quotation_revisions_submission_consistent', sql`(${table.status} = 'draft' and ${table.submittedAt} is null and ${table.submittedByUserId} is null) or (${table.status} <> 'draft' and ${table.submittedAt} is not null and ${table.submittedByUserId} is not null)`),
  check('quotation_revisions_approval_consistent', sql`${table.status} in ('draft', 'submitted', 'returned') or (${table.approvedAt} is not null and ${table.approvedByUserId} is not null)`),
  check('quotation_revisions_issue_consistent', sql`${table.status} not in ('issued', 'accepted', 'declined') or (${table.issuedAt} is not null and ${table.issuedByUserId} is not null)`),
]);

export const quotationLines = pgTable('quotation_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  boqLineId: uuid('boq_line_id').notNull().references(() => boqLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  sectionSnapshot: varchar('section_snapshot', { length: 120 }).notNull(),
  itemCodeSnapshot: varchar('item_code_snapshot', { length: 50 }).notNull(),
  itemNameSnapshot: varchar('item_name_snapshot', { length: 160 }).notNull(),
  specificationSnapshot: varchar('specification_snapshot', { length: 2_000 }).notNull(),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'restrict' }),
  brandNameSnapshot: varchar('brand_name_snapshot', { length: 120 }),
  unitSymbolSnapshot: varchar('unit_symbol_snapshot', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unitRate: numeric('unit_rate', { precision: 18, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 20, scale: 2 }).notNull().default('0'),
  lineSubtotal: numeric('line_subtotal', { precision: 20, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 20, scale: 2 }).notNull().default('0'),
  notes: varchar('notes', { length: 1_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quotation_lines_revision_number_uidx').on(table.quotationRevisionId, table.lineNumber),
  uniqueIndex('quotation_lines_revision_boq_line_uidx').on(table.quotationRevisionId, table.boqLineId),
  check('quotation_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('quotation_lines_quantity_positive', sql`${table.quantity} > 0`),
  check('quotation_lines_amounts_valid', sql`${table.unitRate} >= 0 and ${table.discountAmount} >= 0 and ${table.lineSubtotal} >= 0 and ${table.lineTotal} >= 0 and ${table.discountAmount} <= ${table.lineSubtotal}`),
  check('quotation_lines_brand_consistent', sql`(${table.brandId} is null and ${table.brandNameSnapshot} is null) or (${table.brandId} is not null and ${table.brandNameSnapshot} is not null)`),
  check('quotation_lines_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const quotationRevisionContributors = pgTable('quotation_revision_contributors', {
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  contributedAt: timestamp('contributed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'quotation_revision_contributors_pk', columns: [table.quotationRevisionId, table.userId] }),
  index('quotation_revision_contributors_user_idx').on(table.companyId, table.userId),
]);

export const quotationReviewActions = pgTable('quotation_review_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  decision: designReviewDecisionEnum('decision').notNull(),
  reason: varchar('reason', { length: 1_000 }),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actedAt: timestamp('acted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quotation_review_actions_revision_uidx').on(table.quotationRevisionId),
  check('quotation_review_reason_required', sql`${table.decision} = 'approved' or (${table.reason} is not null and length(trim(${table.reason})) > 0)`),
]);

export const quotationIssueDocuments = pgTable('quotation_issue_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageName: varchar('storage_name', { length: 80 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  templateVersion: varchar('template_version', { length: 40 }).notNull(),
  isDemo: boolean('is_demo').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quotation_issue_documents_revision_uidx').on(table.quotationRevisionId),
  uniqueIndex('quotation_issue_documents_storage_uidx').on(table.storageName),
  check('quotation_issue_documents_size_positive', sql`${table.sizeBytes} > 0`),
]);

export const quotationCustomerDecisions = pgTable('quotation_customer_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  decision: quotationCustomerDecisionEnum('decision').notNull(),
  evidenceReference: varchar('evidence_reference', { length: 1_000 }).notNull(),
  customerOrderReference: varchar('customer_order_reference', { length: 200 }),
  notes: varchar('notes', { length: 1_000 }),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quotation_customer_decisions_revision_uidx').on(table.quotationRevisionId),
  check('quotation_customer_evidence_required', sql`length(trim(${table.evidenceReference})) > 0`),
]);

export type DesignJob = typeof designJobs.$inferSelect;
