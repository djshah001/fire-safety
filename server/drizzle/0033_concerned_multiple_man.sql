CREATE TYPE "public"."purchase_order_dispatch_channel" AS ENUM('email', 'whatsapp_msg91', 'whatsapp_manual');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_dispatch_status" AS ENUM('queued', 'sent', 'failed', 'manual_opened');--> statement-breakpoint
CREATE TYPE "public"."supplier_return_resolution_type" AS ENUM('replacement', 'credit_note', 'deduction');--> statement-breakpoint
CREATE TYPE "public"."supplier_return_status" AS ENUM('draft', 'dispatched', 'replacement_received', 'credit_settled', 'closed');--> statement-breakpoint
ALTER TYPE "public"."purchase_order_status" ADD VALUE 'short_closed' BEFORE 'closed';--> statement-breakpoint
CREATE TABLE "procurement_selection_line_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"selection_decision_id" uuid NOT NULL,
	"rfq_line_id" uuid NOT NULL,
	"winning_vendor_id" uuid NOT NULL,
	"winning_offer_id" uuid NOT NULL,
	"winning_offer_line_id" uuid NOT NULL,
	"awarded_quantity" numeric(18, 4) NOT NULL,
	"selection_reason" varchar(2000) NOT NULL,
	"generated_po_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_selection_line_awards_quantity_positive" CHECK ("procurement_selection_line_awards"."awarded_quantity" > 0),
	CONSTRAINT "procurement_selection_line_awards_reason_required" CHECK (length(trim("procurement_selection_line_awards"."selection_reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"channel" "purchase_order_dispatch_channel" NOT NULL,
	"recipient_name" varchar(160) NOT NULL,
	"recipient_contact" varchar(320) NOT NULL,
	"status" "purchase_order_dispatch_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" varchar(200),
	"sent_by_user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"error_message" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_dispatches_recipient_required" CHECK (length(trim("purchase_order_dispatches"."recipient_name")) > 0 and length(trim("purchase_order_dispatches"."recipient_contact")) > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_return_id" uuid NOT NULL,
	"goods_receipt_line_id" uuid NOT NULL,
	"purchase_order_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_offering_id" uuid,
	"return_quantity" numeric(18, 4) NOT NULL,
	"replacement_received_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"remarks" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_return_lines_quantity_positive" CHECK ("supplier_return_lines"."return_quantity" > 0),
	CONSTRAINT "supplier_return_lines_replacement_valid" CHECK ("supplier_return_lines"."replacement_received_quantity" >= 0 and "supplier_return_lines"."replacement_received_quantity" <= "supplier_return_lines"."return_quantity")
);
--> statement-breakpoint
CREATE TABLE "supplier_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rtv_number" varchar(40) NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"project_id" uuid,
	"status" "supplier_return_status" DEFAULT 'draft' NOT NULL,
	"resolution_type" "supplier_return_resolution_type" NOT NULL,
	"transporter_name" varchar(160),
	"vehicle_number" varchar(50),
	"dispatch_date" date,
	"reason" varchar(2000) NOT NULL,
	"credit_note_reference" varchar(160),
	"settled_at" timestamp with time zone,
	"pdf_storage_name" varchar(255),
	"pdf_checksum_sha256" varchar(64),
	"created_by_user_id" uuid NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_returns_reason_required" CHECK (length(trim("supplier_returns"."reason")) > 0),
	CONSTRAINT "supplier_returns_row_version_positive" CHECK ("supplier_returns"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "vendor_price_inquiries" ADD COLUMN "requisition_id" uuid;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD COLUMN "excess_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD COLUMN "excess_approval_reason" varchar(2000);--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD COLUMN "excess_approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "short_closed_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "short_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "short_closed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "short_close_reason" varchar(2000);--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD COLUMN "source_price_inquiry_response_id" uuid;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_selection_decision_id_procurement_selection_decisions_id_fk" FOREIGN KEY ("selection_decision_id") REFERENCES "public"."procurement_selection_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_rfq_line_id_procurement_rfq_lines_id_fk" FOREIGN KEY ("rfq_line_id") REFERENCES "public"."procurement_rfq_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_winning_vendor_id_vendors_id_fk" FOREIGN KEY ("winning_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_winning_offer_id_vendor_offers_id_fk" FOREIGN KEY ("winning_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_winning_offer_line_id_vendor_offer_lines_id_fk" FOREIGN KEY ("winning_offer_line_id") REFERENCES "public"."vendor_offer_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_selection_line_awards" ADD CONSTRAINT "procurement_selection_line_awards_generated_po_id_purchase_orders_id_fk" FOREIGN KEY ("generated_po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_dispatches" ADD CONSTRAINT "purchase_order_dispatches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_dispatches" ADD CONSTRAINT "purchase_order_dispatches_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_dispatches" ADD CONSTRAINT "purchase_order_dispatches_revision_id_purchase_order_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."purchase_order_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_dispatches" ADD CONSTRAINT "purchase_order_dispatches_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_supplier_return_id_supplier_returns_id_fk" FOREIGN KEY ("supplier_return_id") REFERENCES "public"."supplier_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_goods_receipt_line_id_goods_receipt_lines_id_fk" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "public"."goods_receipt_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_selection_line_awards_line_uidx" ON "procurement_selection_line_awards" USING btree ("selection_decision_id","rfq_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_selection_line_awards_offer_line_uidx" ON "procurement_selection_line_awards" USING btree ("winning_offer_line_id");--> statement-breakpoint
CREATE INDEX "procurement_selection_line_awards_company_idx" ON "procurement_selection_line_awards" USING btree ("company_id","selection_decision_id");--> statement-breakpoint
CREATE INDEX "procurement_selection_line_awards_vendor_idx" ON "procurement_selection_line_awards" USING btree ("company_id","winning_vendor_id");--> statement-breakpoint
CREATE INDEX "purchase_order_dispatches_po_idx" ON "purchase_order_dispatches" USING btree ("company_id","purchase_order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_return_lines_grn_line_uidx" ON "supplier_return_lines" USING btree ("supplier_return_id","goods_receipt_line_id");--> statement-breakpoint
CREATE INDEX "supplier_return_lines_company_return_idx" ON "supplier_return_lines" USING btree ("company_id","supplier_return_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_returns_company_number_uidx" ON "supplier_returns" USING btree ("company_id","rtv_number");--> statement-breakpoint
CREATE INDEX "supplier_returns_company_po_idx" ON "supplier_returns" USING btree ("company_id","purchase_order_id","status");--> statement-breakpoint
CREATE INDEX "supplier_returns_company_grn_idx" ON "supplier_returns" USING btree ("company_id","goods_receipt_id");--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_excess_approved_by_user_id_users_id_fk" FOREIGN KEY ("excess_approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_short_closed_by_user_id_users_id_fk" FOREIGN KEY ("short_closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_source_price_inquiry_response_id_vendor_price_inquiry_responses_id_fk" FOREIGN KEY ("source_price_inquiry_response_id") REFERENCES "public"."vendor_price_inquiry_responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vpi_requisition_idx" ON "vendor_price_inquiries" USING btree ("requisition_id");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'quotation_lines_company_rev_sort_idx') THEN
    CREATE INDEX "quotation_lines_company_rev_sort_idx" ON "quotation_lines" USING btree ("company_id","quotation_revision_id","sort_order");
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_offers_source_inquiry_response_uidx" ON "vendor_offers" USING btree ("source_price_inquiry_response_id") WHERE "vendor_offers"."source_price_inquiry_response_id" is not null;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotation_lines_sort_positive') THEN
    ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_sort_positive" CHECK ("quotation_lines"."sort_order" > 0);
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_excess_valid" CHECK ("goods_receipt_lines"."excess_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_excess_reason" CHECK ("goods_receipt_lines"."excess_quantity" = 0 or ("goods_receipt_lines"."excess_approval_reason" is not null and length(trim("goods_receipt_lines"."excess_approval_reason")) > 0 and "goods_receipt_lines"."excess_approved_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "vendor_price_inquiries" ADD CONSTRAINT "vendor_price_inquiries_requisition_id_procurement_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."procurement_requisitions"("id") ON DELETE set null ON UPDATE no action;