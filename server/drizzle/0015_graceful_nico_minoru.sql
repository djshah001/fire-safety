CREATE TYPE "public"."survey_revision_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TABLE "survey_revision_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"survey_revision_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_name" varchar(80) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_revision_files_size_positive" CHECK ("survey_revision_files"."size_bytes" > 0),
	CONSTRAINT "survey_revision_files_size_limit" CHECK ("survey_revision_files"."size_bytes" <= 20971520)
);
--> statement-breakpoint
CREATE TABLE "survey_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_job_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"change_summary" varchar(1000) NOT NULL,
	"surveyed_on" date NOT NULL,
	"status" "survey_revision_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"finalized_by_user_id" uuid,
	"finalized_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_revisions_number_positive" CHECK ("survey_revisions"."revision_number" > 0),
	CONSTRAINT "survey_revisions_row_version_positive" CHECK ("survey_revisions"."row_version" > 0),
	CONSTRAINT "survey_revisions_finalization_consistent" CHECK (("survey_revisions"."status" = 'draft' and "survey_revisions"."finalized_at" is null and "survey_revisions"."finalized_by_user_id" is null) or ("survey_revisions"."status" = 'finalized' and "survey_revisions"."finalized_at" is not null and "survey_revisions"."finalized_by_user_id" is not null)),
	CONSTRAINT "survey_revisions_title_required" CHECK (length(trim("survey_revisions"."title")) > 0),
	CONSTRAINT "survey_revisions_summary_required" CHECK (length(trim("survey_revisions"."change_summary")) > 0)
);
--> statement-breakpoint
ALTER TABLE "survey_revision_files" ADD CONSTRAINT "survey_revision_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revision_files" ADD CONSTRAINT "survey_revision_files_survey_revision_id_survey_revisions_id_fk" FOREIGN KEY ("survey_revision_id") REFERENCES "public"."survey_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revision_files" ADD CONSTRAINT "survey_revision_files_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revisions" ADD CONSTRAINT "survey_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revisions" ADD CONSTRAINT "survey_revisions_design_job_id_design_jobs_id_fk" FOREIGN KEY ("design_job_id") REFERENCES "public"."design_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revisions" ADD CONSTRAINT "survey_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revisions" ADD CONSTRAINT "survey_revisions_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_revision_files_storage_uidx" ON "survey_revision_files" USING btree ("storage_name");--> statement-breakpoint
CREATE INDEX "survey_revision_files_revision_idx" ON "survey_revision_files" USING btree ("company_id","survey_revision_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_revisions_job_number_uidx" ON "survey_revisions" USING btree ("design_job_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_revisions_one_draft_uidx" ON "survey_revisions" USING btree ("design_job_id") WHERE "survey_revisions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "survey_revisions_company_job_idx" ON "survey_revisions" USING btree ("company_id","design_job_id","revision_number");