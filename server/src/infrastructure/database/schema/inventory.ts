import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { boqLines } from './engineering.js';
import { items } from './masters.js';
import { users } from './identity.js';
import { companies } from './organizations.js';
import { projects } from './projects.js';

export const warehouseTypeEnum = pgEnum('warehouse_type', [
  'central_warehouse',
  'regional_depot',
  'project_site_store',
]);

export const stockDocumentTypeEnum = pgEnum('stock_document_type', [
  'receipt',
  'opening_balance',
  'site_dispatch',
  'site_issue',
  'site_return',
  'warehouse_transfer',
  'adjustment',
]);

export const stockDocumentStatusEnum = pgEnum('stock_document_status', [
  'draft',
  'posted',
  'cancelled',
]);

export const stockTransferStatusEnum = pgEnum('stock_transfer_status', [
  'draft',
  'dispatched',
  'received',
  'cancelled',
]);

export const stockReservationStatusEnum = pgEnum('stock_reservation_status', [
  'active',
  'fulfilled',
  'released',
]);

export const stockLedgerDirectionEnum = pgEnum('stock_ledger_direction', [
  'in',
  'out',
]);

export const stockLedgerSourceTypeEnum = pgEnum('stock_ledger_source_type', [
  'goods_receipt_line',
  'opening_balance',
  'transfer_dispatch',
  'transfer_receipt',
  'site_issue',
  'site_return',
  'adjustment',
]);

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  warehouseType: warehouseTypeEnum('warehouse_type').notNull().default('central_warehouse'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  addressLine1: varchar('address_line1', { length: 255 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 20 }),
  inChargeUserId: uuid('in_charge_user_id').references(() => users.id, { onDelete: 'set null' }),
  isActive: integer('is_active').notNull().default(1),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('warehouses_company_code_uidx').on(table.companyId, table.code),
  index('warehouses_company_type_idx').on(table.companyId, table.warehouseType, table.isActive),
  index('warehouses_company_project_idx').on(table.companyId, table.projectId),
  check('warehouses_code_not_empty', sql`length(trim(${table.code})) > 0`),
  check('warehouses_name_not_empty', sql`length(trim(${table.name})) > 0`),
  check('warehouses_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const stockLocations = pgTable('stock_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_locations_warehouse_code_uidx').on(table.warehouseId, table.code),
  index('stock_locations_company_warehouse_idx').on(table.companyId, table.warehouseId),
  check('stock_locations_code_not_empty', sql`length(trim(${table.code})) > 0`),
]);

export const stockBalances = pgTable('stock_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  quantityReserved: numeric('quantity_reserved', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_balances_warehouse_item_uidx').on(table.warehouseId, table.itemId),
  index('stock_balances_company_item_idx').on(table.companyId, table.itemId),
  check('stock_balances_quantity_on_hand_nonnegative', sql`${table.quantityOnHand} >= 0`),
  check('stock_balances_quantity_reserved_valid', sql`${table.quantityReserved} >= 0 and ${table.quantityReserved} <= ${table.quantityOnHand}`),
  check('stock_balances_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const stockLedgerEntries = pgTable('stock_ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  entryNumber: varchar('entry_number', { length: 50 }).notNull(),
  postingDate: timestamp('posting_date', { withTimezone: true }).notNull().defaultNow(),
  sourceType: stockLedgerSourceTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  sourceReference: varchar('source_reference', { length: 120 }).notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  direction: stockLedgerDirectionEnum('direction').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  balanceBefore: numeric('balance_before', { precision: 18, scale: 4 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }),
  notes: varchar('notes', { length: 1_000 }),
  postedByUserId: uuid('posted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_ledger_entries_company_number_uidx').on(table.companyId, table.entryNumber),
  uniqueIndex('stock_ledger_entries_unique_source_posting_uidx').on(
    table.companyId,
    table.sourceType,
    table.sourceId,
    table.warehouseId,
    table.direction,
  ),
  index('stock_ledger_entries_warehouse_item_idx').on(table.warehouseId, table.itemId, table.postingDate),
  index('stock_ledger_entries_source_idx').on(table.companyId, table.sourceType, table.sourceId),
  check('stock_ledger_entries_quantity_positive', sql`${table.quantity} > 0`),
  check('stock_ledger_entries_balances_valid', sql`
    (${table.direction} = 'in' and ${table.balanceAfter} = ${table.balanceBefore} + ${table.quantity}) or
    (${table.direction} = 'out' and ${table.balanceAfter} = ${table.balanceBefore} - ${table.quantity})
  `),
]);

export const stockDocuments = pgTable('stock_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  documentType: stockDocumentTypeEnum('document_type').notNull(),
  status: stockDocumentStatusEnum('status').notNull().default('draft'),
  sourceWarehouseId: uuid('source_warehouse_id').references(() => warehouses.id, { onDelete: 'restrict' }),
  destinationWarehouseId: uuid('destination_warehouse_id').references(() => warehouses.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  referenceNumber: varchar('reference_number', { length: 100 }),
  documentDate: date('document_date').notNull(),
  notes: varchar('notes', { length: 2_000 }),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  postedByUserId: uuid('posted_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_documents_company_number_uidx').on(table.companyId, table.documentNumber),
  index('stock_documents_company_type_status_idx').on(table.companyId, table.documentType, table.status),
  index('stock_documents_project_idx').on(table.companyId, table.projectId),
  check('stock_documents_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const stockDocumentLines = pgTable('stock_document_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  stockDocumentId: uuid('stock_document_id').notNull().references(() => stockDocuments.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unitRate: numeric('unit_rate', { precision: 18, scale: 2 }),
  notes: varchar('notes', { length: 1_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_document_lines_doc_line_uidx').on(table.stockDocumentId, table.lineNumber),
  index('stock_document_lines_item_idx').on(table.companyId, table.itemId),
  check('stock_document_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('stock_document_lines_quantity_positive', sql`${table.quantity} > 0`),
]);

export const stockTransfers = pgTable('stock_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  transferNumber: varchar('transfer_number', { length: 50 }).notNull(),
  status: stockTransferStatusEnum('status').notNull().default('draft'),
  sourceWarehouseId: uuid('source_warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  destinationWarehouseId: uuid('destination_warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  challanNumber: varchar('challan_number', { length: 100 }),
  vehicleNumber: varchar('vehicle_number', { length: 50 }),
  transporterName: varchar('transporter_name', { length: 160 }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  dispatchedByUserId: uuid('dispatched_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedByUserId: uuid('received_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  notes: varchar('notes', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_transfers_company_number_uidx').on(table.companyId, table.transferNumber),
  index('stock_transfers_company_status_idx').on(table.companyId, table.status),
  index('stock_transfers_warehouses_idx').on(table.companyId, table.sourceWarehouseId, table.destinationWarehouseId),
  check('stock_transfers_warehouses_distinct', sql`${table.sourceWarehouseId} <> ${table.destinationWarehouseId}`),
  check('stock_transfers_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const stockTransferLines = pgTable('stock_transfer_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  transferId: uuid('transfer_id').notNull().references(() => stockTransfers.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  dispatchedQuantity: numeric('dispatched_quantity', { precision: 18, scale: 4 }).notNull(),
  receivedQuantity: numeric('received_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  notes: varchar('notes', { length: 1_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_transfer_lines_transfer_line_uidx').on(table.transferId, table.lineNumber),
  index('stock_transfer_lines_item_idx').on(table.companyId, table.itemId),
  check('stock_transfer_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('stock_transfer_lines_dispatched_positive', sql`${table.dispatchedQuantity} > 0`),
  check('stock_transfer_lines_received_valid', sql`${table.receivedQuantity} >= 0 and ${table.receivedQuantity} <= ${table.dispatchedQuantity}`),
]);

export const stockReservations = pgTable('stock_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  reservationNumber: varchar('reservation_number', { length: 50 }).notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  boqLineId: uuid('boq_line_id').references(() => boqLines.id, { onDelete: 'set null' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  quantityReserved: numeric('quantity_reserved', { precision: 18, scale: 4 }).notNull(),
  quantityIssued: numeric('quantity_issued', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  status: stockReservationStatusEnum('status').notNull().default('active'),
  reservedByUserId: uuid('reserved_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  notes: varchar('notes', { length: 1_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_reservations_company_number_uidx').on(table.companyId, table.reservationNumber),
  index('stock_reservations_project_status_idx').on(table.companyId, table.projectId, table.status),
  index('stock_reservations_warehouse_item_idx').on(table.warehouseId, table.itemId),
  check('stock_reservations_quantities_valid', sql`${table.quantityReserved} > 0 and ${table.quantityIssued} >= 0 and ${table.quantityIssued} <= ${table.quantityReserved}`),
  check('stock_reservations_row_version_positive', sql`${table.rowVersion} > 0`),
]);
