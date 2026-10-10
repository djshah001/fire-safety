import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { companies } from './organizations.js';

export const outboxJobStatusEnum = pgEnum('outbox_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const documentCounters = pgTable('document_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  documentType: varchar('document_type', { length: 50 }).notNull(),
  periodKey: varchar('period_key', { length: 20 }).notNull(),
  nextValue: integer('next_value').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('document_counters_scope_uidx').on(table.companyId, table.documentType, table.periodKey),
  check('document_counters_next_positive', sql`${table.nextValue} > 0`),
]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 80 }).notNull(),
  targetId: uuid('target_id'),
  requestId: varchar('request_id', { length: 100 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_events_target_idx').on(table.companyId, table.targetType, table.targetId, table.occurredAt),
  index('audit_events_actor_idx').on(table.companyId, table.actorUserId, table.occurredAt),
]);

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  action: varchar('action', { length: 100 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('idempotency_actor_action_key_uidx').on(
    table.companyId,
    table.actorUserId,
    table.action,
    table.idempotencyKey,
  ),
  index('idempotency_expiry_idx').on(table.expiresAt),
  check('idempotency_response_status_valid', sql`${table.responseStatus} is null or (${table.responseStatus} >= 200 and ${table.responseStatus} <= 599)`),
]);

export const outboxJobs = pgTable('outbox_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 100 }).notNull(),
  payloadVersion: integer('payload_version').notNull().default(1),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  dedupKey: varchar('dedup_key', { length: 200 }).notNull(),
  status: outboxJobStatusEnum('status').notNull().default('pending'),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  leaseOwner: varchar('lease_owner', { length: 100 }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastError: text('last_error'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('outbox_jobs_dedup_uidx').on(table.companyId, table.type, table.dedupKey),
  index('outbox_jobs_claim_idx').on(table.status, table.dueAt, table.leaseExpiresAt),
  check('outbox_jobs_attempts_valid', sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`),
  check('outbox_jobs_payload_version_positive', sql`${table.payloadVersion} > 0`),
]);
