import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { masterStatusEnum } from "./crm.js";
import { users } from "./identity.js";
import { companies } from "./organizations.js";

export const masterImportTypeEnum = pgEnum('master_import_type', ['items', 'vendors']);
export const masterImportBatchStatusEnum = pgEnum('master_import_batch_status', ['staged', 'committing', 'completed', 'cancelled']);
export const masterImportRowStatusEnum = pgEnum('master_import_row_status', ['valid', 'invalid', 'created', 'failed']);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 80 }).notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    allowFractional: boolean("allow_fractional").notNull().default(true),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("units_company_code_uidx").on(table.companyId, table.code),
    uniqueIndex("units_company_name_uidx").on(
      table.companyId,
      table.nameNormalized,
    ),
    index("units_company_status_idx").on(table.companyId, table.status),
    check("units_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const itemCategories = pgTable(
  "item_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 120 }).notNull(),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_categories_company_code_uidx").on(
      table.companyId,
      table.code,
    ),
    uniqueIndex("item_categories_company_name_uidx").on(
      table.companyId,
      table.nameNormalized,
    ),
    index("item_categories_company_status_idx").on(
      table.companyId,
      table.status,
    ),
    check("item_categories_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 120 }).notNull(),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("brands_company_code_uidx").on(table.companyId, table.code),
    uniqueIndex("brands_company_name_uidx").on(
      table.companyId,
      table.nameNormalized,
    ),
    index("brands_company_status_idx").on(table.companyId, table.status),
    check("brands_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const itemFamilies = pgTable(
  "item_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => itemCategories.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 160 }).notNull(),
    scopeDescription: varchar("scope_description", { length: 4_000 }).notNull(),
    defaultUnitId: uuid("default_unit_id").references(() => units.id, {
      onDelete: "restrict",
    }),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_families_company_code_uidx").on(
      table.companyId,
      table.code,
    ),
    uniqueIndex("item_families_company_name_uidx").on(
      table.companyId,
      table.nameNormalized,
    ),
    index("item_families_company_category_idx").on(
      table.companyId,
      table.categoryId,
    ),
    index("item_families_company_status_idx").on(table.companyId, table.status),
    check("item_families_row_version_positive", sql`${table.rowVersion} > 0`),
    check(
      "item_families_scope_required",
      sql`length(trim(${table.scopeDescription})) > 0`,
    ),
  ],
);

export const itemFamilySpecifications = pgTable(
  "item_family_specifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => itemFamilies.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 60 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    valueType: varchar("value_type", { length: 20 }).notNull().default("text"),
    unitLabel: varchar("unit_label", { length: 30 }),
    isRequired: boolean("is_required").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_family_specs_family_key_uidx").on(
      table.familyId,
      table.key,
    ),
    uniqueIndex("item_family_specs_family_order_uidx").on(
      table.familyId,
      table.sortOrder,
    ),
    index("item_family_specs_company_idx").on(table.companyId, table.familyId),
    check(
      "item_family_specs_type_valid",
      sql`${table.valueType} in ('text', 'number', 'boolean')`,
    ),
    check("item_family_specs_order_positive", sql`${table.sortOrder} > 0`),
  ],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 160 }).notNull(),
    specification: varchar("specification", { length: 2_000 }),
    familyId: uuid("family_id").references(() => itemFamilies.id, {
      onDelete: "restrict",
    }),
    costingBrandId: uuid("costing_brand_id").references(() => brands.id, {
      onDelete: "restrict",
    }),
    model: varchar("model", { length: 120 }),
    specificationValues: jsonb("specification_values")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => itemCategories.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("items_company_code_uidx").on(table.companyId, table.code),
    index("items_company_name_idx").on(table.companyId, table.nameNormalized),
    index("items_company_category_idx").on(table.companyId, table.categoryId),
    index("items_company_family_idx").on(table.companyId, table.familyId),
    index("items_company_costing_brand_idx").on(
      table.companyId,
      table.costingBrandId,
    ),
    index("items_company_unit_idx").on(table.companyId, table.unitId),
    index("items_company_status_idx").on(table.companyId, table.status),
    check("items_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const itemBrandOfferings = pgTable(
  "item_brand_offerings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id").references(() => brands.id, {
      onDelete: "restrict",
    }),
    manufacturerModel: varchar("manufacturer_model", { length: 120 }).notNull(),
    manufacturerSku: varchar("manufacturer_sku", { length: 100 }),
    isPreferred: boolean("is_preferred").notNull().default(false),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_brand_offerings_identity_uidx").on(
      table.itemId,
      table.brandId,
      table.manufacturerModel,
    ),
    index("item_brand_offerings_company_item_idx").on(
      table.companyId,
      table.itemId,
      table.status,
    ),
    index("item_brand_offerings_company_brand_idx").on(
      table.companyId,
      table.brandId,
    ),
    uniqueIndex("item_brand_offerings_preferred_uidx")
      .on(table.itemId)
      .where(sql`${table.isPreferred} = true and ${table.status} = 'active'`),
    check(
      "item_brand_offerings_model_required",
      sql`length(trim(${table.manufacturerModel})) > 0`,
    ),
    check(
      "item_brand_offerings_row_version_positive",
      sql`${table.rowVersion} > 0`,
    ),
  ],
);

export const itemRateVersions = pgTable(
  "item_rate_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => itemBrandOfferings.id, { onDelete: "restrict" }),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    effectiveFrom: date("effective_from").notNull(),
    supplyRate: numeric("supply_rate", { precision: 18, scale: 4 }).notNull(),
    labourRate: numeric("labour_rate", { precision: 18, scale: 4 }).notNull(),
    miscellaneousRate: numeric("miscellaneous_rate", {
      precision: 18,
      scale: 4,
    }).notNull(),
    miscellaneousNote: varchar("miscellaneous_note", { length: 1_000 }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_rate_versions_offering_currency_date_uidx").on(
      table.offeringId,
      table.currency,
      table.effectiveFrom,
    ),
    index("item_rate_versions_company_item_idx").on(
      table.companyId,
      table.itemId,
    ),
    index("item_rate_versions_company_effective_idx").on(
      table.companyId,
      table.effectiveFrom,
    ),
    check(
      "item_rate_versions_currency_valid",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "item_rate_versions_rates_nonnegative",
      sql`${table.supplyRate} >= 0 and ${table.labourRate} >= 0 and ${table.miscellaneousRate} >= 0`,
    ),
  ],
);

export const itemBrands = pgTable(
  "item_brands",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "item_brands_pk",
      columns: [table.itemId, table.brandId],
    }),
    index("item_brands_company_brand_idx").on(table.companyId, table.brandId),
  ],
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 50 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    displayNameNormalized: varchar("display_name_normalized", {
      length: 160,
    }).notNull(),
    tradeName: varchar("trade_name", { length: 200 }),
    vendorType: varchar("vendor_type", { length: 50 }).notNull().default("material_supplier"),
    supplierCategories: jsonb("supplier_categories").notNull().default([]),
    website: varchar("website", { length: 255 }),
    companyDescription: varchar("company_description", { length: 2000 }),
    legalName: varchar("legal_name", { length: 200 }),
    gstStatus: varchar("gst_status", { length: 20 }).notNull().default("unregistered"),
    gstin: varchar("gstin", { length: 15 }),
    pan: varchar("pan", { length: 10 }),
    taxIdentifier: varchar("tax_identifier", { length: 40 }),
    addressLine1: varchar("address_line_1", { length: 200 }),
    addressLine2: varchar("address_line_2", { length: 200 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: varchar("country", { length: 100 }).default("India"),
    brandsSupplied: jsonb("brands_supplied").notNull().default([]),
    deliveryLocations: varchar("delivery_locations", { length: 1000 }),
    typicalLeadTimeDays: integer("typical_lead_time_days"),
    minimumOrderValue: numeric("minimum_order_value", { precision: 18, scale: 2 }),
    paymentTerms: varchar("payment_terms", { length: 500 }),
    creditPeriodDays: integer("credit_period_days"),
    creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }),
    preferredCurrency: varchar("preferred_currency", { length: 3 }).notNull().default("INR"),
    assignedBuyerUserId: uuid("assigned_buyer_user_id").references(() => users.id, { onDelete: "set null" }),
    internalNotes: varchar("internal_notes", { length: 2000 }),
    approvalStatus: varchar("approval_status", { length: 30 }).notNull().default("active"),
    isArchived: boolean("is_archived").notNull().default(false),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vendors_company_code_uidx").on(table.companyId, table.code),
    uniqueIndex("vendors_company_gstin_uidx")
      .on(table.companyId, table.gstin)
      .where(sql`${table.gstin} is not null and ${table.gstin} <> ''`),
    index("vendors_company_name_idx").on(
      table.companyId,
      table.displayNameNormalized,
    ),
    index("vendors_company_status_idx").on(table.companyId, table.status),
    index("vendors_company_approval_idx").on(table.companyId, table.approvalStatus),
    index("vendors_company_archived_idx").on(table.companyId, table.isArchived),
    check("vendors_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const vendorContacts = pgTable(
  "vendor_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    jobTitle: varchar("job_title", { length: 100 }),
    phone: varchar("phone", { length: 30 }),
    phoneNormalized: varchar("phone_normalized", { length: 20 }),
    alternatePhone: varchar("alternate_phone", { length: 30 }),
    email: varchar("email", { length: 254 }),
    emailNormalized: varchar("email_normalized", { length: 254 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: masterStatusEnum("status").notNull().default("active"),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_contacts_vendor_primary_uidx")
      .on(table.vendorId)
      .where(sql`${table.isPrimary} = true and ${table.status} = 'active'`),
    index("vendor_contacts_vendor_status_idx").on(table.vendorId, table.status),
    index("vendor_contacts_company_phone_idx").on(
      table.companyId,
      table.phoneNormalized,
    ),
    index("vendor_contacts_company_email_idx").on(
      table.companyId,
      table.emailNormalized,
    ),
    check(
      "vendor_contacts_method_required",
      sql`${table.phoneNormalized} is not null or ${table.emailNormalized} is not null`,
    ),
    check("vendor_contacts_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const vendorAddresses = pgTable(
  "vendor_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    addressType: varchar("address_type", { length: 50 }).notNull().default("office"),
    addressLine1: varchar("address_line_1", { length: 200 }).notNull(),
    addressLine2: varchar("address_line_2", { length: 200 }),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }).notNull(),
    postalCode: varchar("postal_code", { length: 20 }).notNull(),
    country: varchar("country", { length: 100 }).notNull().default("India"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendor_addresses_company_vendor_idx").on(table.companyId, table.vendorId),
    check("vendor_addresses_address_line1_required", sql`length(trim(${table.addressLine1})) > 0`),
  ],
);

export const vendorBankAccounts = pgTable(
  "vendor_bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    accountHolderName: varchar("account_holder_name", { length: 160 }).notNull(),
    accountNumber: varchar("account_number", { length: 50 }).notNull(),
    ifscCode: varchar("ifsc_code", { length: 11 }).notNull(),
    bankName: varchar("bank_name", { length: 160 }).notNull(),
    branch: varchar("branch", { length: 160 }),
    upiId: varchar("upi_id", { length: 100 }),
    isDefault: boolean("is_default").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendor_bank_accounts_company_vendor_idx").on(table.companyId, table.vendorId),
    check("vendor_bank_accounts_acc_num_required", sql`length(trim(${table.accountNumber})) > 0`),
    check("vendor_bank_accounts_ifsc_required", sql`length(trim(${table.ifscCode})) > 0`),
  ],
);

export const vendorDocuments = pgTable(
  "vendor_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 50 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    storageName: varchar("storage_name", { length: 255 }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendor_documents_company_vendor_idx").on(table.companyId, table.vendorId),
  ],
);

export const vendorPriceLists = pgTable(
  "vendor_price_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    vendorProductCode: varchar("vendor_product_code", { length: 100 }),
    vendorProductName: varchar("vendor_product_name", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    unitRate: numeric("unit_rate", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    leadTimeDays: integer("lead_time_days"),
    minimumOrderQuantity: numeric("minimum_order_quantity", { precision: 18, scale: 4 }).notNull().default("1"),
    effectiveFrom: date("effective_from").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendor_price_lists_company_vendor_idx").on(table.companyId, table.vendorId),
    check("vendor_price_lists_rate_positive", sql`${table.unitRate} >= 0`),
  ],
);

export const vendorOnboardingInvitations = pgTable(
  "vendor_onboarding_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    token: varchar("token", { length: 64 }).notNull(),
    whatsappNumber: varchar("whatsapp_number", { length: 30 }).notNull(),
    whatsappNumberNormalized: varchar("whatsapp_number_normalized", { length: 20 }).notNull(),
    contactName: varchar("contact_name", { length: 120 }).notNull(),
    companyName: varchar("company_name", { length: 160 }),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_onboarding_invitations_token_uidx").on(table.token),
    index("vendor_onboarding_invitations_company_phone_idx").on(table.companyId, table.whatsappNumberNormalized),
  ],
);

export const vendorPriceInquiries = pgTable(
  "vendor_price_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    inquiryCode: varchar("inquiry_code", { length: 20 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    items: jsonb("items").notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    responseDueDate: date("response_due_date"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vpi_company_code_uidx").on(table.companyId, table.inquiryCode),
    index("vpi_company_status_idx").on(table.companyId, table.status),
  ],
);

export const vendorPriceInquiryInvitations = pgTable(
  "vendor_price_inquiry_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => vendorPriceInquiries.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    token: varchar("token", { length: 64 }).notNull(),
    whatsappNumber: varchar("whatsapp_number", { length: 30 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    msg91MessageId: varchar("msg91_message_id", { length: 100 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vpii_token_uidx").on(table.token),
    index("vpii_inquiry_idx").on(table.inquiryId),
    index("vpii_vendor_idx").on(table.vendorId),
  ],
);

export const vendorPriceInquiryResponses = pgTable(
  "vendor_price_inquiry_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => vendorPriceInquiryInvitations.id, { onDelete: "cascade" }),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => vendorPriceInquiries.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    itemRef: jsonb("item_ref").notNull(),
    unitRate: numeric("unit_rate", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    leadTimeDays: integer("lead_time_days"),
    notes: varchar("notes", { length: 500 }),
    moq: numeric("moq", { precision: 18, scale: 4 }),
    validUntil: date("valid_until"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vpir_inquiry_vendor_idx").on(table.inquiryId, table.vendorId),
    index("vpir_invitation_idx").on(table.invitationId),
  ],
);

export type MasterImportPayload = Record<string, string | null>;
export type MasterImportIssue = { field?: string; message: string };

export const masterImportBatches = pgTable(
  "master_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    type: masterImportTypeEnum("type").notNull(),
    status: masterImportBatchStatusEnum("status").notNull().default("staged"),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storageName: varchar("storage_name", { length: 64 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    totalRows: integer("total_rows").notNull(),
    validRows: integer("valid_rows").notNull(),
    invalidRows: integer("invalid_rows").notNull(),
    rowVersion: integer("row_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("master_import_batches_storage_name_uidx").on(table.storageName),
    index("master_import_batches_company_created_idx").on(table.companyId, table.createdAt),
    check(
      "master_import_batches_counts_valid",
      sql`${table.totalRows} >= 0 and ${table.validRows} >= 0 and ${table.invalidRows} >= 0 and ${table.totalRows} = ${table.validRows} + ${table.invalidRows}`,
    ),
    check(
      "master_import_batches_file_size_valid",
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 5242880`,
    ),
    check("master_import_batches_row_version_positive", sql`${table.rowVersion} > 0`),
  ],
);

export const masterImportRows = pgTable(
  "master_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => masterImportBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    payload: jsonb("payload").$type<MasterImportPayload>().notNull(),
    issues: jsonb("issues").$type<MasterImportIssue[]>().notNull().default([]),
    warnings: jsonb("warnings").$type<MasterImportIssue[]>().notNull().default([]),
    status: masterImportRowStatusEnum("status").notNull(),
    createdRecordId: uuid("created_record_id"),
    resultMessage: varchar("result_message", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("master_import_rows_batch_row_uidx").on(table.batchId, table.rowNumber),
    index("master_import_rows_batch_status_idx").on(table.companyId, table.batchId, table.status),
    check("master_import_rows_row_number_valid", sql`${table.rowNumber} >= 2`),
    check(
      "master_import_rows_result_consistent",
      sql`(${table.status} = 'created' and ${table.createdRecordId} is not null) or ${table.status} <> 'created'`,
    ),
  ],
);

export type Unit = typeof units.$inferSelect;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type ItemFamily = typeof itemFamilies.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemBrandOffering = typeof itemBrandOfferings.$inferSelect;
export type ItemRateVersion = typeof itemRateVersions.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type VendorContact = typeof vendorContacts.$inferSelect;
export type VendorAddress = typeof vendorAddresses.$inferSelect;
export type VendorBankAccount = typeof vendorBankAccounts.$inferSelect;
export type VendorDocument = typeof vendorDocuments.$inferSelect;
export type VendorPriceList = typeof vendorPriceLists.$inferSelect;
export type VendorOnboardingInvitation = typeof vendorOnboardingInvitations.$inferSelect;
export type VendorPriceInquiry = typeof vendorPriceInquiries.$inferSelect;
export type VendorPriceInquiryInvitation = typeof vendorPriceInquiryInvitations.$inferSelect;
export type VendorPriceInquiryResponse = typeof vendorPriceInquiryResponses.$inferSelect;
export type MasterImportBatch = typeof masterImportBatches.$inferSelect;
export type MasterImportRow = typeof masterImportRows.$inferSelect;
