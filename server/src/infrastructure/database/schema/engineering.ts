import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { leads, opportunities } from './crm.js';
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
  check('design_jobs_status_valid', sql`${table.status} in ('authorized')`),
  check('design_jobs_assignees_distinct', sql`${table.designerUserId} <> ${table.designHeadUserId}`),
  check('design_jobs_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export type DesignJob = typeof designJobs.$inferSelect;
