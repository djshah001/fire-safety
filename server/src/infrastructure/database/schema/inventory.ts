import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { boqLines, quotationLines, quotationRevisions } from './engineering.js';
import { itemBrandOfferings, items, units } from './masters.js';
import { users } from './identity.js';
import { companies } from './organizations.js';
import { purchaseOrders } from './procurement.js';
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

export const stockLocationTypeEnum = pgEnum('stock_location_type', [
  'main',
  'in_transit',
  'site',
  'staging',
]);

export const stockLedgerSourceTypeEnum = pgEnum('stock_ledger_source_type', [
  'goods_receipt_line',
  'opening_balance',
  'transfer_dispatch',
  'transfer_receipt',
  'site_issue',
  'site_return',
  'adjustment',
  'dc_dispatch_out',
  'dc_dispatch_in',
  'dc_pod_in',
  'dc_discrepancy_return',
  'dc_discrepancy_writeoff',
  'dc_discrepancy_restock',
  'site_return_out',
  'site_return_in',
]);

export const replenishmentRequestStatusEnum = pgEnum('replenishment_request_status', [
  'open',
  'ordered',
  'dismissed',
]);

export const materialIssueRequestStatusEnum = pgEnum('material_issue_request_status', [
  'open',
  'partially_dispatched',
  'dispatched',
  'completed',
  'short_closed',
  'cancelled',
]);

export const deliveryChallanStatusEnum = pgEnum('delivery_challan_status', [
  'dispatched',
  'verified',
  'discrepancy_pending',
  'resolved',
  'cancelled',
]);

export const siteReturnStatusEnum = pgEnum('site_return_status', [
  'submitted',
  'accepted',
  'rejected',
  'cancelled',
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
  locationType: stockLocationTypeEnum('location_type').notNull().default('main'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  isActive: integer('is_active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_locations_warehouse_code_uidx').on(table.warehouseId, table.code),
  uniqueIndex('stock_locations_warehouse_project_site_uidx')
    .on(table.warehouseId, table.projectId)
    .where(sql`${table.locationType} = 'site' and ${table.projectId} is not null`),
  index('stock_locations_company_warehouse_idx').on(table.companyId, table.warehouseId),
  index('stock_locations_warehouse_type_idx').on(table.companyId, table.warehouseId, table.locationType),
  check('stock_locations_code_not_empty', sql`length(trim(${table.code})) > 0`),
  check('stock_locations_site_project_consistent', sql`${table.locationType} <> 'site' or ${table.projectId} is not null`),
]);

export const stockBalances = pgTable('stock_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  locationId: uuid('location_id').notNull().references(() => stockLocations.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  quantityReserved: numeric('quantity_reserved', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('stock_balances_wh_loc_item_brand_uidx').on(
    table.companyId,
    table.warehouseId,
    table.locationId,
    table.itemId,
    sql`COALESCE(${table.brandOfferingId}, '00000000-0000-0000-0000-000000000000')`,
  ),
  index('stock_balances_company_item_idx').on(table.companyId, table.itemId),
  index('stock_balances_location_idx').on(table.companyId, table.locationId, table.itemId),
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
  locationId: uuid('location_id').notNull().references(() => stockLocations.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
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
    table.locationId,
    table.itemId,
    sql`COALESCE(${table.brandOfferingId}, '00000000-0000-0000-0000-000000000000')`,
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
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
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
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
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

export const warehouseItemThresholds = pgTable('warehouse_item_thresholds', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  minStock: numeric('min_stock', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  maxStock: numeric('max_stock', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  lowStockAlertActive: boolean('low_stock_alert_active').notNull().default(false),
  lowStockAlertSentAt: timestamp('low_stock_alert_sent_at', { withTimezone: true }),
  updatedByUserId: uuid('updated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('warehouse_item_thresholds_wh_item_brand_uidx').on(
    table.companyId,
    table.warehouseId,
    table.itemId,
    sql`COALESCE(${table.brandOfferingId}, '00000000-0000-0000-0000-000000000000')`,
  ),
  index('warehouse_item_thresholds_company_alert_idx').on(table.companyId, table.warehouseId, table.lowStockAlertActive),
  check('warehouse_item_thresholds_min_max_valid', sql`${table.minStock} >= 0 and ${table.maxStock} >= ${table.minStock}`),
  check('warehouse_item_thresholds_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const storeReplenishmentRequests = pgTable('store_replenishment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  srrNumber: varchar('srr_number', { length: 50 }).notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  requestedQty: numeric('requested_qty', { precision: 18, scale: 4 }).notNull(),
  currentFreeQty: numeric('current_free_qty', { precision: 18, scale: 4 }).notNull(),
  minStock: numeric('min_stock', { precision: 18, scale: 4 }).notNull(),
  maxStock: numeric('max_stock', { precision: 18, scale: 4 }).notNull(),
  status: replenishmentRequestStatusEnum('status').notNull().default('open'),
  linkedPoId: uuid('linked_po_id').references((): AnyPgColumn => purchaseOrders.id, { onDelete: 'set null' }),
  requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  notes: varchar('notes', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('store_replenishment_requests_company_number_uidx').on(table.companyId, table.srrNumber),
  index('store_replenishment_requests_company_status_idx').on(table.companyId, table.status, table.createdAt),
  index('store_replenishment_requests_warehouse_item_idx').on(table.warehouseId, table.itemId),
  check('store_replenishment_requests_qty_positive', sql`${table.requestedQty} > 0 and ${table.currentFreeQty} >= 0 and ${table.minStock} >= 0 and ${table.maxStock} >= ${table.minStock}`),
  check('store_replenishment_requests_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const materialIssueRequests = pgTable('material_issue_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  mirNumber: varchar('mir_number', { length: 50 }).notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').notNull().references(() => quotationRevisions.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  status: materialIssueRequestStatusEnum('status').notNull().default('open'),
  requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  notes: varchar('notes', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('material_issue_requests_company_number_uidx').on(table.companyId, table.mirNumber),
  index('material_issue_requests_project_status_idx').on(table.companyId, table.projectId, table.status),
  index('material_issue_requests_warehouse_status_idx').on(table.companyId, table.warehouseId, table.status),
  check('material_issue_requests_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const materialIssueRequestLines = pgTable('material_issue_request_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  mirId: uuid('mir_id').notNull().references(() => materialIssueRequests.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  quotationLineId: uuid('quotation_line_id').notNull().references(() => quotationLines.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
  requestedQty: numeric('requested_qty', { precision: 18, scale: 4 }).notNull(),
  reservedQty: numeric('reserved_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  dispatchedQty: numeric('dispatched_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  verifiedReceivedQty: numeric('verified_received_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  damagedOrShortQty: numeric('damaged_or_short_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  reservationId: uuid('reservation_id').references(() => stockReservations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('material_issue_request_lines_mir_line_uidx').on(table.mirId, table.lineNumber),
  index('material_issue_request_lines_quotation_line_idx').on(table.companyId, table.quotationLineId),
  check('material_issue_request_lines_number_positive', sql`${table.lineNumber} > 0`),
  check(
    'material_issue_request_lines_quantities_valid',
    sql`${table.requestedQty} > 0 and ${table.reservedQty} >= 0 and ${table.dispatchedQty} >= 0 and ${table.dispatchedQty} <= ${table.requestedQty} and ${table.verifiedReceivedQty} >= 0 and ${table.damagedOrShortQty} >= 0 and ${table.verifiedReceivedQty} + ${table.damagedOrShortQty} <= ${table.dispatchedQty}`,
  ),
]);

export const deliveryChallans = pgTable('delivery_challans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  dcNumber: varchar('dc_number', { length: 50 }).notNull(),
  mirId: uuid('mir_id').notNull().references(() => materialIssueRequests.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  siteLocationId: uuid('site_location_id').notNull().references(() => stockLocations.id, { onDelete: 'restrict' }),
  status: deliveryChallanStatusEnum('status').notNull().default('dispatched'),
  dispatchedByUserId: uuid('dispatched_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
  transporterName: varchar('transporter_name', { length: 160 }),
  vehicleNumber: varchar('vehicle_number', { length: 50 }),
  receiverName: varchar('receiver_name', { length: 160 }),
  pdfStorageName: varchar('pdf_storage_name', { length: 255 }),
  pdfChecksumSha256: varchar('pdf_checksum_sha256', { length: 64 }),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  podPhotoStorageName: varchar('pod_photo_storage_name', { length: 255 }),
  podPhotoChecksumSha256: varchar('pod_photo_checksum_sha256', { length: 64 }),
  verificationNotes: varchar('verification_notes', { length: 2_000 }),
  discrepancyResolutionNotes: varchar('discrepancy_resolution_notes', { length: 2_000 }),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('delivery_challans_company_number_uidx').on(table.companyId, table.dcNumber),
  index('delivery_challans_project_status_idx').on(table.companyId, table.projectId, table.status),
  index('delivery_challans_mir_idx').on(table.companyId, table.mirId),
  check('delivery_challans_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const deliveryChallanLines = pgTable('delivery_challan_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  dcId: uuid('dc_id').notNull().references(() => deliveryChallans.id, { onDelete: 'restrict' }),
  mirLineId: uuid('mir_line_id').notNull().references(() => materialIssueRequestLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  dispatchedQty: numeric('dispatched_qty', { precision: 18, scale: 4 }).notNull(),
  verifiedReceivedQty: numeric('verified_received_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  damagedOrShortQty: numeric('damaged_or_short_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  lineRemarks: varchar('line_remarks', { length: 1_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('delivery_challan_lines_dc_line_uidx').on(table.dcId, table.lineNumber),
  index('delivery_challan_lines_mir_line_idx').on(table.companyId, table.mirLineId),
  check('delivery_challan_lines_number_positive', sql`${table.lineNumber} > 0`),
  check(
    'delivery_challan_lines_quantities_valid',
    sql`${table.dispatchedQty} > 0 and ${table.verifiedReceivedQty} >= 0 and ${table.damagedOrShortQty} >= 0 and ${table.verifiedReceivedQty} + ${table.damagedOrShortQty} <= ${table.dispatchedQty}`,
  ),
]);

export const siteReturns = pgTable('site_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  returnNumber: varchar('return_number', { length: 50 }).notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  siteLocationId: uuid('site_location_id').notNull().references(() => stockLocations.id, { onDelete: 'restrict' }),
  status: siteReturnStatusEnum('status').notNull().default('submitted'),
  submittedByUserId: uuid('submitted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  reason: varchar('reason', { length: 1_000 }).notNull(),
  notes: varchar('notes', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('site_returns_company_number_uidx').on(table.companyId, table.returnNumber),
  index('site_returns_project_status_idx').on(table.companyId, table.projectId, table.status),
  check('site_returns_reason_required', sql`length(trim(${table.reason})) > 0`),
  check('site_returns_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const siteReturnLines = pgTable('site_return_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  siteReturnId: uuid('site_return_id').notNull().references(() => siteReturns.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  conditionNotes: varchar('condition_notes', { length: 1_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('site_return_lines_return_line_uidx').on(table.siteReturnId, table.lineNumber),
  index('site_return_lines_item_idx').on(table.companyId, table.itemId),
  check('site_return_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('site_return_lines_quantity_positive', sql`${table.quantity} > 0`),
]);
