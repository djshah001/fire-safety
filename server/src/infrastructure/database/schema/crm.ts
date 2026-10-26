import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { companies } from './organizations.js';

export const masterStatusEnum = pgEnum('master_status', ['active', 'inactive']);
export const leadStageEnum = pgEnum('lead_stage', [
  'new',
  'contacted',
  'qualified',
  'design_authorized',
  'commercial_negotiation',
  'won',
  'lost',
  'on_hold',
]);
export const opportunityCommercialStateEnum = pgEnum('opportunity_commercial_state', [
  'unawarded',
  'quoted',
  'awarded',
  'lost',
  'on_hold',
]);
export const crmActivityTypeEnum = pgEnum('crm_activity_type', ['call', 'meeting', 'note']);
export const reminderRecurrenceEnum = pgEnum('reminder_recurrence', ['none', 'daily', 'weekly', 'monthly']);
export const reminderRuleStatusEnum = pgEnum('reminder_rule_status', ['active', 'completed', 'cancelled']);
export const reminderOccurrenceStatusEnum = pgEnum('reminder_occurrence_status', ['pending', 'completed', 'cancelled']);
export const crmImportTypeEnum = pgEnum('crm_import_type', ['customers', 'open_leads']);
export const crmImportBatchStatusEnum = pgEnum('crm_import_batch_status', ['staged', 'committing', 'completed', 'cancelled']);
export const crmImportRowStatusEnum = pgEnum('crm_import_row_status', ['valid', 'invalid', 'created', 'failed']);

export const serviceCategories = pgTable('service_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  nameNormalized: varchar('name_normalized', { length: 120 }).notNull(),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('service_categories_company_code_uidx').on(table.companyId, table.code),
  uniqueIndex('service_categories_company_name_uidx').on(table.companyId, table.nameNormalized),
  index('service_categories_company_status_idx').on(table.companyId, table.status),
  check('service_categories_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const leadPurposes = pgTable('lead_purposes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  nameNormalized: varchar('name_normalized', { length: 120 }).notNull(),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('lead_purposes_company_code_uidx').on(table.companyId, table.code),
  uniqueIndex('lead_purposes_company_name_uidx').on(table.companyId, table.nameNormalized),
  index('lead_purposes_company_status_idx').on(table.companyId, table.status),
  check('lead_purposes_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const marketSectors = pgTable('market_sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  nameNormalized: varchar('name_normalized', { length: 120 }).notNull(),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('market_sectors_company_code_uidx').on(table.companyId, table.code),
  uniqueIndex('market_sectors_company_name_uidx').on(table.companyId, table.nameNormalized),
  index('market_sectors_company_status_idx').on(table.companyId, table.status),
  check('market_sectors_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  displayNameNormalized: varchar('display_name_normalized', { length: 160 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  customerType: varchar('customer_type', { length: 30 }).notNull().default('business'),
  taxIdentifier: varchar('tax_identifier', { length: 40 }),
  gstin: varchar('gstin', { length: 15 }),
  pan: varchar('pan', { length: 10 }),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('customers_company_name_idx').on(table.companyId, table.displayNameNormalized),
  uniqueIndex('customers_company_gstin_uidx').on(table.companyId, table.gstin).where(sql`${table.gstin} is not null`),
  index('customers_company_status_idx').on(table.companyId, table.status),
  check('customers_type_valid', sql`${table.customerType} in ('business', 'individual', 'government', 'other')`),
  check('customers_gstin_valid', sql`${table.gstin} is null or ${table.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
  check('customers_pan_valid', sql`${table.pan} is null or ${table.pan} ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'`),
  check('customers_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const customerMembers = pgTable('customer_members', {
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).notNull().default('editor'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'customer_members_pk', columns: [table.customerId, table.userId] }),
  index('customer_members_user_idx').on(table.companyId, table.userId),
  check('customer_members_role_valid', sql`${table.role} in ('owner', 'editor', 'viewer')`),
]);

export const customerContacts = pgTable('customer_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 120 }).notNull(),
  jobTitle: varchar('job_title', { length: 100 }),
  phone: varchar('phone', { length: 30 }),
  phoneNormalized: varchar('phone_normalized', { length: 20 }),
  email: varchar('email', { length: 254 }),
  emailNormalized: varchar('email_normalized', { length: 254 }),
  isPrimary: boolean('is_primary').notNull().default(false),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('customer_contacts_customer_status_idx').on(table.customerId, table.status),
  uniqueIndex('customer_contacts_customer_primary_uidx')
    .on(table.customerId)
    .where(sql`${table.isPrimary} = true and ${table.status} = 'active'`),
  index('customer_contacts_company_phone_idx').on(table.companyId, table.phoneNormalized),
  index('customer_contacts_company_email_idx').on(table.companyId, table.emailNormalized),
  check('customer_contacts_method_required', sql`${table.phoneNormalized} is not null or ${table.emailNormalized} is not null`),
  check('customer_contacts_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  label: varchar('label', { length: 80 }).notNull(),
  addressLine1: varchar('address_line_1', { length: 200 }).notNull(),
  addressLine2: varchar('address_line_2', { length: 200 }),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('customer_addresses_customer_status_idx').on(table.customerId, table.status),
  check('customer_addresses_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 120 }).notNull(),
  addressLine1: varchar('address_line_1', { length: 200 }).notNull(),
  addressLine2: varchar('address_line_2', { length: 200 }),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sites_customer_status_idx').on(table.customerId, table.status),
  index('sites_company_name_idx').on(table.companyId, table.name),
  check('sites_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadNumber: varchar('lead_number', { length: 40 }).notNull(),
  inquiryName: varchar('inquiry_name', { length: 160 }).notNull(),
  companyName: varchar('company_name', { length: 200 }),
  contactName: varchar('contact_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  phoneNormalized: varchar('phone_normalized', { length: 20 }),
  email: varchar('email', { length: 254 }),
  emailNormalized: varchar('email_normalized', { length: 254 }),
  address: varchar('address', { length: 500 }),
  source: varchar('source', { length: 100 }).notNull(),
  serviceCategoryId: uuid('service_category_id').notNull().references(() => serviceCategories.id, { onDelete: 'restrict' }),
  purposeId: uuid('purpose_id').notNull().references(() => leadPurposes.id, { onDelete: 'restrict' }),
  sectorId: uuid('sector_id').notNull().references(() => marketSectors.id, { onDelete: 'restrict' }),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
  primaryContactId: uuid('primary_contact_id').references(() => customerContacts.id, { onDelete: 'restrict' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  stage: leadStageEnum('stage').notNull().default('new'),
  lostReason: varchar('lost_reason', { length: 500 }),
  qualificationNotes: varchar('qualification_notes', { length: 1000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('leads_company_number_uidx').on(table.companyId, table.leadNumber),
  index('leads_company_owner_stage_idx').on(table.companyId, table.ownerUserId, table.stage),
  index('leads_company_purpose_idx').on(table.companyId, table.purposeId),
  index('leads_company_sector_idx').on(table.companyId, table.sectorId),
  index('leads_company_phone_idx').on(table.companyId, table.phoneNormalized),
  index('leads_company_email_idx').on(table.companyId, table.emailNormalized),
  check('leads_contact_method_required', sql`${table.phoneNormalized} is not null or ${table.emailNormalized} is not null`),
  check('leads_lost_reason_consistent', sql`(${table.stage} = 'lost' and ${table.lostReason} is not null) or (${table.stage} <> 'lost' and ${table.lostReason} is null)`),
  check('leads_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const leadMembers = pgTable('lead_members', {
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).notNull().default('collaborator'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'lead_members_pk', columns: [table.leadId, table.userId] }),
  index('lead_members_user_idx').on(table.companyId, table.userId),
  check('lead_members_role_valid', sql`${table.role} in ('owner', 'collaborator', 'viewer')`),
]);

export const crmActivities = pgTable('crm_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  type: crmActivityTypeEnum('type').notNull(),
  summary: varchar('summary', { length: 2_000 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('crm_activities_lead_occurred_idx').on(table.companyId, table.leadId, table.occurredAt),
]);

export const reminderRules = pgTable('reminder_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  assigneeUserId: uuid('assignee_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 200 }).notNull(),
  timezone: varchar('timezone', { length: 80 }).notNull(),
  recurrence: reminderRecurrenceEnum('recurrence').notNull().default('none'),
  status: reminderRuleStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('reminder_rules_lead_status_idx').on(table.companyId, table.leadId, table.status),
  check('reminder_rules_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const reminderOccurrences = pgTable('reminder_occurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  ruleId: uuid('rule_id').notNull().references(() => reminderRules.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  assigneeUserId: uuid('assignee_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  status: reminderOccurrenceStatusEnum('status').notNull().default('pending'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('reminder_occurrences_rule_due_uidx').on(table.ruleId, table.dueAt),
  index('reminder_occurrences_assignee_due_idx').on(table.companyId, table.assigneeUserId, table.status, table.dueAt),
  index('reminder_occurrences_lead_due_idx').on(table.companyId, table.leadId, table.dueAt),
  check('reminder_occurrences_row_version_positive', sql`${table.rowVersion} > 0`),
  check('reminder_occurrences_completion_consistent', sql`(${table.status} = 'completed' and ${table.completedAt} is not null and ${table.completedByUserId} is not null) or (${table.status} <> 'completed' and ${table.completedAt} is null and ${table.completedByUserId} is null)`),
]);

export const leadAttachments = pgTable('lead_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageName: varchar('storage_name', { length: 64 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('lead_attachments_storage_name_uidx').on(table.storageName),
  index('lead_attachments_lead_created_idx').on(table.companyId, table.leadId, table.createdAt),
  check('lead_attachments_size_positive', sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 20971520`),
]);

export type CrmImportPayload = Record<string, string | null>;
export type CrmImportIssue = { field?: string; message: string };

export const crmImportBatches = pgTable('crm_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  type: crmImportTypeEnum('type').notNull(),
  status: crmImportBatchStatusEnum('status').notNull().default('staged'),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageName: varchar('storage_name', { length: 64 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  totalRows: integer('total_rows').notNull(),
  validRows: integer('valid_rows').notNull(),
  invalidRows: integer('invalid_rows').notNull(),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp('committed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('crm_import_batches_storage_name_uidx').on(table.storageName),
  index('crm_import_batches_company_created_idx').on(table.companyId, table.createdAt),
  check('crm_import_batches_counts_valid', sql`${table.totalRows} >= 0 and ${table.validRows} >= 0 and ${table.invalidRows} >= 0 and ${table.totalRows} = ${table.validRows} + ${table.invalidRows}`),
  check('crm_import_batches_file_size_valid', sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 5242880`),
  check('crm_import_batches_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const crmImportRows = pgTable('crm_import_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  batchId: uuid('batch_id').notNull().references(() => crmImportBatches.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  payload: jsonb('payload').$type<CrmImportPayload>().notNull(),
  issues: jsonb('issues').$type<CrmImportIssue[]>().notNull().default([]),
  warnings: jsonb('warnings').$type<CrmImportIssue[]>().notNull().default([]),
  status: crmImportRowStatusEnum('status').notNull(),
  createdRecordId: uuid('created_record_id'),
  resultMessage: varchar('result_message', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('crm_import_rows_batch_row_uidx').on(table.batchId, table.rowNumber),
  index('crm_import_rows_batch_status_idx').on(table.companyId, table.batchId, table.status),
  check('crm_import_rows_row_number_valid', sql`${table.rowNumber} >= 2`),
  check('crm_import_rows_result_consistent', sql`(${table.status} = 'created' and ${table.createdRecordId} is not null) or ${table.status} <> 'created'`),
]);

export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  primaryContactId: uuid('primary_contact_id').notNull().references(() => customerContacts.id, { onDelete: 'restrict' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 200 }).notNull(),
  commercialState: opportunityCommercialStateEnum('commercial_state').notNull().default('unawarded'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('opportunities_company_lead_uidx').on(table.companyId, table.leadId),
  index('opportunities_company_customer_idx').on(table.companyId, table.customerId),
  check('opportunities_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const opportunityMembers = pgTable('opportunity_members', {
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'opportunity_members_pk', columns: [table.opportunityId, table.userId] }),
  index('opportunity_members_user_idx').on(table.companyId, table.userId),
  check('opportunity_members_role_valid', sql`${table.role} in ('owner', 'sales', 'viewer')`),
]);

export type Customer = typeof customers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type ReminderOccurrence = typeof reminderOccurrences.$inferSelect;
export type LeadAttachment = typeof leadAttachments.$inferSelect;
export type CrmImportBatch = typeof crmImportBatches.$inferSelect;
export type CrmImportRow = typeof crmImportRows.$inferSelect;
