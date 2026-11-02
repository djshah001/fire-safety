CREATE TABLE "item_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(160) NOT NULL,
	"name_normalized" varchar(160) NOT NULL,
	"scope_description" varchar(4000) NOT NULL,
	"default_unit_id" uuid,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_families_row_version_positive" CHECK ("item_families"."row_version" > 0),
	CONSTRAINT "item_families_scope_required" CHECK (length(trim("item_families"."scope_description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "item_family_specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"label" varchar(100) NOT NULL,
	"value_type" varchar(20) DEFAULT 'text' NOT NULL,
	"unit_label" varchar(30),
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_family_specs_type_valid" CHECK ("item_family_specifications"."value_type" in ('text', 'number', 'boolean')),
	CONSTRAINT "item_family_specs_order_positive" CHECK ("item_family_specifications"."sort_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_rate_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"effective_from" date NOT NULL,
	"supply_rate" numeric(18, 4) NOT NULL,
	"labour_rate" numeric(18, 4) NOT NULL,
	"miscellaneous_rate" numeric(18, 4) NOT NULL,
	"miscellaneous_note" varchar(1000),
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_rate_versions_currency_valid" CHECK ("item_rate_versions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "item_rate_versions_rates_nonnegative" CHECK ("item_rate_versions"."supply_rate" >= 0 and "item_rate_versions"."labour_rate" >= 0 and "item_rate_versions"."miscellaneous_rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quotation_lines" DROP CONSTRAINT "quotation_lines_amounts_valid";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "costing_brand_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "model" varchar(120);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "specification_values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "allow_fractional" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "costing_date" date;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "calculation_version" varchar(40) DEFAULT 'legacy-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "rounding_version" varchar(40) DEFAULT 'half-up-line-2-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "rate_version_id" uuid;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "supply_rate" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "labour_rate" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "miscellaneous_rate" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "markup_percent" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "markup_amount" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "quoted_unit_rate" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "supply_rate" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "labour_rate" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "miscellaneous_rate" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "markup_percent" numeric(7, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "markup_amount" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "quoted_unit_rate" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD COLUMN "calculation_version" varchar(40) DEFAULT 'legacy-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD COLUMN "rounding_version" varchar(40) DEFAULT 'half-up-line-2-v1' NOT NULL;--> statement-breakpoint
UPDATE "quotation_lines"
SET "supply_rate" = "unit_rate", "quoted_unit_rate" = "unit_rate"
WHERE "supply_rate" = 0 AND "labour_rate" = 0 AND "miscellaneous_rate" = 0 AND "quoted_unit_rate" = 0;--> statement-breakpoint
ALTER TABLE "item_families" ADD CONSTRAINT "item_families_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_families" ADD CONSTRAINT "item_families_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_families" ADD CONSTRAINT "item_families_default_unit_id_units_id_fk" FOREIGN KEY ("default_unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_families" ADD CONSTRAINT "item_families_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_family_specifications" ADD CONSTRAINT "item_family_specifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_family_specifications" ADD CONSTRAINT "item_family_specifications_family_id_item_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."item_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_rate_versions" ADD CONSTRAINT "item_rate_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_rate_versions" ADD CONSTRAINT "item_rate_versions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_rate_versions" ADD CONSTRAINT "item_rate_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_families_company_code_uidx" ON "item_families" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "item_families_company_name_uidx" ON "item_families" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "item_families_company_category_idx" ON "item_families" USING btree ("company_id","category_id");--> statement-breakpoint
CREATE INDEX "item_families_company_status_idx" ON "item_families" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "item_family_specs_family_key_uidx" ON "item_family_specifications" USING btree ("family_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "item_family_specs_family_order_uidx" ON "item_family_specifications" USING btree ("family_id","sort_order");--> statement-breakpoint
CREATE INDEX "item_family_specs_company_idx" ON "item_family_specifications" USING btree ("company_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_rate_versions_item_currency_date_uidx" ON "item_rate_versions" USING btree ("item_id","currency","effective_from");--> statement-breakpoint
CREATE INDEX "item_rate_versions_company_effective_idx" ON "item_rate_versions" USING btree ("company_id","effective_from");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_family_id_item_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."item_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_costing_brand_id_brands_id_fk" FOREIGN KEY ("costing_brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_rate_version_id_item_rate_versions_id_fk" FOREIGN KEY ("rate_version_id") REFERENCES "public"."item_rate_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_company_family_idx" ON "items" USING btree ("company_id","family_id");--> statement-breakpoint
CREATE INDEX "items_company_costing_brand_idx" ON "items" USING btree ("company_id","costing_brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_lines_revision_boq_line_uidx" ON "estimate_cost_lines" USING btree ("boq_revision_id","boq_line_id") WHERE "estimate_cost_lines"."boq_line_id" is not null and "estimate_cost_lines"."rate_version_id" is not null;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_lines_catalogue_values_valid" CHECK ("estimate_cost_lines"."rate_version_id" is null or ("estimate_cost_lines"."supply_rate" >= 0 and "estimate_cost_lines"."labour_rate" >= 0 and "estimate_cost_lines"."miscellaneous_rate" >= 0 and "estimate_cost_lines"."markup_percent" between 0 and 1000 and "estimate_cost_lines"."markup_amount" >= 0 and "estimate_cost_lines"."quoted_unit_rate" >= 0));--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_amounts_valid" CHECK ("quotation_lines"."unit_rate" >= 0 and "quotation_lines"."supply_rate" >= 0 and "quotation_lines"."labour_rate" >= 0 and "quotation_lines"."miscellaneous_rate" >= 0 and "quotation_lines"."markup_percent" between 0 and 1000 and "quotation_lines"."markup_amount" >= 0 and "quotation_lines"."quoted_unit_rate" >= 0 and "quotation_lines"."discount_amount" >= 0 and "quotation_lines"."line_subtotal" >= 0 and "quotation_lines"."line_total" >= 0 and "quotation_lines"."discount_amount" <= "quotation_lines"."line_subtotal");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('procurement.item_rate.manage', 'Create effective-dated supply, labour and miscellaneous catalogue rate versions.')
ON CONFLICT ("code") DO UPDATE SET "description" = excluded."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", 'procurement.item_rate.manage'
FROM "roles"
WHERE "roles"."code" = 'purchase_manager'
ON CONFLICT DO NOTHING;
