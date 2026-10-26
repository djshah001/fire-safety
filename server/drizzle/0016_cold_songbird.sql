CREATE TYPE "public"."offer_equivalence" AS ENUM('equivalent', 'deviation', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."procurement_requisition_status" AS ENUM('open', 'sourcing', 'selected');--> statement-breakpoint
CREATE TYPE "public"."procurement_rfq_status" AS ENUM('open', 'selected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."purchase_comparison_status" AS ENUM('open', 'selected');--> statement-breakpoint
CREATE TYPE "public"."vendor_offer_status" AS ENUM('submitted');--> statement-breakpoint
CREATE TABLE "procurement_requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"boq_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"item_code_snapshot" varchar(50) NOT NULL,
	"item_name_snapshot" varchar(160) NOT NULL,
	"specification_snapshot" varchar(2000) NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_symbol_snapshot" varchar(20) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_requisition_lines_number_positive" CHECK ("procurement_requisition_lines"."line_number" > 0),
	CONSTRAINT "procurement_requisition_lines_quantity_positive" CHECK ("procurement_requisition_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "procurement_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"boq_revision_id" uuid NOT NULL,
	"requisition_number" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" "procurement_requisition_status" DEFAULT 'open' NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"purchase_manager_user_id" uuid NOT NULL,
	"required_by" date NOT NULL,
	"delivery_location" varchar(500) NOT NULL,
	"notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_requisitions_assignees_distinct" CHECK ("procurement_requisitions"."buyer_user_id" <> "procurement_requisitions"."purchase_manager_user_id"),
	CONSTRAINT "procurement_requisitions_title_required" CHECK (length(trim("procurement_requisitions"."title")) > 0),
	CONSTRAINT "procurement_requisitions_location_required" CHECK (length(trim("procurement_requisitions"."delivery_location")) > 0),
	CONSTRAINT "procurement_requisitions_row_version_positive" CHECK ("procurement_requisitions"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "procurement_rfq_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"requisition_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"item_code_snapshot" varchar(50) NOT NULL,
	"item_name_snapshot" varchar(160) NOT NULL,
	"specification_snapshot" varchar(2000) NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_symbol_snapshot" varchar(20) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_rfq_lines_number_positive" CHECK ("procurement_rfq_lines"."line_number" > 0),
	CONSTRAINT "procurement_rfq_lines_quantity_positive" CHECK ("procurement_rfq_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "procurement_rfq_vendors" (
	"company_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_rfq_vendors_pk" PRIMARY KEY("rfq_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "procurement_rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"rfq_number" varchar(40) NOT NULL,
	"status" "procurement_rfq_status" DEFAULT 'open' NOT NULL,
	"response_due_date" date NOT NULL,
	"commercial_terms" varchar(2000) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_rfqs_terms_required" CHECK (length(trim("procurement_rfqs"."commercial_terms")) > 0),
	CONSTRAINT "procurement_rfqs_row_version_positive" CHECK ("procurement_rfqs"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "procurement_selection_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"selected_offer_id" uuid NOT NULL,
	"selection_reason" varchar(2000) NOT NULL,
	"single_source_exception_reason" varchar(2000),
	"selected_by_user_id" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_selection_reason_required" CHECK (length(trim("procurement_selection_decisions"."selection_reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"status" "purchase_comparison_status" DEFAULT 'open' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_comparisons_row_version_positive" CHECK ("purchase_comparisons"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_offer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"rfq_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"unit_rate" numeric(18, 2) NOT NULL,
	"line_total" numeric(18, 2) NOT NULL,
	"brand_offered" varchar(160) NOT NULL,
	"specification_offered" varchar(2000) NOT NULL,
	"equivalence" "offer_equivalence" NOT NULL,
	"deviation_notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_offer_lines_number_positive" CHECK ("vendor_offer_lines"."line_number" > 0),
	CONSTRAINT "vendor_offer_lines_rate_nonnegative" CHECK ("vendor_offer_lines"."unit_rate" >= 0),
	CONSTRAINT "vendor_offer_lines_total_nonnegative" CHECK ("vendor_offer_lines"."line_total" >= 0),
	CONSTRAINT "vendor_offer_lines_brand_required" CHECK (length(trim("vendor_offer_lines"."brand_offered")) > 0),
	CONSTRAINT "vendor_offer_lines_spec_required" CHECK (length(trim("vendor_offer_lines"."specification_offered")) > 0),
	CONSTRAINT "vendor_offer_lines_deviation_reason" CHECK ("vendor_offer_lines"."equivalence" <> 'deviation' or ("vendor_offer_lines"."deviation_notes" is not null and length(trim("vendor_offer_lines"."deviation_notes")) > 0))
);
--> statement-breakpoint
CREATE TABLE "vendor_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"vendor_reference" varchar(160) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"tax_basis" varchar(500) NOT NULL,
	"freight_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"lead_time_days" integer,
	"payment_terms" varchar(1000) NOT NULL,
	"warranty" varchar(500) NOT NULL,
	"valid_until" date,
	"subtotal" numeric(18, 2) NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"status" "vendor_offer_status" DEFAULT 'submitted' NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_offers_reference_required" CHECK (length(trim("vendor_offers"."vendor_reference")) > 0),
	CONSTRAINT "vendor_offers_currency_format" CHECK ("vendor_offers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "vendor_offers_freight_nonnegative" CHECK ("vendor_offers"."freight_amount" >= 0),
	CONSTRAINT "vendor_offers_lead_time_valid" CHECK ("vendor_offers"."lead_time_days" is null or "vendor_offers"."lead_time_days" >= 0),
	CONSTRAINT "vendor_offers_totals_valid" CHECK ("vendor_offers"."subtotal" >= 0 and "vendor_offers"."total" = "vendor_offers"."subtotal" + "vendor_offers"."freight_amount")
);
--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_requisition_id_procurement_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."procurement_requisitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_boq_line_id_boq_lines_id_fk" FOREIGN KEY ("boq_line_id") REFERENCES "public"."boq_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "procurement_requisitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "procurement_requisitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "procurement_requisitions_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "procurement_requisitions_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "procurement_requisitions_purchase_manager_user_id_users_id_fk" FOREIGN KEY ("purchase_manager_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_lines" ADD CONSTRAINT "procurement_rfq_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_lines" ADD CONSTRAINT "procurement_rfq_lines_rfq_id_procurement_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."procurement_rfqs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_lines" ADD CONSTRAINT "procurement_rfq_lines_requisition_line_id_procurement_requisition_lines_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."procurement_requisition_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_lines" ADD CONSTRAINT "procurement_rfq_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_lines" ADD CONSTRAINT "procurement_rfq_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_vendors" ADD CONSTRAINT "procurement_rfq_vendors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_vendors" ADD CONSTRAINT "procurement_rfq_vendors_rfq_id_procurement_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."procurement_rfqs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfq_vendors" ADD CONSTRAINT "procurement_rfq_vendors_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_requisition_id_procurement_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."procurement_requisitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_decisions" ADD CONSTRAINT "procurement_selection_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_decisions" ADD CONSTRAINT "procurement_selection_decisions_comparison_id_purchase_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."purchase_comparisons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_decisions" ADD CONSTRAINT "procurement_selection_decisions_selected_offer_id_vendor_offers_id_fk" FOREIGN KEY ("selected_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_decisions" ADD CONSTRAINT "procurement_selection_decisions_selected_by_user_id_users_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_comparisons" ADD CONSTRAINT "purchase_comparisons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_comparisons" ADD CONSTRAINT "purchase_comparisons_rfq_id_procurement_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."procurement_rfqs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offer_lines" ADD CONSTRAINT "vendor_offer_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offer_lines" ADD CONSTRAINT "vendor_offer_lines_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offer_lines" ADD CONSTRAINT "vendor_offer_lines_rfq_line_id_procurement_rfq_lines_id_fk" FOREIGN KEY ("rfq_line_id") REFERENCES "public"."procurement_rfq_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_rfq_id_procurement_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."procurement_rfqs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_requisition_lines_number_uidx" ON "procurement_requisition_lines" USING btree ("requisition_id","line_number");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_requisition_lines_boq_uidx" ON "procurement_requisition_lines" USING btree ("requisition_id","boq_line_id");--> statement-breakpoint
CREATE INDEX "procurement_requisition_lines_company_idx" ON "procurement_requisition_lines" USING btree ("company_id","requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_requisitions_company_number_uidx" ON "procurement_requisitions" USING btree ("company_id","requisition_number");--> statement-breakpoint
CREATE INDEX "procurement_requisitions_buyer_status_idx" ON "procurement_requisitions" USING btree ("company_id","buyer_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "procurement_requisitions_manager_status_idx" ON "procurement_requisitions" USING btree ("company_id","purchase_manager_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "procurement_requisitions_project_idx" ON "procurement_requisitions" USING btree ("company_id","project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_rfq_lines_number_uidx" ON "procurement_rfq_lines" USING btree ("rfq_id","line_number");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_rfq_lines_requisition_line_uidx" ON "procurement_rfq_lines" USING btree ("rfq_id","requisition_line_id");--> statement-breakpoint
CREATE INDEX "procurement_rfq_lines_company_idx" ON "procurement_rfq_lines" USING btree ("company_id","rfq_id");--> statement-breakpoint
CREATE INDEX "procurement_rfq_vendors_company_vendor_idx" ON "procurement_rfq_vendors" USING btree ("company_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_rfqs_company_number_uidx" ON "procurement_rfqs" USING btree ("company_id","rfq_number");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_rfqs_requisition_uidx" ON "procurement_rfqs" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "procurement_rfqs_company_status_idx" ON "procurement_rfqs" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_selection_decisions_comparison_uidx" ON "procurement_selection_decisions" USING btree ("comparison_id");--> statement-breakpoint
CREATE INDEX "procurement_selection_decisions_company_idx" ON "procurement_selection_decisions" USING btree ("company_id","selected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_comparisons_rfq_uidx" ON "purchase_comparisons" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "purchase_comparisons_company_status_idx" ON "purchase_comparisons" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_offer_lines_rfq_line_uidx" ON "vendor_offer_lines" USING btree ("vendor_offer_id","rfq_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_offer_lines_number_uidx" ON "vendor_offer_lines" USING btree ("vendor_offer_id","line_number");--> statement-breakpoint
CREATE INDEX "vendor_offer_lines_company_offer_idx" ON "vendor_offer_lines" USING btree ("company_id","vendor_offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_offers_rfq_vendor_uidx" ON "vendor_offers" USING btree ("rfq_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_offers_company_rfq_idx" ON "vendor_offers" USING btree ("company_id","rfq_id","total");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('procurement.sourcing.read', 'View explicitly assigned requisitions, RFQs, vendor offers, and comparisons.'),
	('procurement.requisition.create', 'Create immutable project demand from approved BOQ lines in assigned project scope.'),
	('procurement.rfq.manage', 'Create RFQs for explicitly assigned requisitions.'),
	('procurement.offer.manage', 'Record submitted vendor offers for explicitly assigned RFQs.'),
	('procurement.comparison.select', 'Select a technically equivalent vendor offer as the assigned purchase manager.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", assigned."permission_code"
FROM "roles"
JOIN (VALUES
	('purchase_executive', 'procurement.sourcing.read'),
	('purchase_executive', 'procurement.requisition.create'),
	('purchase_executive', 'procurement.rfq.manage'),
	('purchase_executive', 'procurement.offer.manage'),
	('purchase_manager', 'procurement.sourcing.read'),
	('purchase_manager', 'procurement.comparison.select')
) AS assigned("role_code", "permission_code") ON "roles"."code" = assigned."role_code"
ON CONFLICT DO NOTHING;
