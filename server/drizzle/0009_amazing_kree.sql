CREATE TYPE "public"."boq_revision_status" AS ENUM('draft', 'submitted', 'returned', 'approved');--> statement-breakpoint
CREATE TYPE "public"."estimate_cost_category" AS ENUM('material', 'labour', 'transport', 'subcontracting', 'overhead', 'wastage', 'margin');--> statement-breakpoint
CREATE TABLE "boq_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"boq_revision_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"section" varchar(120) NOT NULL,
	"item_id" uuid NOT NULL,
	"item_code_snapshot" varchar(50) NOT NULL,
	"item_name_snapshot" varchar(160) NOT NULL,
	"specification_snapshot" varchar(2000) NOT NULL,
	"brand" varchar(120),
	"model" varchar(120),
	"unit_id" uuid NOT NULL,
	"unit_symbol_snapshot" varchar(20) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"drawing_reference" varchar(200),
	"notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_lines_number_positive" CHECK ("boq_lines"."line_number" > 0),
	CONSTRAINT "boq_lines_quantity_positive" CHECK ("boq_lines"."quantity" > 0),
	CONSTRAINT "boq_lines_row_version_positive" CHECK ("boq_lines"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "boq_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"boq_revision_id" uuid NOT NULL,
	"decision" "design_review_decision" NOT NULL,
	"reason" varchar(1000),
	"actor_user_id" uuid NOT NULL,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_review_reason_required" CHECK ("boq_review_actions"."decision" = 'approved' or ("boq_review_actions"."reason" is not null and length(trim("boq_review_actions"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "boq_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_job_id" uuid NOT NULL,
	"design_revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"change_summary" varchar(1000) NOT NULL,
	"status" "boq_revision_status" DEFAULT 'draft' NOT NULL,
	"estimate_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_revisions_number_positive" CHECK ("boq_revisions"."revision_number" > 0),
	CONSTRAINT "boq_revisions_row_version_positive" CHECK ("boq_revisions"."row_version" > 0),
	CONSTRAINT "boq_revisions_currency_valid" CHECK ("boq_revisions"."estimate_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "boq_revisions_submission_consistent" CHECK (("boq_revisions"."status" = 'draft' and "boq_revisions"."submitted_at" is null and "boq_revisions"."submitted_by_user_id" is null) or ("boq_revisions"."status" <> 'draft' and "boq_revisions"."submitted_at" is not null and "boq_revisions"."submitted_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "estimate_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"boq_revision_id" uuid NOT NULL,
	"boq_line_id" uuid,
	"line_number" integer NOT NULL,
	"category" "estimate_cost_category" NOT NULL,
	"description" varchar(300) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_rate" numeric(18, 2) NOT NULL,
	"line_total" numeric(20, 2) NOT NULL,
	"notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estimate_lines_number_positive" CHECK ("estimate_cost_lines"."line_number" > 0),
	CONSTRAINT "estimate_lines_quantity_positive" CHECK ("estimate_cost_lines"."quantity" > 0),
	CONSTRAINT "estimate_lines_rate_nonnegative" CHECK ("estimate_cost_lines"."unit_rate" >= 0),
	CONSTRAINT "estimate_lines_total_nonnegative" CHECK ("estimate_cost_lines"."line_total" >= 0),
	CONSTRAINT "estimate_lines_row_version_positive" CHECK ("estimate_cost_lines"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "boq_lines" ADD CONSTRAINT "boq_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_lines" ADD CONSTRAINT "boq_lines_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_lines" ADD CONSTRAINT "boq_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_lines" ADD CONSTRAINT "boq_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_review_actions" ADD CONSTRAINT "boq_review_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_review_actions" ADD CONSTRAINT "boq_review_actions_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_review_actions" ADD CONSTRAINT "boq_review_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_design_job_id_design_jobs_id_fk" FOREIGN KEY ("design_job_id") REFERENCES "public"."design_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_design_revision_id_design_package_revisions_id_fk" FOREIGN KEY ("design_revision_id") REFERENCES "public"."design_package_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_boq_line_id_boq_lines_id_fk" FOREIGN KEY ("boq_line_id") REFERENCES "public"."boq_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boq_lines_revision_number_uidx" ON "boq_lines" USING btree ("boq_revision_id","line_number");--> statement-breakpoint
CREATE INDEX "boq_lines_item_idx" ON "boq_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_review_actions_revision_uidx" ON "boq_review_actions" USING btree ("boq_revision_id");--> statement-breakpoint
CREATE INDEX "boq_review_actions_company_idx" ON "boq_review_actions" USING btree ("company_id","acted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_revisions_job_number_uidx" ON "boq_revisions" USING btree ("design_job_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_revisions_one_draft_uidx" ON "boq_revisions" USING btree ("design_job_id") WHERE "boq_revisions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "boq_revisions_design_idx" ON "boq_revisions" USING btree ("company_id","design_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_lines_revision_number_uidx" ON "estimate_cost_lines" USING btree ("boq_revision_id","line_number");--> statement-breakpoint
CREATE INDEX "estimate_lines_boq_line_idx" ON "estimate_cost_lines" USING btree ("company_id","boq_line_id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('engineering.estimate.read', 'View internal cost estimates for assigned engineering work.'),
	('engineering.estimate.write', 'Prepare internal cost estimates for assigned engineering work.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'engineering.estimate.read' FROM "roles" WHERE "code" IN ('design_engineer', 'design_head', 'sales_manager')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'engineering.estimate.write' FROM "roles" WHERE "code" IN ('design_engineer', 'design_head')
ON CONFLICT DO NOTHING;
