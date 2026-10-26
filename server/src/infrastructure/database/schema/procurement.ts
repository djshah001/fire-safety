import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { boqLines, boqRevisions } from './engineering.js';
import { items, units, vendors } from './masters.js';
import { users } from './identity.js';
import { companies } from './organizations.js';
import { projects } from './projects.js';

export const procurementRequisitionStatusEnum = pgEnum('procurement_requisition_status', ['open', 'sourcing', 'selected']);
export const procurementRfqStatusEnum = pgEnum('procurement_rfq_status', ['open', 'selected', 'cancelled']);
export const vendorOfferStatusEnum = pgEnum('vendor_offer_status', ['submitted']);
export const purchaseComparisonStatusEnum = pgEnum('purchase_comparison_status', ['open', 'selected']);
export const offerEquivalenceEnum = pgEnum('offer_equivalence', ['equivalent', 'deviation', 'unknown']);
export const substitutionDecisionEnum = pgEnum('substitution_decision', ['approved', 'rejected']);

export const procurementRequisitions = pgTable('procurement_requisitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  boqRevisionId: uuid('boq_revision_id').notNull().references(() => boqRevisions.id, { onDelete: 'restrict' }),
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
  boqLineId: uuid('boq_line_id').notNull().references(() => boqLines.id, { onDelete: 'restrict' }),
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
  uniqueIndex('procurement_requisition_lines_number_uidx').on(table.requisitionId, table.lineNumber),
  uniqueIndex('procurement_requisition_lines_boq_uidx').on(table.requisitionId, table.boqLineId),
  index('procurement_requisition_lines_company_idx').on(table.companyId, table.requisitionId),
  check('procurement_requisition_lines_number_positive', sql`${table.lineNumber} > 0`),
  check('procurement_requisition_lines_quantity_positive', sql`${table.quantity} > 0`),
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
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('vendor_offers_rfq_vendor_uidx').on(table.rfqId, table.vendorId),
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
