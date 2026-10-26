import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { masterStatusEnum } from './crm.js';
import { users } from './identity.js';
import { companies } from './organizations.js';

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  nameNormalized: varchar('name_normalized', { length: 80 }).notNull(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('units_company_code_uidx').on(table.companyId, table.code),
  uniqueIndex('units_company_name_uidx').on(table.companyId, table.nameNormalized),
  index('units_company_status_idx').on(table.companyId, table.status),
  check('units_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const itemCategories = pgTable('item_categories', {
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
  uniqueIndex('item_categories_company_code_uidx').on(table.companyId, table.code),
  uniqueIndex('item_categories_company_name_uidx').on(table.companyId, table.nameNormalized),
  index('item_categories_company_status_idx').on(table.companyId, table.status),
  check('item_categories_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const brands = pgTable('brands', {
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
  uniqueIndex('brands_company_code_uidx').on(table.companyId, table.code),
  uniqueIndex('brands_company_name_uidx').on(table.companyId, table.nameNormalized),
  index('brands_company_status_idx').on(table.companyId, table.status),
  check('brands_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  nameNormalized: varchar('name_normalized', { length: 160 }).notNull(),
  specification: varchar('specification', { length: 2_000 }),
  categoryId: uuid('category_id').notNull().references(() => itemCategories.id, { onDelete: 'restrict' }),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('items_company_code_uidx').on(table.companyId, table.code),
  index('items_company_name_idx').on(table.companyId, table.nameNormalized),
  index('items_company_category_idx').on(table.companyId, table.categoryId),
  index('items_company_unit_idx').on(table.companyId, table.unitId),
  index('items_company_status_idx').on(table.companyId, table.status),
  check('items_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const itemBrands = pgTable('item_brands', {
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'restrict' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'item_brands_pk', columns: [table.itemId, table.brandId] }),
  index('item_brands_company_brand_idx').on(table.companyId, table.brandId),
]);

export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  displayNameNormalized: varchar('display_name_normalized', { length: 160 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  taxIdentifier: varchar('tax_identifier', { length: 40 }),
  addressLine1: varchar('address_line_1', { length: 200 }),
  addressLine2: varchar('address_line_2', { length: 200 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }),
  status: masterStatusEnum('status').notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('vendors_company_code_uidx').on(table.companyId, table.code),
  index('vendors_company_name_idx').on(table.companyId, table.displayNameNormalized),
  index('vendors_company_status_idx').on(table.companyId, table.status),
  check('vendors_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const vendorContacts = pgTable('vendor_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
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
  uniqueIndex('vendor_contacts_vendor_primary_uidx')
    .on(table.vendorId)
    .where(sql`${table.isPrimary} = true and ${table.status} = 'active'`),
  index('vendor_contacts_vendor_status_idx').on(table.vendorId, table.status),
  index('vendor_contacts_company_phone_idx').on(table.companyId, table.phoneNormalized),
  index('vendor_contacts_company_email_idx').on(table.companyId, table.emailNormalized),
  check('vendor_contacts_method_required', sql`${table.phoneNormalized} is not null or ${table.emailNormalized} is not null`),
  check('vendor_contacts_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export type Unit = typeof units.$inferSelect;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type VendorContact = typeof vendorContacts.$inferSelect;
