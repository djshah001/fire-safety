CREATE TABLE "vendor_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"address_type" varchar(50) DEFAULT 'office' NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"postal_code" varchar(20) NOT NULL,
	"country" varchar(100) DEFAULT 'India' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_addresses_address_line1_required" CHECK (length(trim("vendor_addresses"."address_line_1")) > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"account_holder_name" varchar(160) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"ifsc_code" varchar(11) NOT NULL,
	"bank_name" varchar(160) NOT NULL,
	"branch" varchar(160),
	"upi_id" varchar(100),
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_bank_accounts_acc_num_required" CHECK (length(trim("vendor_bank_accounts"."account_number")) > 0),
	CONSTRAINT "vendor_bank_accounts_ifsc_required" CHECK (length(trim("vendor_bank_accounts"."ifsc_code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_name" varchar(255) NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_onboarding_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"whatsapp_number" varchar(30) NOT NULL,
	"whatsapp_number_normalized" varchar(20) NOT NULL,
	"contact_name" varchar(120) NOT NULL,
	"company_name" varchar(160),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"vendor_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"item_id" uuid,
	"vendor_product_code" varchar(100),
	"vendor_product_name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"unit_rate" numeric(18, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"lead_time_days" integer,
	"minimum_order_quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_price_lists_rate_positive" CHECK ("vendor_price_lists"."unit_rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "country" SET DEFAULT 'India';--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD COLUMN "alternate_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "trade_name" varchar(200);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "vendor_type" varchar(50) DEFAULT 'material_supplier' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "supplier_categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "website" varchar(255);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "company_description" varchar(2000);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "gst_status" varchar(20) DEFAULT 'unregistered' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pan" varchar(10);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "brands_supplied" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "delivery_locations" varchar(1000);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "typical_lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "minimum_order_value" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "payment_terms" varchar(500);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "credit_period_days" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "credit_limit" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "preferred_currency" varchar(3) DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "assigned_buyer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "internal_notes" varchar(2000);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "approval_status" varchar(30) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_onboarding_invitations" ADD CONSTRAINT "vendor_onboarding_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_onboarding_invitations" ADD CONSTRAINT "vendor_onboarding_invitations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_onboarding_invitations" ADD CONSTRAINT "vendor_onboarding_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_lists" ADD CONSTRAINT "vendor_price_lists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_lists" ADD CONSTRAINT "vendor_price_lists_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_lists" ADD CONSTRAINT "vendor_price_lists_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_addresses_company_vendor_idx" ON "vendor_addresses" USING btree ("company_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_bank_accounts_company_vendor_idx" ON "vendor_bank_accounts" USING btree ("company_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_documents_company_vendor_idx" ON "vendor_documents" USING btree ("company_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_onboarding_invitations_token_uidx" ON "vendor_onboarding_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "vendor_onboarding_invitations_company_phone_idx" ON "vendor_onboarding_invitations" USING btree ("company_id","whatsapp_number_normalized");--> statement-breakpoint
CREATE INDEX "vendor_price_lists_company_vendor_idx" ON "vendor_price_lists" USING btree ("company_id","vendor_id");--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_assigned_buyer_user_id_users_id_fk" FOREIGN KEY ("assigned_buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_company_gstin_uidx" ON "vendors" USING btree ("company_id","gstin") WHERE "vendors"."gstin" is not null and "vendors"."gstin" <> '';--> statement-breakpoint
CREATE INDEX "vendors_company_approval_idx" ON "vendors" USING btree ("company_id","approval_status");--> statement-breakpoint
CREATE INDEX "vendors_company_archived_idx" ON "vendors" USING btree ("company_id","is_archived");