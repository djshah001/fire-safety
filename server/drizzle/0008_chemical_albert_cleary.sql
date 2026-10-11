CREATE TYPE "public"."design_customer_decision" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."design_file_kind" AS ENUM('cad', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."design_review_decision" AS ENUM('approved', 'returned');--> statement-breakpoint
CREATE TYPE "public"."design_revision_status" AS ENUM('draft', 'submitted', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested');--> statement-breakpoint
CREATE TABLE "design_customer_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"decision" "design_customer_decision" NOT NULL,
	"evidence_reference" varchar(1000) NOT NULL,
	"notes" varchar(1000),
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_customer_evidence_required" CHECK (length(trim("design_customer_decisions"."evidence_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "design_package_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_job_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"change_summary" varchar(1000) NOT NULL,
	"status" "design_revision_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_revisions_number_positive" CHECK ("design_package_revisions"."revision_number" > 0),
	CONSTRAINT "design_revisions_row_version_positive" CHECK ("design_package_revisions"."row_version" > 0),
	CONSTRAINT "design_revisions_submission_consistent" CHECK (("design_package_revisions"."status" = 'draft' and "design_package_revisions"."submitted_at" is null and "design_package_revisions"."submitted_by_user_id" is null) or ("design_package_revisions"."status" <> 'draft' and "design_package_revisions"."submitted_at" is not null and "design_package_revisions"."submitted_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "design_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"decision" "design_review_decision" NOT NULL,
	"reason" varchar(1000),
	"actor_user_id" uuid NOT NULL,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_review_reason_required" CHECK ("design_review_actions"."decision" = 'approved' or ("design_review_actions"."reason" is not null and length(trim("design_review_actions"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "design_revision_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"kind" "design_file_kind" NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_name" varchar(80) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_revision_files_size_positive" CHECK ("design_revision_files"."size_bytes" > 0),
	CONSTRAINT "design_revision_files_size_limit" CHECK (("design_revision_files"."kind" = 'cad' and "design_revision_files"."size_bytes" <= 104857600) or ("design_revision_files"."kind" = 'pdf' and "design_revision_files"."size_bytes" <= 20971520))
);
--> statement-breakpoint
ALTER TABLE "design_jobs" DROP CONSTRAINT "design_jobs_status_valid";--> statement-breakpoint
ALTER TABLE "design_customer_decisions" ADD CONSTRAINT "design_customer_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_customer_decisions" ADD CONSTRAINT "design_customer_decisions_revision_id_design_package_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_package_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_customer_decisions" ADD CONSTRAINT "design_customer_decisions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_package_revisions" ADD CONSTRAINT "design_package_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_package_revisions" ADD CONSTRAINT "design_package_revisions_design_job_id_design_jobs_id_fk" FOREIGN KEY ("design_job_id") REFERENCES "public"."design_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_package_revisions" ADD CONSTRAINT "design_package_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_package_revisions" ADD CONSTRAINT "design_package_revisions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_review_actions" ADD CONSTRAINT "design_review_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_review_actions" ADD CONSTRAINT "design_review_actions_revision_id_design_package_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_package_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_review_actions" ADD CONSTRAINT "design_review_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_revision_files" ADD CONSTRAINT "design_revision_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_revision_files" ADD CONSTRAINT "design_revision_files_revision_id_design_package_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_package_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_revision_files" ADD CONSTRAINT "design_revision_files_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "design_customer_decisions_revision_uidx" ON "design_customer_decisions" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "design_customer_decisions_company_idx" ON "design_customer_decisions" USING btree ("company_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "design_revisions_job_number_uidx" ON "design_package_revisions" USING btree ("design_job_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "design_revisions_one_draft_uidx" ON "design_package_revisions" USING btree ("design_job_id") WHERE "design_package_revisions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "design_revisions_company_job_idx" ON "design_package_revisions" USING btree ("company_id","design_job_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "design_review_actions_revision_uidx" ON "design_review_actions" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "design_review_actions_company_idx" ON "design_review_actions" USING btree ("company_id","acted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "design_revision_files_storage_uidx" ON "design_revision_files" USING btree ("storage_name");--> statement-breakpoint
CREATE INDEX "design_revision_files_revision_idx" ON "design_revision_files" USING btree ("company_id","revision_id","kind");--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_status_valid" CHECK ("design_jobs"."status" in ('authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested'));--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('engineering.design.customer_decision', 'Record customer decisions and evidence for design jobs linked to assigned CRM work.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'engineering.design.customer_decision' FROM "roles" WHERE "code" IN ('sales_executive', 'sales_manager')
ON CONFLICT DO NOTHING;
