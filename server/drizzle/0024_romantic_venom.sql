CREATE TYPE "public"."goods_receipt_status" AS ENUM('draft', 'inspected', 'accepted', 'partially_rejected', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_revision_status" AS ENUM('draft', 'submitted', 'approved', 'issued', 'superseded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'pending_approval', 'approved', 'issued', 'partially_delivered', 'delivered', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"delivered_quantity" numeric(18, 4) NOT NULL,
	"accepted_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"rejected_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"rejection_reason" varchar(2000),
	"inspection_notes" varchar(2000),
	"inspected_by_user_id" uuid,
	"inspected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_lines_number_positive" CHECK ("goods_receipt_lines"."line_number" > 0),
	CONSTRAINT "goods_receipt_lines_delivered_positive" CHECK ("goods_receipt_lines"."delivered_quantity" > 0),
	CONSTRAINT "goods_receipt_lines_quantities_valid" CHECK ("goods_receipt_lines"."accepted_quantity" >= 0 and "goods_receipt_lines"."rejected_quantity" >= 0 and "goods_receipt_lines"."delivered_quantity" >= "goods_receipt_lines"."accepted_quantity" + "goods_receipt_lines"."rejected_quantity"),
	CONSTRAINT "goods_receipt_lines_rejection_reason" CHECK ("goods_receipt_lines"."rejected_quantity" = 0 or ("goods_receipt_lines"."rejection_reason" is not null and length(trim("goods_receipt_lines"."rejection_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"grn_number" varchar(40) NOT NULL,
	"vendor_challan_number" varchar(100) NOT NULL,
	"vendor_challan_date" date NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by_user_id" uuid NOT NULL,
	"status" "goods_receipt_status" DEFAULT 'draft' NOT NULL,
	"delivery_location" varchar(500) NOT NULL,
	"vehicle_number" varchar(50),
	"transporter_name" varchar(160),
	"notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipts_challan_required" CHECK (length(trim("goods_receipts"."vendor_challan_number")) > 0),
	CONSTRAINT "goods_receipts_location_required" CHECK (length(trim("goods_receipts"."delivery_location")) > 0),
	CONSTRAINT "goods_receipts_row_version_positive" CHECK ("goods_receipts"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"item_code_snapshot" varchar(50) NOT NULL,
	"item_name_snapshot" varchar(160) NOT NULL,
	"specification_snapshot" varchar(2000) NOT NULL,
	"brand_offered" varchar(160) NOT NULL,
	"model_snapshot" varchar(160),
	"unit_id" uuid NOT NULL,
	"unit_symbol_snapshot" varchar(20) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_rate" numeric(18, 2) NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"line_total" numeric(18, 2) NOT NULL,
	"received_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"accepted_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"rejected_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"requisition_line_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_lines_number_positive" CHECK ("purchase_order_lines"."line_number" > 0),
	CONSTRAINT "purchase_order_lines_quantity_positive" CHECK ("purchase_order_lines"."quantity" > 0),
	CONSTRAINT "purchase_order_lines_rate_nonnegative" CHECK ("purchase_order_lines"."unit_rate" >= 0),
	CONSTRAINT "purchase_order_lines_tax_percent_range" CHECK ("purchase_order_lines"."tax_percent" >= 0 and "purchase_order_lines"."tax_percent" <= 100),
	CONSTRAINT "purchase_order_lines_received_quantities_valid" CHECK ("purchase_order_lines"."received_quantity" >= 0 and "purchase_order_lines"."accepted_quantity" >= 0 and "purchase_order_lines"."rejected_quantity" >= 0 and "purchase_order_lines"."received_quantity" >= "purchase_order_lines"."accepted_quantity" + "purchase_order_lines"."rejected_quantity")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"status" "purchase_order_revision_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"grand_total" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"change_reason" varchar(2000),
	"prepared_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"approval_notes" varchar(2000),
	"issued_at" timestamp with time zone,
	"issued_pdf_storage_id" varchar(255),
	"issued_pdf_checksum" varchar(64),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_revisions_number_nonnegative" CHECK ("purchase_order_revisions"."revision_number" >= 0),
	CONSTRAINT "purchase_order_revisions_amendment_reason" CHECK ("purchase_order_revisions"."revision_number" = 0 or ("purchase_order_revisions"."change_reason" is not null and length(trim("purchase_order_revisions"."change_reason")) > 0)),
	CONSTRAINT "purchase_order_revisions_totals_valid" CHECK ("purchase_order_revisions"."subtotal" >= 0 and "purchase_order_revisions"."tax_amount" >= 0 and "purchase_order_revisions"."grand_total" = "purchase_order_revisions"."subtotal" + "purchase_order_revisions"."tax_amount"),
	CONSTRAINT "purchase_order_revisions_row_version_positive" CHECK ("purchase_order_revisions"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"requisition_id" uuid,
	"po_number" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"payment_terms" varchar(1000) NOT NULL,
	"delivery_terms" varchar(1000) NOT NULL,
	"delivery_location" varchar(500) NOT NULL,
	"delivery_due_date" date,
	"billing_address" varchar(500),
	"shipping_address" varchar(500),
	"notes" varchar(2000),
	"current_revision_number" integer DEFAULT 0 NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"grand_total" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_title_required" CHECK (length(trim("purchase_orders"."title")) > 0),
	CONSTRAINT "purchase_orders_location_required" CHECK (length(trim("purchase_orders"."delivery_location")) > 0),
	CONSTRAINT "purchase_orders_currency_format" CHECK ("purchase_orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "purchase_orders_totals_valid" CHECK ("purchase_orders"."subtotal" >= 0 and "purchase_orders"."tax_amount" >= 0 and "purchase_orders"."grand_total" = "purchase_orders"."subtotal" + "purchase_orders"."tax_amount"),
	CONSTRAINT "purchase_orders_row_version_positive" CHECK ("purchase_orders"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_inspected_by_user_id_users_id_fk" FOREIGN KEY ("inspected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_revision_id_purchase_order_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."purchase_order_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_requisition_line_id_procurement_requisition_lines_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."procurement_requisition_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_procurement_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."procurement_requisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipt_lines_grn_line_uidx" ON "goods_receipt_lines" USING btree ("goods_receipt_id","line_number");--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_po_line_idx" ON "goods_receipt_lines" USING btree ("company_id","purchase_order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipts_company_grn_number_uidx" ON "goods_receipts" USING btree ("company_id","grn_number");--> statement-breakpoint
CREATE INDEX "goods_receipts_company_po_idx" ON "goods_receipts" USING btree ("company_id","purchase_order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_rev_line_uidx" ON "purchase_order_lines" USING btree ("revision_id","line_number");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("company_id","purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_revisions_po_rev_uidx" ON "purchase_order_revisions" USING btree ("purchase_order_id","revision_number");--> statement-breakpoint
CREATE INDEX "purchase_order_revisions_company_status_idx" ON "purchase_order_revisions" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_company_number_uidx" ON "purchase_orders" USING btree ("company_id","po_number");--> statement-breakpoint
CREATE INDEX "purchase_orders_company_project_idx" ON "purchase_orders" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_company_vendor_idx" ON "purchase_orders" USING btree ("company_id","vendor_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_company_status_idx" ON "purchase_orders" USING btree ("company_id","status","updated_at");
