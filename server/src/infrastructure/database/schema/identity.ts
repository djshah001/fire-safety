import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './organizations.js';

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  employeeCode: varchar('employee_code', { length: 40 }),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 254 }).notNull(),
  emailNormalized: varchar('email_normalized', { length: 254 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  status: userStatusEnum('status').notNull().default('active'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  accessVersion: integer('access_version').notNull().default(1),
  rowVersion: integer('row_version').notNull().default(1),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  disabledReason: varchar('disabled_reason', { length: 500 }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_company_email_uidx').on(table.companyId, table.emailNormalized),
  uniqueIndex('users_company_employee_code_uidx')
    .on(table.companyId, table.employeeCode)
    .where(sql`${table.employeeCode} is not null`),
  index('users_company_status_idx').on(table.companyId, table.status),
  check('users_access_version_positive', sql`${table.accessVersion} > 0`),
  check('users_row_version_positive', sql`${table.rowVersion} > 0`),
  check(
    'users_disabled_fields_consistent',
    sql`(${table.status} = 'disabled' and ${table.disabledAt} is not null) or (${table.status} = 'active' and ${table.disabledAt} is null)`,
  ),
]);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id').notNull().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  accessVersion: integer('access_version').notNull(),
  userAgent: varchar('user_agent', { length: 500 }),
  ipAddress: varchar('ip_address', { length: 64 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokeReason: varchar('revoke_reason', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('auth_sessions_token_hash_uidx').on(table.tokenHash),
  index('auth_sessions_user_active_idx').on(table.userId, table.revokedAt, table.expiresAt),
  index('auth_sessions_family_idx').on(table.familyId),
  check('auth_sessions_access_version_positive', sql`${table.accessVersion} > 0`),
]);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('password_reset_tokens_hash_uidx').on(table.tokenHash),
  index('password_reset_tokens_user_idx').on(table.userId, table.expiresAt),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
