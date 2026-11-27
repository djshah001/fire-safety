ALTER TYPE "public"."design_customer_decision" ADD VALUE 'abandoned';--> statement-breakpoint
CREATE TABLE "task_reassignment_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" varchar(500) NOT NULL,
	"reassigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_reassignment_logs_entity_type_valid" CHECK ("task_reassignment_logs"."entity_type" in ('lead', 'reminder', 'design_job_head', 'design_job_engineer', 'boq_review')),
	CONSTRAINT "task_reassignment_logs_users_distinct" CHECK ("task_reassignment_logs"."from_user_id" <> "task_reassignment_logs"."to_user_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_name" varchar(64) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_attachments_size_positive" CHECK ("opportunity_attachments"."size_bytes" > 0 and "opportunity_attachments"."size_bytes" <= 20971520)
);
--> statement-breakpoint
ALTER TABLE "design_jobs" DROP CONSTRAINT "design_jobs_status_valid";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_on_leave" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leave_start_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leave_end_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "covering_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leave_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "previous_stage" "lead_stage";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "previous_commercial_state" "opportunity_commercial_state";--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "previous_status" varchar(40);--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "closed_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_reassignment_logs" ADD CONSTRAINT "task_reassignment_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reassignment_logs" ADD CONSTRAINT "task_reassignment_logs_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reassignment_logs" ADD CONSTRAINT "task_reassignment_logs_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reassignment_logs" ADD CONSTRAINT "task_reassignment_logs_reassigned_by_user_id_users_id_fk" FOREIGN KEY ("reassigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_reassignment_logs_from_idx" ON "task_reassignment_logs" USING btree ("company_id","from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "task_reassignment_logs_entity_idx" ON "task_reassignment_logs" USING btree ("company_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_attachments_storage_name_uidx" ON "opportunity_attachments" USING btree ("storage_name");--> statement-breakpoint
CREATE INDEX "opportunity_attachments_opportunity_created_idx" ON "opportunity_attachments" USING btree ("company_id","opportunity_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_covering_employee_id_users_id_fk" FOREIGN KEY ("covering_employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_status_valid" CHECK ("design_jobs"."status" in ('awaiting_designer', 'authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested', 'paused', 'cancelled', 'abandoned'));