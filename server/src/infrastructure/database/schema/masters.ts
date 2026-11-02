import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
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
    legalName: varchar("legal_name", { length: 200 }),
    taxIdentifier: varchar("tax_identifier", { length: 40 }),
    addressLine1: varchar("address_line_1", { length: 200 }),
    addressLine2: varchar("address_line_2", { length: 200 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: varchar("country", { length: 100 }),
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
    index("vendors_company_name_idx").on(
      table.companyId,
      table.displayNameNormalized,
    ),
    index("vendors_company_status_idx").on(table.companyId, table.status),
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

export type Unit = typeof units.$inferSelect;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type ItemFamily = typeof itemFamilies.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemBrandOffering = typeof itemBrandOfferings.$inferSelect;
export type ItemRateVersion = typeof itemRateVersions.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type VendorContact = typeof vendorContacts.$inferSelect;
