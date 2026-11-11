CREATE TYPE "public"."stock_document_status" AS ENUM('draft', 'posted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_document_type" AS ENUM('receipt', 'opening_balance', 'site_dispatch', 'site_issue', 'site_return', 'warehouse_transfer', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_source_type" AS ENUM('goods_receipt_line', 'opening_balance', 'transfer_dispatch', 'transfer_receipt', 'site_issue', 'site_return', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."stock_reservation_status" AS ENUM('active', 'fulfilled', 'released');--> statement-breakpoint
CREATE TYPE "public"."stock_transfer_status" AS ENUM('draft', 'dispatched', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('central_warehouse', 'regional_depot', 'project_site_store');--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_on_hand" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"quantity_reserved" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"last_movement_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_quantity_on_hand_nonnegative" CHECK ("stock_balances"."quantity_on_hand" >= 0),
	CONSTRAINT "stock_balances_quantity_reserved_valid" CHECK ("stock_balances"."quantity_reserved" >= 0 and "stock_balances"."quantity_reserved" <= "stock_balances"."quantity_on_hand"),
	CONSTRAINT "stock_balances_row_version_positive" CHECK ("stock_balances"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stock_document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_rate" numeric(18, 2),
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_document_lines_number_positive" CHECK ("stock_document_lines"."line_number" > 0),
	CONSTRAINT "stock_document_lines_quantity_positive" CHECK ("stock_document_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"document_type" "stock_document_type" NOT NULL,
	"status" "stock_document_status" DEFAULT 'draft' NOT NULL,
	"source_warehouse_id" uuid,
	"destination_warehouse_id" uuid,
	"project_id" uuid,
	"reference_number" varchar(100),
	"document_date" date NOT NULL,
	"notes" varchar(2000),
	"posted_at" timestamp with time zone,
	"posted_by_user_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_documents_row_version_positive" CHECK ("stock_documents"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entry_number" varchar(50) NOT NULL,
	"posting_date" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" "stock_ledger_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"source_reference" varchar(120) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"direction" "stock_ledger_direction" NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"balance_before" numeric(18, 4) NOT NULL,
	"balance_after" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 2),
	"notes" varchar(1000),
	"posted_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_ledger_entries_quantity_positive" CHECK ("stock_ledger_entries"."quantity" > 0),
	CONSTRAINT "stock_ledger_entries_balances_valid" CHECK (
    ("stock_ledger_entries"."direction" = 'in' and "stock_ledger_entries"."balance_after" = "stock_ledger_entries"."balance_before" + "stock_ledger_entries"."quantity") or
    ("stock_ledger_entries"."direction" = 'out' and "stock_ledger_entries"."balance_after" = "stock_ledger_entries"."balance_before" - "stock_ledger_entries"."quantity")
  )
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_locations_code_not_empty" CHECK (length(trim("stock_locations"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"reservation_number" varchar(50) NOT NULL,
	"project_id" uuid NOT NULL,
	"boq_line_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_reserved" numeric(18, 4) NOT NULL,
	"quantity_issued" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"status" "stock_reservation_status" DEFAULT 'active' NOT NULL,
	"reserved_by_user_id" uuid NOT NULL,
	"notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservations_quantities_valid" CHECK ("stock_reservations"."quantity_reserved" > 0 and "stock_reservations"."quantity_issued" >= 0 and "stock_reservations"."quantity_issued" <= "stock_reservations"."quantity_reserved"),
	CONSTRAINT "stock_reservations_row_version_positive" CHECK ("stock_reservations"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"dispatched_quantity" numeric(18, 4) NOT NULL,
	"received_quantity" numeric(18, 4) DEFAULT '0.0000' NOT NULL,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_transfer_lines_number_positive" CHECK ("stock_transfer_lines"."line_number" > 0),
	CONSTRAINT "stock_transfer_lines_dispatched_positive" CHECK ("stock_transfer_lines"."dispatched_quantity" > 0),
	CONSTRAINT "stock_transfer_lines_received_valid" CHECK ("stock_transfer_lines"."received_quantity" >= 0 and "stock_transfer_lines"."received_quantity" <= "stock_transfer_lines"."dispatched_quantity")
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transfer_number" varchar(50) NOT NULL,
	"status" "stock_transfer_status" DEFAULT 'draft' NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"project_id" uuid,
	"challan_number" varchar(100),
	"vehicle_number" varchar(50),
	"transporter_name" varchar(160),
	"dispatched_at" timestamp with time zone,
	"dispatched_by_user_id" uuid,
	"received_at" timestamp with time zone,
	"received_by_user_id" uuid,
	"notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_transfers_warehouses_distinct" CHECK ("stock_transfers"."source_warehouse_id" <> "stock_transfers"."destination_warehouse_id"),
	CONSTRAINT "stock_transfers_row_version_positive" CHECK ("stock_transfers"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"warehouse_type" "warehouse_type" DEFAULT 'central_warehouse' NOT NULL,
	"project_id" uuid,
	"address_line1" varchar(255) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"postal_code" varchar(20),
	"in_charge_user_id" uuid,
	"is_active" integer DEFAULT 1 NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_code_not_empty" CHECK (length(trim("warehouses"."code")) > 0),
	CONSTRAINT "warehouses_name_not_empty" CHECK (length(trim("warehouses"."name")) > 0),
	CONSTRAINT "warehouses_row_version_positive" CHECK ("warehouses"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_stock_document_id_stock_documents_id_fk" FOREIGN KEY ("stock_document_id") REFERENCES "public"."stock_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_boq_line_id_boq_lines_id_fk" FOREIGN KEY ("boq_line_id") REFERENCES "public"."boq_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_reserved_by_user_id_users_id_fk" FOREIGN KEY ("reserved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dispatched_by_user_id_users_id_fk" FOREIGN KEY ("dispatched_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_in_charge_user_id_users_id_fk" FOREIGN KEY ("in_charge_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_balances_warehouse_item_uidx" ON "stock_balances" USING btree ("warehouse_id","item_id");--> statement-breakpoint
CREATE INDEX "stock_balances_company_item_idx" ON "stock_balances" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_document_lines_doc_line_uidx" ON "stock_document_lines" USING btree ("stock_document_id","line_number");--> statement-breakpoint
CREATE INDEX "stock_document_lines_item_idx" ON "stock_document_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_documents_company_number_uidx" ON "stock_documents" USING btree ("company_id","document_number");--> statement-breakpoint
CREATE INDEX "stock_documents_company_type_status_idx" ON "stock_documents" USING btree ("company_id","document_type","status");--> statement-breakpoint
CREATE INDEX "stock_documents_project_idx" ON "stock_documents" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_ledger_entries_company_number_uidx" ON "stock_ledger_entries" USING btree ("company_id","entry_number");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_ledger_entries_unique_source_posting_uidx" ON "stock_ledger_entries" USING btree ("company_id","source_type","source_id","warehouse_id","direction");--> statement-breakpoint
CREATE INDEX "stock_ledger_entries_warehouse_item_idx" ON "stock_ledger_entries" USING btree ("warehouse_id","item_id","posting_date");--> statement-breakpoint
CREATE INDEX "stock_ledger_entries_source_idx" ON "stock_ledger_entries" USING btree ("company_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_locations_warehouse_code_uidx" ON "stock_locations" USING btree ("warehouse_id","code");--> statement-breakpoint
CREATE INDEX "stock_locations_company_warehouse_idx" ON "stock_locations" USING btree ("company_id","warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_reservations_company_number_uidx" ON "stock_reservations" USING btree ("company_id","reservation_number");--> statement-breakpoint
CREATE INDEX "stock_reservations_project_status_idx" ON "stock_reservations" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "stock_reservations_warehouse_item_idx" ON "stock_reservations" USING btree ("warehouse_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfer_lines_transfer_line_uidx" ON "stock_transfer_lines" USING btree ("transfer_id","line_number");--> statement-breakpoint
CREATE INDEX "stock_transfer_lines_item_idx" ON "stock_transfer_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_company_number_uidx" ON "stock_transfers" USING btree ("company_id","transfer_number");--> statement-breakpoint
CREATE INDEX "stock_transfers_company_status_idx" ON "stock_transfers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "stock_transfers_warehouses_idx" ON "stock_transfers" USING btree ("company_id","source_warehouse_id","destination_warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_company_code_uidx" ON "warehouses" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "warehouses_company_type_idx" ON "warehouses" USING btree ("company_id","warehouse_type","is_active");--> statement-breakpoint
CREATE INDEX "warehouses_company_project_idx" ON "warehouses" USING btree ("company_id","project_id");