CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_normalized" varchar(120) NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_row_version_positive" CHECK ("brands"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_brands" (
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_brands_pk" PRIMARY KEY("item_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "customer_type" varchar(30) DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "pan" varchar(10);--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "brand_name_snapshot" varchar(120);--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_company_code_uidx" ON "brands" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_company_name_uidx" ON "brands" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "brands_company_status_idx" ON "brands" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "item_brands_company_brand_idx" ON "item_brands" USING btree ("company_id","brand_id");--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_company_gstin_uidx" ON "customers" USING btree ("company_id","gstin") WHERE "customers"."gstin" is not null;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_type_valid" CHECK ("customers"."customer_type" in ('business', 'individual', 'government', 'other'));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_gstin_valid" CHECK ("customers"."gstin" is null or "customers"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_pan_valid" CHECK ("customers"."pan" is null or "customers"."pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_brand_consistent" CHECK (("quotation_lines"."brand_id" is null and "quotation_lines"."brand_name_snapshot" is null) or ("quotation_lines"."brand_id" is not null and "quotation_lines"."brand_name_snapshot" is not null));