CREATE TYPE "public"."po_line_destination_type" AS ENUM('warehouse', 'direct_to_site');--> statement-breakpoint
CREATE TYPE "public"."delivery_challan_status" AS ENUM('dispatched', 'verified', 'discrepancy_pending', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."material_issue_request_status" AS ENUM('open', 'partially_dispatched', 'dispatched', 'completed', 'short_closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."replenishment_request_status" AS ENUM('open', 'ordered', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."site_return_status" AS ENUM('submitted', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_location_type" AS ENUM('main', 'in_transit', 'site', 'staging');--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'dc_dispatch_out';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'dc_dispatch_in';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'dc_pod_in';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'dc_discrepancy_return';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'dc_discrepancy_writeoff';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'dc_discrepancy_restock';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'site_return_out';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_source_type" ADD VALUE 'site_return_in';--> statement-breakpoint
CREATE TABLE "delivery_challan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dc_id" uuid NOT NULL,
	"mir_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_offering_id" uuid,
	"dispatched_qty" numeric(18, 4) NOT NULL,
	"verified_received_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"damaged_or_short_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"line_remarks" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_challan_lines_number_positive" CHECK ("delivery_challan_lines"."line_number" > 0),
	CONSTRAINT "delivery_challan_lines_quantities_valid" CHECK ("delivery_challan_lines"."dispatched_qty" > 0 and "delivery_challan_lines"."verified_received_qty" >= 0 and "delivery_challan_lines"."damaged_or_short_qty" >= 0 and "delivery_challan_lines"."verified_received_qty" + "delivery_challan_lines"."damaged_or_short_qty" <= "delivery_challan_lines"."dispatched_qty")
);
--> statement-breakpoint
CREATE TABLE "delivery_challans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dc_number" varchar(50) NOT NULL,
	"mir_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"site_location_id" uuid NOT NULL,
	"status" "delivery_challan_status" DEFAULT 'dispatched' NOT NULL,
	"dispatched_by_user_id" uuid NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transporter_name" varchar(160),
	"vehicle_number" varchar(50),
	"receiver_name" varchar(160),
	"pdf_storage_name" varchar(255),
	"pdf_checksum_sha256" varchar(64),
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"pod_photo_storage_name" varchar(255),
	"pod_photo_checksum_sha256" varchar(64),
	"verification_notes" varchar(2000),
	"discrepancy_resolution_notes" varchar(2000),
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_challans_row_version_positive" CHECK ("delivery_challans"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_issue_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mir_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"quotation_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_offering_id" uuid,
	"unit_id" uuid NOT NULL,
	"requested_qty" numeric(18, 4) NOT NULL,
	"reserved_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"dispatched_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"verified_received_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"damaged_or_short_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"reservation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_issue_request_lines_number_positive" CHECK ("material_issue_request_lines"."line_number" > 0),
	CONSTRAINT "material_issue_request_lines_quantities_valid" CHECK ("material_issue_request_lines"."requested_qty" > 0 and "material_issue_request_lines"."reserved_qty" >= 0 and "material_issue_request_lines"."dispatched_qty" >= 0 and "material_issue_request_lines"."dispatched_qty" <= "material_issue_request_lines"."requested_qty" and "material_issue_request_lines"."verified_received_qty" >= 0 and "material_issue_request_lines"."damaged_or_short_qty" >= 0 and "material_issue_request_lines"."verified_received_qty" + "material_issue_request_lines"."damaged_or_short_qty" <= "material_issue_request_lines"."dispatched_qty")
);
--> statement-breakpoint
CREATE TABLE "material_issue_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mir_number" varchar(50) NOT NULL,
	"project_id" uuid NOT NULL,
	"quotation_revision_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"status" "material_issue_request_status" DEFAULT 'open' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_issue_requests_row_version_positive" CHECK ("material_issue_requests"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "site_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_return_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_offering_id" uuid,
	"quantity" numeric(18, 4) NOT NULL,
	"condition_notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_return_lines_number_positive" CHECK ("site_return_lines"."line_number" > 0),
	CONSTRAINT "site_return_lines_quantity_positive" CHECK ("site_return_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "site_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"return_number" varchar(50) NOT NULL,
	"project_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"site_location_id" uuid NOT NULL,
	"status" "site_return_status" DEFAULT 'submitted' NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"reason" varchar(1000) NOT NULL,
	"notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_returns_reason_required" CHECK (length(trim("site_returns"."reason")) > 0),
	CONSTRAINT "site_returns_row_version_positive" CHECK ("site_returns"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "store_replenishment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"srr_number" varchar(50) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_offering_id" uuid,
	"requested_qty" numeric(18, 4) NOT NULL,
	"current_free_qty" numeric(18, 4) NOT NULL,
	"min_stock" numeric(18, 4) NOT NULL,
	"max_stock" numeric(18, 4) NOT NULL,
	"status" "replenishment_request_status" DEFAULT 'open' NOT NULL,
	"linked_po_id" uuid,
	"requested_by_user_id" uuid NOT NULL,
	"notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_replenishment_requests_qty_positive" CHECK ("store_replenishment_requests"."requested_qty" > 0 and "store_replenishment_requests"."current_free_qty" >= 0 and "store_replenishment_requests"."min_stock" >= 0 and "store_replenishment_requests"."max_stock" >= "store_replenishment_requests"."min_stock"),
	CONSTRAINT "store_replenishment_requests_row_version_positive" CHECK ("store_replenishment_requests"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "warehouse_item_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_offering_id" uuid,
	"min_stock" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"max_stock" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"low_stock_alert_active" boolean DEFAULT false NOT NULL,
	"low_stock_alert_sent_at" timestamp with time zone,
	"updated_by_user_id" uuid NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_item_thresholds_min_max_valid" CHECK ("warehouse_item_thresholds"."min_stock" >= 0 and "warehouse_item_thresholds"."max_stock" >= "warehouse_item_thresholds"."min_stock"),
	CONSTRAINT "warehouse_item_thresholds_row_version_positive" CHECK ("warehouse_item_thresholds"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_role_valid";--> statement-breakpoint
DROP INDEX IF EXISTS "stock_balances_warehouse_item_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "procurement_requisition_lines_boq_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "stock_ledger_entries_unique_source_posting_uidx";--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ALTER COLUMN "boq_line_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ALTER COLUMN "boq_revision_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD COLUMN "location_type" "stock_location_type" DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD COLUMN "project_id" uuid;--> statement-breakpoint
INSERT INTO "stock_locations" ("company_id", "warehouse_id", "code", "name", "location_type", "project_id", "is_active")
SELECT "company_id", "id", 'MAIN', 'Main Store', 'main'::"stock_location_type", NULL, 1
FROM "warehouses"
ON CONFLICT ("warehouse_id", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "stock_locations" ("company_id", "warehouse_id", "code", "name", "location_type", "project_id", "is_active")
SELECT "company_id", "id", 'IN_TRANSIT', 'In Transit', 'in_transit'::"stock_location_type", NULL, 1
FROM "warehouses"
ON CONFLICT ("warehouse_id", "code") DO NOTHING;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "brand_offering_id" uuid;--> statement-breakpoint
UPDATE "stock_balances" sb
SET "location_id" = sl."id"
FROM "stock_locations" sl
WHERE sl."warehouse_id" = sb."warehouse_id"
  AND sl."code" = 'MAIN'
  AND sb."location_id" IS NULL;--> statement-breakpoint
ALTER TABLE "stock_balances" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD COLUMN "brand_offering_id" uuid;--> statement-breakpoint
UPDATE "stock_ledger_entries" sle
SET "location_id" = sl."id"
FROM "stock_locations" sl
WHERE sl."warehouse_id" = sle."warehouse_id"
  AND sl."code" = 'MAIN'
  AND sle."location_id" IS NULL;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD COLUMN "brand_offering_id" uuid;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD COLUMN "quotation_line_id" uuid;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD COLUMN "srr_id" uuid;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD COLUMN "project_allocation_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD COLUMN "store_replenishment_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD COLUMN "destination_type" "po_line_destination_type" DEFAULT 'warehouse' NOT NULL;--> statement-breakpoint
UPDATE "procurement_requisition_lines"
SET "project_allocation_qty" = "quantity",
    "store_replenishment_qty" = '0.0000';--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD COLUMN "quotation_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "brand_offering_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "quotation_line_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "srr_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "project_allocation_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "store_replenishment_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "allocated_received_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "store_received_qty" numeric(18, 4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "destination_type" "po_line_destination_type" DEFAULT 'warehouse' NOT NULL;--> statement-breakpoint
UPDATE "purchase_order_lines"
SET "project_allocation_qty" = "quantity",
    "store_replenishment_qty" = '0.0000';--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD COLUMN "brand_offering_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD COLUMN "brand_offering_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_dc_id_delivery_challans_id_fk" FOREIGN KEY ("dc_id") REFERENCES "public"."delivery_challans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_mir_line_id_material_issue_request_lines_id_fk" FOREIGN KEY ("mir_line_id") REFERENCES "public"."material_issue_request_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_mir_id_material_issue_requests_id_fk" FOREIGN KEY ("mir_id") REFERENCES "public"."material_issue_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_site_location_id_stock_locations_id_fk" FOREIGN KEY ("site_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_dispatched_by_user_id_users_id_fk" FOREIGN KEY ("dispatched_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_mir_id_material_issue_requests_id_fk" FOREIGN KEY ("mir_id") REFERENCES "public"."material_issue_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_quotation_line_id_quotation_lines_id_fk" FOREIGN KEY ("quotation_line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_request_lines" ADD CONSTRAINT "material_issue_request_lines_reservation_id_stock_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stock_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_requests" ADD CONSTRAINT "material_issue_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_requests" ADD CONSTRAINT "material_issue_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_requests" ADD CONSTRAINT "material_issue_requests_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_requests" ADD CONSTRAINT "material_issue_requests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issue_requests" ADD CONSTRAINT "material_issue_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_return_lines" ADD CONSTRAINT "site_return_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_return_lines" ADD CONSTRAINT "site_return_lines_site_return_id_site_returns_id_fk" FOREIGN KEY ("site_return_id") REFERENCES "public"."site_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_return_lines" ADD CONSTRAINT "site_return_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_return_lines" ADD CONSTRAINT "site_return_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_returns" ADD CONSTRAINT "site_returns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_returns" ADD CONSTRAINT "site_returns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_returns" ADD CONSTRAINT "site_returns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_returns" ADD CONSTRAINT "site_returns_site_location_id_stock_locations_id_fk" FOREIGN KEY ("site_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_returns" ADD CONSTRAINT "site_returns_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_returns" ADD CONSTRAINT "site_returns_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_replenishment_requests" ADD CONSTRAINT "store_replenishment_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_replenishment_requests" ADD CONSTRAINT "store_replenishment_requests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_replenishment_requests" ADD CONSTRAINT "store_replenishment_requests_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_replenishment_requests" ADD CONSTRAINT "store_replenishment_requests_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_replenishment_requests" ADD CONSTRAINT "store_replenishment_requests_linked_po_id_purchase_orders_id_fk" FOREIGN KEY ("linked_po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_replenishment_requests" ADD CONSTRAINT "store_replenishment_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_thresholds" ADD CONSTRAINT "warehouse_item_thresholds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_thresholds" ADD CONSTRAINT "warehouse_item_thresholds_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_thresholds" ADD CONSTRAINT "warehouse_item_thresholds_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_thresholds" ADD CONSTRAINT "warehouse_item_thresholds_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_thresholds" ADD CONSTRAINT "warehouse_item_thresholds_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_challan_lines_dc_line_uidx" ON "delivery_challan_lines" USING btree ("dc_id","line_number");--> statement-breakpoint
CREATE INDEX "delivery_challan_lines_mir_line_idx" ON "delivery_challan_lines" USING btree ("company_id","mir_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_challans_company_number_uidx" ON "delivery_challans" USING btree ("company_id","dc_number");--> statement-breakpoint
CREATE INDEX "delivery_challans_project_status_idx" ON "delivery_challans" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "delivery_challans_mir_idx" ON "delivery_challans" USING btree ("company_id","mir_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_issue_request_lines_mir_line_uidx" ON "material_issue_request_lines" USING btree ("mir_id","line_number");--> statement-breakpoint
CREATE INDEX "material_issue_request_lines_quotation_line_idx" ON "material_issue_request_lines" USING btree ("company_id","quotation_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_issue_requests_company_number_uidx" ON "material_issue_requests" USING btree ("company_id","mir_number");--> statement-breakpoint
CREATE INDEX "material_issue_requests_project_status_idx" ON "material_issue_requests" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "material_issue_requests_warehouse_status_idx" ON "material_issue_requests" USING btree ("company_id","warehouse_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "site_return_lines_return_line_uidx" ON "site_return_lines" USING btree ("site_return_id","line_number");--> statement-breakpoint
CREATE INDEX "site_return_lines_item_idx" ON "site_return_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_returns_company_number_uidx" ON "site_returns" USING btree ("company_id","return_number");--> statement-breakpoint
CREATE INDEX "site_returns_project_status_idx" ON "site_returns" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "store_replenishment_requests_company_number_uidx" ON "store_replenishment_requests" USING btree ("company_id","srr_number");--> statement-breakpoint
CREATE INDEX "store_replenishment_requests_company_status_idx" ON "store_replenishment_requests" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "store_replenishment_requests_warehouse_item_idx" ON "store_replenishment_requests" USING btree ("warehouse_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_item_thresholds_wh_item_brand_uidx" ON "warehouse_item_thresholds" USING btree ("company_id","warehouse_id","item_id",COALESCE("brand_offering_id", '00000000-0000-0000-0000-000000000000'));--> statement-breakpoint
CREATE INDEX "warehouse_item_thresholds_company_alert_idx" ON "warehouse_item_thresholds" USING btree ("company_id","warehouse_id","low_stock_alert_active");--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_quotation_line_id_quotation_lines_id_fk" FOREIGN KEY ("quotation_line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_srr_id_store_replenishment_requests_id_fk" FOREIGN KEY ("srr_id") REFERENCES "public"."store_replenishment_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "procurement_requisitions_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_quotation_line_id_quotation_lines_id_fk" FOREIGN KEY ("quotation_line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_srr_id_store_replenishment_requests_id_fk" FOREIGN KEY ("srr_id") REFERENCES "public"."store_replenishment_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_brand_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("brand_offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_balances_wh_loc_item_brand_uidx" ON "stock_balances" USING btree ("company_id","warehouse_id","location_id","item_id",COALESCE("brand_offering_id", '00000000-0000-0000-0000-000000000000'));--> statement-breakpoint
CREATE INDEX "stock_balances_location_idx" ON "stock_balances" USING btree ("company_id","location_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_locations_warehouse_project_site_uidx" ON "stock_locations" USING btree ("warehouse_id","project_id") WHERE "stock_locations"."location_type" = 'site' and "stock_locations"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "stock_locations_warehouse_type_idx" ON "stock_locations" USING btree ("company_id","warehouse_id","location_type");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_requisition_lines_boq_uidx" ON "procurement_requisition_lines" USING btree ("requisition_id","boq_line_id") WHERE "procurement_requisition_lines"."boq_line_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_ledger_entries_unique_source_posting_uidx" ON "stock_ledger_entries" USING btree ("company_id","source_type","source_id","warehouse_id","location_id","item_id",COALESCE("brand_offering_id", '00000000-0000-0000-0000-000000000000'),"direction");--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_valid" CHECK ("project_members"."role" in ('project_manager', 'sales', 'design', 'purchase', 'site_engineer', 'member', 'viewer'));--> statement-breakpoint
ALTER TABLE "procurement_requisition_lines" ADD CONSTRAINT "procurement_requisition_lines_split_valid" CHECK ("procurement_requisition_lines"."project_allocation_qty" >= 0 and "procurement_requisition_lines"."store_replenishment_qty" >= 0 and "procurement_requisition_lines"."project_allocation_qty" + "procurement_requisition_lines"."store_replenishment_qty" = "procurement_requisition_lines"."quantity");--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_split_valid" CHECK ("purchase_order_lines"."project_allocation_qty" >= 0 and "purchase_order_lines"."store_replenishment_qty" >= 0 and "purchase_order_lines"."project_allocation_qty" + "purchase_order_lines"."store_replenishment_qty" = "purchase_order_lines"."quantity");--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_split_received_valid" CHECK ("purchase_order_lines"."allocated_received_qty" >= 0 and "purchase_order_lines"."store_received_qty" >= 0 and "purchase_order_lines"."allocated_received_qty" <= "purchase_order_lines"."project_allocation_qty" and "purchase_order_lines"."store_received_qty" <= "purchase_order_lines"."store_replenishment_qty");--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_site_project_consistent" CHECK ("stock_locations"."location_type" <> 'site' or "stock_locations"."project_id" is not null);--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('procurement.vendor.read', 'View operational vendor identity and contact fields.'),
	('procurement.item.read', 'View item, category, and unit master records.'),
	('project.read', 'View projects where the employee is an explicit project member.'),
	('procurement.purchase_order.read', 'View purchase orders in assigned project or purchasing scope.'),
	('procurement.goods_receipt.read', 'View goods receipts and delivery records in assigned scope.'),
	('procurement.goods_receipt.manage', 'Record goods receipts against issued purchase orders.'),
	('inventory.warehouse.read', 'View warehouse and stock location directories.'),
	('inventory.warehouse.manage', 'Create and configure warehouses and stock locations.'),
	('inventory.stock.read', 'View real-time stock balances, transactions, and movements.'),
	('inventory.receipt.post', 'Post inspected and accepted goods receipts into warehouse stock ledger.'),
	('inventory.transfer.create', 'Create inter-warehouse and site transfer challans.'),
	('inventory.transfer.dispatch', 'Dispatch material for transit between warehouses or to project sites.'),
	('inventory.transfer.receive', 'Receive dispatched transit material at destination warehouse or project site.'),
	('inventory.reservation.manage', 'Allocate or release warehouse stock reservations for project BOQ requirements.'),
	('inventory.site_issue.create', 'Issue stock to project sites for execution and consumption.'),
	('inventory.site_return.create', 'Return unused or defective stock from project sites back to warehouse.'),
	('inventory.adjustment.manage', 'Perform stock adjustments and write-offs with mandatory business reasons.'),
	('project.execution.read', 'View project tasks, milestones, daily reports, delays, and variations in assigned project scope.'),
	('project.task.manage', 'Create, update, and manage project milestones, tasks, and schedules in assigned project scope.'),
	('project.daily_report.create', 'Draft, submit, and revise daily progress reports as assigned site engineer.'),
	('project.delay.manage', 'Record and manage site delay notices and impact assessments.'),
	('project.variation.create', 'Initiate site variations and scope deviations for project changes.'),
	('project.expense.manage', 'Record and submit site project expenses.'),
	('project.quality.read', 'View quality checklist templates, inspections, protocol test reports, and punch items.'),
	('project.quality.manage', 'Create, schedule, execute inspections, and log test reports in assigned project scope.'),
	('project.punch_item.manage', 'Log and rectify punch items.'),
	('inventory.threshold.manage', 'Configure warehouse item minimum and maximum stock thresholds.'),
	('inventory.request.create', 'Submit material issue requests against available warehouse stock for accepted quotations.'),
	('inventory.dispatch.execute', 'Dispatch material issue requests and generate delivery challans.'),
	('inventory.pod.verify', 'Verify site delivery challans and upload proof of delivery.'),
	('inventory.discrepancy.resolve', 'Resolve transit and delivery challan discrepancies.'),
	('inventory.replenishment.request', 'Submit store replenishment requests to the purchase queue.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";--> statement-breakpoint
INSERT INTO "roles" ("company_id", "code", "name", "description", "is_system")
SELECT "id", 'storekeeper', 'Storekeeper', 'Warehouse stock management, MIR dispatch, thresholds, and replenishment requests.', true
FROM "companies"
ON CONFLICT ("company_id", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "roles" ("company_id", "code", "name", "description", "is_system")
SELECT "id", 'site_engineer', 'Site engineer', 'Site execution, daily reports, POD verification, and site returns.', true
FROM "companies"
ON CONFLICT ("company_id", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", "permissions"."code"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."code" = 'system_admin' AND "roles"."is_system" = true
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", assigned."permission_code"
FROM "roles"
CROSS JOIN (VALUES
	('purchase_executive', 'inventory.warehouse.read'),
	('purchase_executive', 'inventory.stock.read'),
	('purchase_executive', 'inventory.request.create'),
	('purchase_manager', 'inventory.threshold.manage'),
	('purchase_manager', 'inventory.request.create'),
	('purchase_manager', 'inventory.discrepancy.resolve'),
	('management', 'inventory.discrepancy.resolve'),
	('project_manager', 'inventory.pod.verify'),
	('project_manager', 'inventory.discrepancy.resolve'),
	('receiver', 'inventory.threshold.manage'),
	('receiver', 'inventory.dispatch.execute'),
	('receiver', 'inventory.replenishment.request'),
	('storekeeper', 'procurement.vendor.read'),
	('storekeeper', 'procurement.item.read'),
	('storekeeper', 'project.read'),
	('storekeeper', 'procurement.purchase_order.read'),
	('storekeeper', 'procurement.goods_receipt.read'),
	('storekeeper', 'procurement.goods_receipt.manage'),
	('storekeeper', 'inventory.warehouse.read'),
	('storekeeper', 'inventory.warehouse.manage'),
	('storekeeper', 'inventory.stock.read'),
	('storekeeper', 'inventory.receipt.post'),
	('storekeeper', 'inventory.transfer.create'),
	('storekeeper', 'inventory.transfer.dispatch'),
	('storekeeper', 'inventory.transfer.receive'),
	('storekeeper', 'inventory.reservation.manage'),
	('storekeeper', 'inventory.site_issue.create'),
	('storekeeper', 'inventory.site_return.create'),
	('storekeeper', 'inventory.adjustment.manage'),
	('storekeeper', 'inventory.threshold.manage'),
	('storekeeper', 'inventory.dispatch.execute'),
	('storekeeper', 'inventory.replenishment.request'),
	('site_engineer', 'project.read'),
	('site_engineer', 'project.execution.read'),
	('site_engineer', 'project.task.manage'),
	('site_engineer', 'project.daily_report.create'),
	('site_engineer', 'project.delay.manage'),
	('site_engineer', 'project.variation.create'),
	('site_engineer', 'project.expense.manage'),
	('site_engineer', 'project.quality.read'),
	('site_engineer', 'project.quality.manage'),
	('site_engineer', 'project.punch_item.manage'),
	('site_engineer', 'inventory.warehouse.read'),
	('site_engineer', 'inventory.stock.read'),
	('site_engineer', 'inventory.pod.verify'),
	('site_engineer', 'inventory.site_return.create')
) AS assigned("role_code", "permission_code")
WHERE "roles"."code" = assigned."role_code"
ON CONFLICT DO NOTHING;