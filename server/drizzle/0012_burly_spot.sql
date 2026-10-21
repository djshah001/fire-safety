CREATE TYPE "public"."notification_severity" AS ENUM('info', 'success', 'warning');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" varchar(80) NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"title" varchar(160) NOT NULL,
	"message" varchar(500) NOT NULL,
	"link" varchar(500),
	"target_type" varchar(80),
	"target_id" uuid,
	"dedup_key" varchar(180) NOT NULL,
	"read_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_row_version_positive" CHECK ("notifications"."row_version" > 0),
	CONSTRAINT "notifications_target_consistent" CHECK (("notifications"."target_type" is null) = ("notifications"."target_id" is null))
);
--> statement-breakpoint
CREATE TABLE "design_deadline_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_job_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"previous_due_at" timestamp with time zone NOT NULL,
	"new_due_at" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_deadline_extensions_sequence_valid" CHECK ("design_deadline_extensions"."sequence_number" between 1 and 3),
	CONSTRAINT "design_deadline_extensions_duration_valid" CHECK ("design_deadline_extensions"."new_due_at" = "design_deadline_extensions"."previous_due_at" + interval '3 days'),
	CONSTRAINT "design_deadline_extensions_reason_required" CHECK (length(trim("design_deadline_extensions"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "designer_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "design_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "buffer_extensions_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "designer_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "design_jobs" AS job
SET "designer_assigned_at" = job."authorized_at",
	"design_due_at" = job."authorized_at" + interval '2 days',
	"designer_completed_at" = submitted."completed_at"
FROM (
	SELECT "design_job_id", greatest(min("submitted_at"), min(job_authorized."authorized_at")) AS "completed_at"
	FROM "design_package_revisions"
	JOIN "design_jobs" AS job_authorized ON job_authorized."id" = "design_package_revisions"."design_job_id"
	WHERE "submitted_at" IS NOT NULL
	GROUP BY "design_job_id"
) AS submitted
WHERE job."id" = submitted."design_job_id" AND job."designer_user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "design_jobs"
SET "designer_assigned_at" = "authorized_at",
	"design_due_at" = "authorized_at" + interval '2 days'
WHERE "designer_user_id" IS NOT NULL AND "designer_assigned_at" IS NULL;--> statement-breakpoint
INSERT INTO "outbox_jobs" ("company_id", "type", "payload", "dedup_key", "due_at")
SELECT "company_id", 'engineering.design_deadline',
	jsonb_build_object('jobId', "id"::text, 'dueAt', "design_due_at"),
	'design-deadline:' || "id"::text || ':' || extract(epoch from "design_due_at")::bigint,
	"design_due_at"
FROM "design_jobs"
WHERE "designer_user_id" IS NOT NULL AND "designer_completed_at" IS NULL
ON CONFLICT ("company_id", "type", "dedup_key") DO NOTHING;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_deadline_extensions" ADD CONSTRAINT "design_deadline_extensions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_deadline_extensions" ADD CONSTRAINT "design_deadline_extensions_design_job_id_design_jobs_id_fk" FOREIGN KEY ("design_job_id") REFERENCES "public"."design_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_deadline_extensions" ADD CONSTRAINT "design_deadline_extensions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_recipient_dedup_uidx" ON "notifications" USING btree ("company_id","recipient_user_id","dedup_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("company_id","recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("company_id","recipient_user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "design_deadline_extensions_job_sequence_uidx" ON "design_deadline_extensions" USING btree ("design_job_id","sequence_number");--> statement-breakpoint
CREATE INDEX "design_deadline_extensions_company_job_idx" ON "design_deadline_extensions" USING btree ("company_id","design_job_id","created_at");--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_buffer_extensions_valid" CHECK ("design_jobs"."buffer_extensions_used" between 0 and 3);--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_deadline_consistent" CHECK (("design_jobs"."designer_user_id" is null and "design_jobs"."designer_assigned_at" is null and "design_jobs"."design_due_at" is null and "design_jobs"."buffer_extensions_used" = 0 and "design_jobs"."designer_completed_at" is null) or ("design_jobs"."designer_user_id" is not null and "design_jobs"."designer_assigned_at" is not null and "design_jobs"."design_due_at" is not null and "design_jobs"."design_due_at" > "design_jobs"."designer_assigned_at" and ("design_jobs"."designer_completed_at" is null or "design_jobs"."designer_completed_at" >= "design_jobs"."designer_assigned_at")));
