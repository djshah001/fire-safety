import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
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

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  displayNameNormalized: varchar('display_name_normalized', { length: 160 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  taxIdentifier: varchar('tax_identifier', { length: 40 }),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('customers_company_name_idx').on(table.companyId, table.displayNameNormalized),
  index('customers_company_status_idx').on(table.companyId, table.status),
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
