CREATE TYPE "public"."crm_import_batch_status" AS ENUM('staged', 'committing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."crm_import_row_status" AS ENUM('valid', 'invalid', 'created', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crm_import_type" AS ENUM('customers', 'open_leads');--> statement-breakpoint
CREATE TABLE "crm_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "crm_import_type" NOT NULL,
	"status" "crm_import_batch_status" DEFAULT 'staged' NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_name" varchar(64) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"invalid_rows" integer NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	CONSTRAINT "crm_import_batches_counts_valid" CHECK ("crm_import_batches"."total_rows" >= 0 and "crm_import_batches"."valid_rows" >= 0 and "crm_import_batches"."invalid_rows" >= 0 and "crm_import_batches"."total_rows" = "crm_import_batches"."valid_rows" + "crm_import_batches"."invalid_rows"),
	CONSTRAINT "crm_import_batches_file_size_valid" CHECK ("crm_import_batches"."size_bytes" > 0 and "crm_import_batches"."size_bytes" <= 5242880),
	CONSTRAINT "crm_import_batches_row_version_positive" CHECK ("crm_import_batches"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "crm_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "crm_import_row_status" NOT NULL,
	"created_record_id" uuid,
	"result_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_import_rows_row_number_valid" CHECK ("crm_import_rows"."row_number" >= 2),
	CONSTRAINT "crm_import_rows_result_consistent" CHECK (("crm_import_rows"."status" = 'created' and "crm_import_rows"."created_record_id" is not null) or "crm_import_rows"."status" <> 'created')
);
--> statement-breakpoint
ALTER TABLE "crm_import_batches" ADD CONSTRAINT "crm_import_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_import_batches" ADD CONSTRAINT "crm_import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_import_rows" ADD CONSTRAINT "crm_import_rows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_import_rows" ADD CONSTRAINT "crm_import_rows_batch_id_crm_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."crm_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_import_batches_storage_name_uidx" ON "crm_import_batches" USING btree ("storage_name");--> statement-breakpoint
CREATE INDEX "crm_import_batches_company_created_idx" ON "crm_import_batches" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_import_rows_batch_row_uidx" ON "crm_import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "crm_import_rows_batch_status_idx" ON "crm_import_rows" USING btree ("company_id","batch_id","status");