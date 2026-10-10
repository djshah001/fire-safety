import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
  currencyCode: varchar('currency_code', { length: 3 }).notNull().default('INR'),
  isActive: boolean('is_active').notNull().default(true),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('companies_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 32 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('branches_company_code_uidx').on(table.companyId, table.code),
  index('branches_company_active_idx').on(table.companyId, table.isActive),
  check('branches_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export type Company = typeof companies.$inferSelect;
export type Branch = typeof branches.$inferSelect;
