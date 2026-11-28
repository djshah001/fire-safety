import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { boqLines, boqRevisions, quotationLines, quotationRevisions } from './engineering.js';
import { itemBrandOfferings, items, units, vendorPriceInquiryResponses, vendors } from './masters.js';
import { users } from './identity.js';
import { storeReplenishmentRequests } from './inventory.js';
import { companies } from './organizations.js';
import { projects } from './projects.js';

export const procurementRequisitionStatusEnum = pgEnum('procurement_requisition_status', ['open', 'sourcing', 'selected']);
export const procurementRfqStatusEnum = pgEnum('procurement_rfq_status', ['open', 'selected', 'cancelled']);
export const vendorOfferStatusEnum = pgEnum('vendor_offer_status', ['submitted']);
export const purchaseComparisonStatusEnum = pgEnum('purchase_comparison_status', ['open', 'selected']);
export const offerEquivalenceEnum = pgEnum('offer_equivalence', ['equivalent', 'deviation', 'unknown']);
export const substitutionDecisionEnum = pgEnum('substitution_decision', ['approved', 'rejected']);
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'pending_approval',
  'approved',
  'issued',
  'partially_delivered',
  'delivered',
  'short_closed',
  'closed',
  'cancelled',
]);
export const purchaseOrderDispatchChannelEnum = pgEnum('purchase_order_dispatch_channel', [
  'email',
  'whatsapp_msg91',
  'whatsapp_manual',
]);
export const purchaseOrderDispatchStatusEnum = pgEnum('purchase_order_dispatch_status', [
  'queued',
  'sent',
  'failed',
  'manual_opened',
]);
export const supplierReturnStatusEnum = pgEnum('supplier_return_status', [
  'draft',
  'dispatched',
  'replacement_received',
  'credit_settled',
  'closed',
]);
export const supplierReturnResolutionTypeEnum = pgEnum('supplier_return_resolution_type', [
  'replacement',
  'credit_note',
  'deduction',
]);
export const purchaseOrderRevisionStatusEnum = pgEnum('purchase_order_revision_status', [
  'draft',
  'submitted',
  'approved',
  'issued',
  'superseded',
  'cancelled',
]);
export const goodsReceiptStatusEnum = pgEnum('goods_receipt_status', [
  'draft',
  'inspected',
  'accepted',
  'partially_rejected',
  'rejected',
]);
export const poLineDestinationTypeEnum = pgEnum('po_line_destination_type', [
  'warehouse',
  'direct_to_site',
]);

export const procurementRequisitions = pgTable('procurement_requisitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').references(() => boqRevisions.id, { onDelete: 'restrict' }),
  quotationRevisionId: uuid('quotation_revision_id').references(() => quotationRevisions.id, { onDelete: 'set null' }),
  requisitionNumber: varchar('requisition_number', { length: 40 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  status: procurementRequisitionStatusEnum('status').notNull().default('open'),
  buyerUserId: uuid('buyer_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  purchaseManagerUserId: uuid('purchase_manager_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  requiredBy: date('required_by').notNull(),
  deliveryLocation: varchar('delivery_location', { length: 500 }).notNull(),
  notes: varchar('notes', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_requisitions_company_number_uidx').on(table.companyId, table.requisitionNumber),
  index('procurement_requisitions_buyer_status_idx').on(table.companyId, table.buyerUserId, table.status, table.updatedAt),
  index('procurement_requisitions_manager_status_idx').on(table.companyId, table.purchaseManagerUserId, table.status, table.updatedAt),
  index('procurement_requisitions_project_idx').on(table.companyId, table.projectId, table.createdAt),
  check('procurement_requisitions_assignees_distinct', sql`${table.buyerUserId} <> ${table.purchaseManagerUserId}`),
  check('procurement_requisitions_title_required', sql`length(trim(${table.title})) > 0`),
  check('procurement_requisitions_location_required', sql`length(trim(${table.deliveryLocation})) > 0`),
  check('procurement_requisitions_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const procurementRequisitionLines = pgTable('procurement_requisition_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  requisitionId: uuid('requisition_id').notNull().references(() => procurementRequisitions.id, { onDelete: 'restrict' }),
  boqLineId: uuid('boq_line_id').references(() => boqLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  quotationLineId: uuid('quotation_line_id').references(() => quotationLines.id, { onDelete: 'set null' }),
  srrId: uuid('srr_id').references(() => storeReplenishmentRequests.id, { onDelete: 'set null' }),
  itemCodeSnapshot: varchar('item_code_snapshot', { length: 50 }).notNull(),
  itemNameSnapshot: varchar('item_name_snapshot', { length: 160 }).notNull(),
  specificationSnapshot: varchar('specification_snapshot', { length: 2_000 }).notNull(),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
  unitSymbolSnapshot: varchar('unit_symbol_snapshot', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  projectAllocationQty: numeric('project_allocation_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  storeReplenishmentQty: numeric('store_replenishment_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  destinationType: poLineDestinationTypeEnum('destination_type').notNull().default('warehouse'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_requisition_lines_number_uidx').on(table.requisitionId, table.lineNumber),
  uniqueIndex('procurement_requisition_lines_boq_uidx')
    .on(table.requisitionId, table.boqLineId)
    .where(sql`${table.boqLineId} is not null`),
  index('procurement_requisition_lines_company_idx').on(table.companyId, table.requisitionId),
  check('procurement_requisition_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('procurement_requisition_lines_quantity_positive', sql`${table.quantity} > 0`),
  check(
    'procurement_requisition_lines_split_valid',
    sql`${table.projectAllocationQty} >= 0 and ${table.storeReplenishmentQty} >= 0 and ${table.projectAllocationQty} + ${table.storeReplenishmentQty} = ${table.quantity}`,
  ),
]);

export const procurementRfqs = pgTable('procurement_rfqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  requisitionId: uuid('requisition_id').notNull().references(() => procurementRequisitions.id, { onDelete: 'restrict' }),
  rfqNumber: varchar('rfq_number', { length: 40 }).notNull(),
  status: procurementRfqStatusEnum('status').notNull().default('open'),
  responseDueDate: date('response_due_date').notNull(),
  commercialTerms: varchar('commercial_terms', { length: 2_000 }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_rfqs_company_number_uidx').on(table.companyId, table.rfqNumber),
  uniqueIndex('procurement_rfqs_requisition_uidx').on(table.requisitionId),
  index('procurement_rfqs_company_status_idx').on(table.companyId, table.status, table.updatedAt),
  check('procurement_rfqs_terms_required', sql`length(trim(${table.commercialTerms})) > 0`),
  check('procurement_rfqs_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const procurementRfqVendors = pgTable('procurement_rfq_vendors', {
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  rfqId: uuid('rfq_id').notNull().references(() => procurementRfqs.id, { onDelete: 'restrict' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'procurement_rfq_vendors_pk', columns: [table.rfqId, table.vendorId] }),
  index('procurement_rfq_vendors_company_vendor_idx').on(table.companyId, table.vendorId),
]);

export const procurementRfqLines = pgTable('procurement_rfq_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  rfqId: uuid('rfq_id').notNull().references(() => procurementRfqs.id, { onDelete: 'restrict' }),
  requisitionLineId: uuid('requisition_line_id').notNull().references(() => procurementRequisitionLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  itemCodeSnapshot: varchar('item_code_snapshot', { length: 50 }).notNull(),
  itemNameSnapshot: varchar('item_name_snapshot', { length: 160 }).notNull(),
  specificationSnapshot: varchar('specification_snapshot', { length: 2_000 }).notNull(),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
  unitSymbolSnapshot: varchar('unit_symbol_snapshot', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_rfq_lines_number_uidx').on(table.rfqId, table.lineNumber),
  uniqueIndex('procurement_rfq_lines_requisition_line_uidx').on(table.rfqId, table.requisitionLineId),
  index('procurement_rfq_lines_company_idx').on(table.companyId, table.rfqId),
  check('procurement_rfq_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('procurement_rfq_lines_quantity_positive', sql`${table.quantity} > 0`),
]);

export const vendorOffers = pgTable('vendor_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  rfqId: uuid('rfq_id').notNull().references(() => procurementRfqs.id, { onDelete: 'restrict' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  vendorReference: varchar('vendor_reference', { length: 160 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  taxBasis: varchar('tax_basis', { length: 500 }).notNull(),
  freightAmount: numeric('freight_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  leadTimeDays: integer('lead_time_days'),
  paymentTerms: varchar('payment_terms', { length: 1_000 }).notNull(),
  warranty: varchar('warranty', { length: 500 }).notNull(),
  validUntil: date('valid_until'),
  subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
  total: numeric('total', { precision: 18, scale: 2 }).notNull(),
  status: vendorOfferStatusEnum('status').notNull().default('submitted'),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  sourcePriceInquiryResponseId: uuid('source_price_inquiry_response_id').references(() => vendorPriceInquiryResponses.id, { onDelete: 'set null' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('vendor_offers_rfq_vendor_uidx').on(table.rfqId, table.vendorId),
  uniqueIndex('vendor_offers_source_inquiry_response_uidx')
    .on(table.sourcePriceInquiryResponseId)
    .where(sql`${table.sourcePriceInquiryResponseId} is not null`),
  index('vendor_offers_company_rfq_idx').on(table.companyId, table.rfqId, table.total),
  check('vendor_offers_reference_required', sql`length(trim(${table.vendorReference})) > 0`),
  check('vendor_offers_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check('vendor_offers_freight_nonnegative', sql`${table.freightAmount} >= 0`),
  check('vendor_offers_lead_time_valid', sql`${table.leadTimeDays} is null or ${table.leadTimeDays} >= 0`),
  check('vendor_offers_totals_valid', sql`${table.subtotal} >= 0 and ${table.total} = ${table.subtotal} + ${table.freightAmount}`),
]);

export const vendorOfferLines = pgTable('vendor_offer_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  vendorOfferId: uuid('vendor_offer_id').notNull().references(() => vendorOffers.id, { onDelete: 'restrict' }),
  rfqLineId: uuid('rfq_line_id').notNull().references(() => procurementRfqLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  unitRate: numeric('unit_rate', { precision: 18, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
  brandOffered: varchar('brand_offered', { length: 160 }).notNull(),
  specificationOffered: varchar('specification_offered', { length: 2_000 }).notNull(),
  equivalence: offerEquivalenceEnum('equivalence').notNull(),
  deviationNotes: varchar('deviation_notes', { length: 1_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('vendor_offer_lines_rfq_line_uidx').on(table.vendorOfferId, table.rfqLineId),
  uniqueIndex('vendor_offer_lines_number_uidx').on(table.vendorOfferId, table.lineNumber),
  index('vendor_offer_lines_company_offer_idx').on(table.companyId, table.vendorOfferId),
  check('vendor_offer_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('vendor_offer_lines_rate_nonnegative', sql`${table.unitRate} >= 0`),
  check('vendor_offer_lines_total_nonnegative', sql`${table.lineTotal} >= 0`),
  check('vendor_offer_lines_brand_required', sql`length(trim(${table.brandOffered})) > 0`),
  check('vendor_offer_lines_spec_required', sql`length(trim(${table.specificationOffered})) > 0`),
  check('vendor_offer_lines_deviation_reason', sql`${table.equivalence} <> 'deviation' or (${table.deviationNotes} is not null and length(trim(${table.deviationNotes})) > 0)`),
]);

export const procurementSubstitutionReviews = pgTable('procurement_substitution_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  vendorOfferLineId: uuid('vendor_offer_line_id').notNull().references(() => vendorOfferLines.id, { onDelete: 'restrict' }),
  decision: substitutionDecisionEnum('decision').notNull(),
  reason: varchar('reason', { length: 2_000 }).notNull(),
  reviewedByUserId: uuid('reviewed_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_substitution_reviews_line_uidx').on(table.vendorOfferLineId),
  index('procurement_substitution_reviews_company_idx').on(table.companyId, table.reviewedAt),
  check('procurement_substitution_reviews_reason_required', sql`length(trim(${table.reason})) > 0`),
]);

export const purchaseComparisons = pgTable('purchase_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  rfqId: uuid('rfq_id').notNull().references(() => procurementRfqs.id, { onDelete: 'restrict' }),
  status: purchaseComparisonStatusEnum('status').notNull().default('open'),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('purchase_comparisons_rfq_uidx').on(table.rfqId),
  index('purchase_comparisons_company_status_idx').on(table.companyId, table.status, table.updatedAt),
  check('purchase_comparisons_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const procurementSelectionDecisions = pgTable('procurement_selection_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  comparisonId: uuid('comparison_id').notNull().references(() => purchaseComparisons.id, { onDelete: 'restrict' }),
  selectedOfferId: uuid('selected_offer_id').notNull().references(() => vendorOffers.id, { onDelete: 'restrict' }),
  selectionReason: varchar('selection_reason', { length: 2_000 }).notNull(),
  singleSourceExceptionReason: varchar('single_source_exception_reason', { length: 2_000 }),
  selectedByUserId: uuid('selected_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  selectedAt: timestamp('selected_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_selection_decisions_comparison_uidx').on(table.comparisonId),
  index('procurement_selection_decisions_company_idx').on(table.companyId, table.selectedAt),
  check('procurement_selection_reason_required', sql`length(trim(${table.selectionReason})) > 0`),
]);

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'restrict' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  requisitionId: uuid('requisition_id').references(() => procurementRequisitions.id, { onDelete: 'set null' }),
  poNumber: varchar('po_number', { length: 40 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  status: purchaseOrderStatusEnum('status').notNull().default('draft'),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  paymentTerms: varchar('payment_terms', { length: 1_000 }).notNull(),
  deliveryTerms: varchar('delivery_terms', { length: 1_000 }).notNull(),
  deliveryLocation: varchar('delivery_location', { length: 500 }).notNull(),
  deliveryDueDate: date('delivery_due_date'),
  billingAddress: varchar('billing_address', { length: 500 }),
  shippingAddress: varchar('shipping_address', { length: 500 }),
  notes: varchar('notes', { length: 2_000 }),
  currentRevisionNumber: integer('current_revision_number').notNull().default(0),
  subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0.00'),
  taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
  grandTotal: numeric('grand_total', { precision: 18, scale: 2 }).notNull().default('0.00'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  shortClosedAt: timestamp('short_closed_at', { withTimezone: true }),
  shortClosedByUserId: uuid('short_closed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  shortCloseReason: varchar('short_close_reason', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('purchase_orders_company_number_uidx').on(table.companyId, table.poNumber),
  index('purchase_orders_company_project_idx').on(table.companyId, table.projectId, table.status),
  index('purchase_orders_company_vendor_idx').on(table.companyId, table.vendorId, table.status),
  index('purchase_orders_company_status_idx').on(table.companyId, table.status, table.updatedAt),
  check('purchase_orders_title_required', sql`length(trim(${table.title})) > 0`),
  check('purchase_orders_location_required', sql`length(trim(${table.deliveryLocation})) > 0`),
  check('purchase_orders_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check('purchase_orders_totals_valid', sql`${table.subtotal} >= 0 and ${table.taxAmount} >= 0 and ${table.grandTotal} = ${table.subtotal} + ${table.taxAmount}`),
  check('purchase_orders_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const purchaseOrderRevisions = pgTable('purchase_order_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  status: purchaseOrderRevisionStatusEnum('status').notNull().default('draft'),
  subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0.00'),
  taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
  grandTotal: numeric('grand_total', { precision: 18, scale: 2 }).notNull().default('0.00'),
  changeReason: varchar('change_reason', { length: 2_000 }),
  preparedByUserId: uuid('prepared_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvalNotes: varchar('approval_notes', { length: 2_000 }),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  issuedPdfStorageId: varchar('issued_pdf_storage_id', { length: 255 }),
  issuedPdfChecksum: varchar('issued_pdf_checksum', { length: 64 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('purchase_order_revisions_po_rev_uidx').on(table.purchaseOrderId, table.revisionNumber),
  index('purchase_order_revisions_company_status_idx').on(table.companyId, table.status, table.updatedAt),
  check('purchase_order_revisions_number_nonnegative', sql`${table.revisionNumber} >= 0`),
  check('purchase_order_revisions_amendment_reason', sql`${table.revisionNumber} = 0 or (${table.changeReason} is not null and length(trim(${table.changeReason})) > 0)`),
  check('purchase_order_revisions_totals_valid', sql`${table.subtotal} >= 0 and ${table.taxAmount} >= 0 and ${table.grandTotal} = ${table.subtotal} + ${table.taxAmount}`),
  check('purchase_order_revisions_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  revisionId: uuid('revision_id').notNull().references(() => purchaseOrderRevisions.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  quotationLineId: uuid('quotation_line_id').references(() => quotationLines.id, { onDelete: 'set null' }),
  srrId: uuid('srr_id').references(() => storeReplenishmentRequests.id, { onDelete: 'set null' }),
  itemCodeSnapshot: varchar('item_code_snapshot', { length: 50 }).notNull(),
  itemNameSnapshot: varchar('item_name_snapshot', { length: 160 }).notNull(),
  specificationSnapshot: varchar('specification_snapshot', { length: 2_000 }).notNull(),
  brandOffered: varchar('brand_offered', { length: 160 }).notNull(),
  modelSnapshot: varchar('model_snapshot', { length: 160 }),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'restrict' }),
  unitSymbolSnapshot: varchar('unit_symbol_snapshot', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  projectAllocationQty: numeric('project_allocation_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  storeReplenishmentQty: numeric('store_replenishment_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  allocatedReceivedQty: numeric('allocated_received_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  storeReceivedQty: numeric('store_received_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  destinationType: poLineDestinationTypeEnum('destination_type').notNull().default('warehouse'),
  unitRate: numeric('unit_rate', { precision: 18, scale: 2 }).notNull(),
  taxPercent: numeric('tax_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
  taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
  lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
  receivedQuantity: numeric('received_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  acceptedQuantity: numeric('accepted_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  rejectedQuantity: numeric('rejected_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  shortClosedQuantity: numeric('short_closed_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  requisitionLineId: uuid('requisition_line_id').references(() => procurementRequisitionLines.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('purchase_order_lines_rev_line_uidx').on(table.revisionId, table.lineNumber),
  index('purchase_order_lines_po_idx').on(table.companyId, table.purchaseOrderId),
  check('purchase_order_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('purchase_order_lines_quantity_positive', sql`${table.quantity} > 0`),
  check('purchase_order_lines_rate_nonnegative', sql`${table.unitRate} >= 0`),
  check('purchase_order_lines_tax_percent_range', sql`${table.taxPercent} >= 0 and ${table.taxPercent} <= 100`),
  check('purchase_order_lines_received_quantities_valid', sql`${table.receivedQuantity} >= 0 and ${table.acceptedQuantity} >= 0 and ${table.rejectedQuantity} >= 0 and ${table.receivedQuantity} >= ${table.acceptedQuantity} + ${table.rejectedQuantity}`),
  check(
    'purchase_order_lines_split_valid',
    sql`${table.projectAllocationQty} >= 0 and ${table.storeReplenishmentQty} >= 0 and ${table.projectAllocationQty} + ${table.storeReplenishmentQty} = ${table.quantity}`,
  ),
  check(
    'purchase_order_lines_split_received_valid',
    sql`${table.allocatedReceivedQty} >= 0 and ${table.storeReceivedQty} >= 0 and ${table.allocatedReceivedQty} <= ${table.projectAllocationQty} and ${table.storeReceivedQty} <= ${table.storeReplenishmentQty}`,
  ),
]);

export const goodsReceipts = pgTable('goods_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  grnNumber: varchar('grn_number', { length: 40 }).notNull(),
  vendorChallanNumber: varchar('vendor_challan_number', { length: 100 }).notNull(),
  vendorChallanDate: date('vendor_challan_date').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  receivedByUserId: uuid('received_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: goodsReceiptStatusEnum('status').notNull().default('draft'),
  deliveryLocation: varchar('delivery_location', { length: 500 }).notNull(),
  vehicleNumber: varchar('vehicle_number', { length: 50 }),
  transporterName: varchar('transporter_name', { length: 160 }),
  notes: varchar('notes', { length: 2_000 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('goods_receipts_company_grn_number_uidx').on(table.companyId, table.grnNumber),
  index('goods_receipts_company_po_idx').on(table.companyId, table.purchaseOrderId, table.status),
  check('goods_receipts_challan_required', sql`length(trim(${table.vendorChallanNumber})) > 0`),
  check('goods_receipts_location_required', sql`length(trim(${table.deliveryLocation})) > 0`),
  check('goods_receipts_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const goodsReceiptLines = pgTable('goods_receipt_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  goodsReceiptId: uuid('goods_receipt_id').notNull().references(() => goodsReceipts.id, { onDelete: 'restrict' }),
  purchaseOrderLineId: uuid('purchase_order_line_id').notNull().references(() => purchaseOrderLines.id, { onDelete: 'restrict' }),
  lineNumber: integer('line_number').notNull(),
  deliveredQuantity: numeric('delivered_quantity', { precision: 18, scale: 4 }).notNull(),
  acceptedQuantity: numeric('accepted_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  rejectedQuantity: numeric('rejected_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  rejectionReason: varchar('rejection_reason', { length: 2_000 }),
  inspectionNotes: varchar('inspection_notes', { length: 2_000 }),
  inspectedByUserId: uuid('inspected_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }),
  excessQuantity: numeric('excess_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  excessApprovalReason: varchar('excess_approval_reason', { length: 2_000 }),
  excessApprovedByUserId: uuid('excess_approved_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('goods_receipt_lines_grn_line_uidx').on(table.goodsReceiptId, table.lineNumber),
  index('goods_receipt_lines_po_line_idx').on(table.companyId, table.purchaseOrderLineId),
  check('goods_receipt_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('goods_receipt_lines_delivered_positive', sql`${table.deliveredQuantity} > 0`),
  check('goods_receipt_lines_quantities_valid', sql`${table.acceptedQuantity} >= 0 and ${table.rejectedQuantity} >= 0 and ${table.deliveredQuantity} >= ${table.acceptedQuantity} + ${table.rejectedQuantity}`),
  check('goods_receipt_lines_excess_valid', sql`${table.excessQuantity} >= 0`),
  check('goods_receipt_lines_excess_reason', sql`${table.excessQuantity} = 0 or (${table.excessApprovalReason} is not null and length(trim(${table.excessApprovalReason})) > 0 and ${table.excessApprovedByUserId} is not null)`),
  check('goods_receipt_lines_rejection_reason', sql`${table.rejectedQuantity} = 0 or (${table.rejectionReason} is not null and length(trim(${table.rejectionReason})) > 0)`),
]);

export const procurementSelectionLineAwards = pgTable('procurement_selection_line_awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  selectionDecisionId: uuid('selection_decision_id').notNull().references(() => procurementSelectionDecisions.id, { onDelete: 'restrict' }),
  rfqLineId: uuid('rfq_line_id').notNull().references(() => procurementRfqLines.id, { onDelete: 'restrict' }),
  winningVendorId: uuid('winning_vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  winningOfferId: uuid('winning_offer_id').notNull().references(() => vendorOffers.id, { onDelete: 'restrict' }),
  winningOfferLineId: uuid('winning_offer_line_id').notNull().references(() => vendorOfferLines.id, { onDelete: 'restrict' }),
  awardedQuantity: numeric('awarded_quantity', { precision: 18, scale: 4 }).notNull(),
  selectionReason: varchar('selection_reason', { length: 2_000 }).notNull(),
  generatedPoId: uuid('generated_po_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('procurement_selection_line_awards_line_uidx').on(table.selectionDecisionId, table.rfqLineId),
  uniqueIndex('procurement_selection_line_awards_offer_line_uidx').on(table.winningOfferLineId),
  index('procurement_selection_line_awards_company_idx').on(table.companyId, table.selectionDecisionId),
  index('procurement_selection_line_awards_vendor_idx').on(table.companyId, table.winningVendorId),
  check('procurement_selection_line_awards_quantity_positive', sql`${table.awardedQuantity} > 0`),
  check('procurement_selection_line_awards_reason_required', sql`length(trim(${table.selectionReason})) > 0`),
]);

export const purchaseOrderDispatches = pgTable('purchase_order_dispatches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  revisionId: uuid('revision_id').notNull().references(() => purchaseOrderRevisions.id, { onDelete: 'restrict' }),
  channel: purchaseOrderDispatchChannelEnum('channel').notNull(),
  recipientName: varchar('recipient_name', { length: 160 }).notNull(),
  recipientContact: varchar('recipient_contact', { length: 320 }).notNull(),
  status: purchaseOrderDispatchStatusEnum('status').notNull().default('queued'),
  providerMessageId: varchar('provider_message_id', { length: 200 }),
  sentByUserId: uuid('sent_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  errorMessage: varchar('error_message', { length: 1_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('purchase_order_dispatches_po_idx').on(table.companyId, table.purchaseOrderId, table.createdAt),
  check('purchase_order_dispatches_recipient_required', sql`length(trim(${table.recipientName})) > 0 and length(trim(${table.recipientContact})) > 0`),
]);

export const supplierReturns = pgTable('supplier_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  rtvNumber: varchar('rtv_number', { length: 40 }).notNull(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  goodsReceiptId: uuid('goods_receipt_id').notNull().references(() => goodsReceipts.id, { onDelete: 'restrict' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'restrict' }),
  status: supplierReturnStatusEnum('status').notNull().default('draft'),
  resolutionType: supplierReturnResolutionTypeEnum('resolution_type').notNull(),
  transporterName: varchar('transporter_name', { length: 160 }),
  vehicleNumber: varchar('vehicle_number', { length: 50 }),
  dispatchDate: date('dispatch_date'),
  reason: varchar('reason', { length: 2_000 }).notNull(),
  creditNoteReference: varchar('credit_note_reference', { length: 160 }),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  pdfStorageName: varchar('pdf_storage_name', { length: 255 }),
  pdfChecksumSha256: varchar('pdf_checksum_sha256', { length: 64 }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('supplier_returns_company_number_uidx').on(table.companyId, table.rtvNumber),
  index('supplier_returns_company_po_idx').on(table.companyId, table.purchaseOrderId, table.status),
  index('supplier_returns_company_grn_idx').on(table.companyId, table.goodsReceiptId),
  check('supplier_returns_reason_required', sql`length(trim(${table.reason})) > 0`),
  check('supplier_returns_row_version_positive', sql`${table.rowVersion} > 0`),
]);

export const supplierReturnLines = pgTable('supplier_return_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  supplierReturnId: uuid('supplier_return_id').notNull().references(() => supplierReturns.id, { onDelete: 'restrict' }),
  goodsReceiptLineId: uuid('goods_receipt_line_id').notNull().references(() => goodsReceiptLines.id, { onDelete: 'restrict' }),
  purchaseOrderLineId: uuid('purchase_order_line_id').notNull().references(() => purchaseOrderLines.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  brandOfferingId: uuid('brand_offering_id').references(() => itemBrandOfferings.id, { onDelete: 'restrict' }),
  returnQuantity: numeric('return_quantity', { precision: 18, scale: 4 }).notNull(),
  replacementReceivedQuantity: numeric('replacement_received_quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  remarks: varchar('remarks', { length: 2_000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('supplier_return_lines_grn_line_uidx').on(table.supplierReturnId, table.goodsReceiptLineId),
  index('supplier_return_lines_company_return_idx').on(table.companyId, table.supplierReturnId),
  check('supplier_return_lines_quantity_positive', sql`${table.returnQuantity} > 0`),
  check('supplier_return_lines_replacement_valid', sql`${table.replacementReceivedQuantity} >= 0 and ${table.replacementReceivedQuantity} <= ${table.returnQuantity}`),
]);
