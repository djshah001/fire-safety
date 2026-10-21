CREATE TABLE "project_commercial_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"quotation_revision_id" uuid NOT NULL,
	"quotation_customer_decision_id" uuid NOT NULL,
	"customer_evidence_snapshot" varchar(1000) NOT NULL,
	"customer_order_reference" varchar(500),
	"accepted_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_design_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"design_job_id" uuid NOT NULL,
	"design_revision_id" uuid NOT NULL,
	"design_customer_decision_id" uuid NOT NULL,
	"boq_revision_id" uuid,
	"customer_evidence_snapshot" varchar(1000) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" varchar(30) NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_role_valid" CHECK ("project_members"."role" in ('project_manager', 'sales', 'design', 'purchase', 'member', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_number" varchar(40) NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(30) DEFAULT 'started' NOT NULL,
	"start_date" date NOT NULL,
	"target_completion_date" date NOT NULL,
	"start_reason" varchar(1000) NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_status_valid" CHECK ("projects"."status" in ('started', 'on_hold', 'completed', 'cancelled')),
	CONSTRAINT "projects_dates_valid" CHECK ("projects"."target_completion_date" >= "projects"."start_date"),
	CONSTRAINT "projects_start_reason_required" CHECK (length(trim("projects"."start_reason")) > 0),
	CONSTRAINT "projects_row_version_positive" CHECK ("projects"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_commercial_baselines" ADD CONSTRAINT "project_commercial_baselines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_baselines" ADD CONSTRAINT "project_commercial_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_baselines" ADD CONSTRAINT "project_commercial_baselines_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_baselines" ADD CONSTRAINT "project_commercial_baselines_quotation_customer_decision_id_quotation_customer_decisions_id_fk" FOREIGN KEY ("quotation_customer_decision_id") REFERENCES "public"."quotation_customer_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_baselines" ADD CONSTRAINT "project_commercial_baselines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_design_job_id_design_jobs_id_fk" FOREIGN KEY ("design_job_id") REFERENCES "public"."design_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_design_revision_id_design_package_revisions_id_fk" FOREIGN KEY ("design_revision_id") REFERENCES "public"."design_package_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_design_customer_decision_id_design_customer_decisions_id_fk" FOREIGN KEY ("design_customer_decision_id") REFERENCES "public"."design_customer_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_baselines" ADD CONSTRAINT "project_design_baselines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_commercial_baselines_project_uidx" ON "project_commercial_baselines" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_commercial_baselines_quotation_uidx" ON "project_commercial_baselines" USING btree ("quotation_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_design_baselines_project_uidx" ON "project_design_baselines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_design_baselines_revision_idx" ON "project_design_baselines" USING btree ("company_id","design_revision_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("company_id","user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_company_number_uidx" ON "projects" USING btree ("company_id","project_number");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_company_opportunity_uidx" ON "projects" USING btree ("company_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "projects_company_status_idx" ON "projects" USING btree ("company_id","status","target_completion_date");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('project.read', 'View projects where the employee is an explicit project member.'),
	('project.start', 'Start one project from an exact customer-approved design in assigned scope.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", grants."permission_code"
FROM "roles"
JOIN (VALUES
	('sales_executive', 'project.read'),
	('sales_manager', 'project.read'),
	('sales_manager', 'project.start'),
	('design_engineer', 'project.read'),
	('design_head', 'project.read'),
	('purchase_executive', 'project.read'),
	('purchase_manager', 'project.read'),
	('receiver', 'project.read'),
	('management', 'project.read'),
	('management', 'project.start'),
	('project_manager', 'project.read')
) AS grants("role_code", "permission_code") ON grants."role_code" = "roles"."code"
ON CONFLICT DO NOTHING;
