import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { customers, opportunities, sites } from './crm.js';
import { boqRevisions, designCustomerDecisions, designJobs, designPackageRevisions, quotationCustomerDecisions, quotationRevisions } from './engineering.js';
import { users } from './identity.js';
import { companies } from './organizations.js';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectNumber: varchar('project_number', { length: 40 }).notNull(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 200 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('started'),
  startDate: date('start_date').notNull(),
  targetCompletionDate: date('target_completion_date').notNull(),
  startReason: varchar('start_reason', { length: 1_000 }).notNull(),
  startedByUserId: uuid('started_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('projects_company_number_uidx').on(table.companyId, table.projectNumber),
  uniqueIndex('projects_company_opportunity_uidx').on(table.companyId, table.opportunityId),
  index('projects_company_status_idx').on(table.companyId, table.status, table.targetCompletionDate),
  check('projects_status_valid', sql`${table.status} in ('started', 'on_hold', 'completed', 'cancelled')`),
  check('projects_dates_valid', sql`${table.targetCompletionDate} >= ${table.startDate}`),
  check('projects_start_reason_required', sql`length(trim(${table.startReason})) > 0`),
  check('projects_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  role: varchar('role', { length: 30 }).notNull(),
  assignedByUserId: uuid('assigned_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'project_members_pk', columns: [table.projectId, table.userId] }),
  index('project_members_user_idx').on(table.companyId, table.userId, table.projectId),
  check('project_members_role_valid', sql`${table.role} in ('project_manager', 'sales', 'design', 'purchase', 'member', 'viewer')`),
]);

export const projectDesignBaselines = pgTable('project_design_baselines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  designJobId: uuid('design_job_id').notNull().references(() => designJobs.id, { onDelete: 'restrict' }),
  designRevisionId: uuid('design_revision_id').notNull().references(() => designPackageRevisions.id, { onDelete: 'restrict' }),
  designCustomerDecisionId: uuid('design_customer_decision_id').notNull().references(() => designCustomerDecisions.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').references(() => boqRevisions.id, { onDelete: 'restrict' }),
  customerEvidenceSnapshot: varchar('customer_evidence_snapshot', { length: 1_000 }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_design_baselines_project_uidx').on(table.projectId),
  index('project_design_baselines_revision_idx').on(table.companyId, table.designRevisionId),
]);

export const projectCommercialBaselines = pgTable('project_commercial_baselines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  quotationCustomerDecisionId: uuid('quotation_customer_decision_id').notNull().references(() => quotationCustomerDecisions.id, { onDelete: 'restrict' }),
  customerEvidenceSnapshot: varchar('customer_evidence_snapshot', { length: 1_000 }).notNull(),
  customerOrderReference: varchar('customer_order_reference', { length: 500 }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_commercial_baselines_project_uidx').on(table.projectId),
  uniqueIndex('project_commercial_baselines_quotation_uidx').on(table.quotationRevisionId),
]);
