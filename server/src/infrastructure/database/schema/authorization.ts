import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches, companies } from './organizations.js';

export const scopeKindEnum = pgEnum('scope_kind', [
  'company',
  'branch',
  'opportunity',
  'design_job',
  'project',
  'warehouse',
]);

export const permissions = pgTable('permissions', {
  code: varchar('code', { length: 100 }).primaryKey(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('roles_company_code_uidx').on(table.companyId, table.code),
  index('roles_company_active_idx').on(table.companyId, table.isActive),
  check('roles_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionCode: varchar('permission_code', { length: 100 }).notNull().references(() => permissions.code, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'role_permissions_pk', columns: [table.roleId, table.permissionCode] }),
]);

export const userRoleAssignments = pgTable('user_role_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('user_roles_company_wide_uidx')
    .on(table.userId, table.roleId)
    .where(sql`${table.branchId} is null`),
  uniqueIndex('user_roles_branch_uidx')
    .on(table.userId, table.roleId, table.branchId)
    .where(sql`${table.branchId} is not null`),
  index('user_roles_company_user_idx').on(table.companyId, table.userId),
  check('user_roles_valid_range', sql`${table.validUntil} is null or ${table.validUntil} > ${table.validFrom}`),
]);

export const scopedGrants = pgTable('scoped_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permissionCode: varchar('permission_code', { length: 100 }).notNull().references(() => permissions.code, { onDelete: 'restrict' }),
  scopeKind: scopeKindEnum('scope_kind').notNull(),
  scopeId: uuid('scope_id'),
  reason: varchar('reason', { length: 500 }).notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('scoped_grants_user_permission_idx').on(table.companyId, table.userId, table.permissionCode),
  check(
    'scoped_grants_scope_id_consistent',
    sql`(${table.scopeKind} = 'company' and ${table.scopeId} is null) or (${table.scopeKind} <> 'company' and ${table.scopeId} is not null)`,
  ),
  check('scoped_grants_valid_range', sql`${table.validUntil} is null or ${table.validUntil} > ${table.validFrom}`),
]);

export type Permission = typeof permissions.$inferSelect;
export type Role = typeof roles.$inferSelect;
