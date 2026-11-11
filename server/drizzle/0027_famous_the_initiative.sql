CREATE TABLE "daily_progress_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"report_number" varchar(50) NOT NULL,
	"report_date" date NOT NULL,
	"site_engineer_user_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"current_revision_number" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"review_notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_progress_reports_status_valid" CHECK ("daily_progress_reports"."status" in ('draft', 'submitted', 'approved', 'returned')),
	CONSTRAINT "daily_progress_reports_revision_positive" CHECK ("daily_progress_reports"."current_revision_number" > 0),
	CONSTRAINT "daily_progress_reports_row_version_positive" CHECK ("daily_progress_reports"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "daily_report_material_consumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"daily_report_revision_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_consumed" numeric(14, 4) NOT NULL,
	"notes" varchar(500),
	"stock_ledger_entry_id" uuid,
	"unique_consumption_key" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_report_material_consumption_qty_positive" CHECK ("daily_report_material_consumption"."quantity_consumed" > 0)
);
--> statement-breakpoint
CREATE TABLE "daily_report_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"daily_report_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"weather_condition" varchar(50) DEFAULT 'clear' NOT NULL,
	"work_summary" varchar(2000) NOT NULL,
	"obstacles_encountered" varchar(1000),
	"corrective_actions" varchar(1000),
	"general_notes" varchar(1000),
	"manpower_count" integer DEFAULT 0 NOT NULL,
	"manpower_details" jsonb DEFAULT '[]' NOT NULL,
	"equipment_details" jsonb DEFAULT '[]' NOT NULL,
	"site_photos" jsonb DEFAULT '[]' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_report_revisions_manpower_non_negative" CHECK ("daily_report_revisions"."manpower_count" >= 0),
	CONSTRAINT "daily_report_revisions_revision_positive" CHECK ("daily_report_revisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "daily_report_task_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"daily_report_revision_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"work_completed_today" varchar(500) NOT NULL,
	"progress_percentage" integer NOT NULL,
	"quantity_completed_today" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"unit_symbol" varchar(20),
	"notes" varchar(500),
	CONSTRAINT "daily_report_task_progress_pct_valid" CHECK ("daily_report_task_progress"."progress_percentage" >= 0 and "daily_report_task_progress"."progress_percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "project_delays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"delay_number" varchar(50) NOT NULL,
	"reason_category" varchar(40) NOT NULL,
	"responsible_party" varchar(30) NOT NULL,
	"delay_days" integer NOT NULL,
	"original_target_date" date NOT NULL,
	"revised_target_date" date NOT NULL,
	"impact_description" varchar(1000) NOT NULL,
	"mitigation_plan" varchar(1000) NOT NULL,
	"status" varchar(30) DEFAULT 'reported' NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_delays_status_valid" CHECK ("project_delays"."status" in ('reported', 'under_review', 'approved', 'rejected')),
	CONSTRAINT "project_delays_reason_valid" CHECK ("project_delays"."reason_category" in ('client_delay', 'site_access', 'material_unavailability', 'contractor_delay', 'force_majeure', 'design_clarification', 'other')),
	CONSTRAINT "project_delays_party_valid" CHECK ("project_delays"."responsible_party" in ('customer', 'company', 'vendor', 'third_party')),
	CONSTRAINT "project_delays_days_positive" CHECK ("project_delays"."delay_days" > 0),
	CONSTRAINT "project_delays_dates_valid" CHECK ("project_delays"."revised_target_date" >= "project_delays"."original_target_date"),
	CONSTRAINT "project_delays_row_version_positive" CHECK ("project_delays"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"expense_number" varchar(50) NOT NULL,
	"category" varchar(40) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"description" varchar(1000) NOT NULL,
	"receipt_file_url" varchar(500),
	"status" varchar(30) DEFAULT 'submitted' NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"review_notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_expenses_category_valid" CHECK ("project_expenses"."category" in ('travel', 'transport', 'local_purchase', 'labour_wages', 'permits', 'miscellaneous')),
	CONSTRAINT "project_expenses_status_valid" CHECK ("project_expenses"."status" in ('submitted', 'approved', 'rejected', 'reimbursed')),
	CONSTRAINT "project_expenses_amount_positive" CHECK ("project_expenses"."amount" > 0),
	CONSTRAINT "project_expenses_row_version_positive" CHECK ("project_expenses"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_number" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"target_date" date NOT NULL,
	"actual_date" date,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"billing_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"order_index" integer DEFAULT 1 NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_milestones_status_valid" CHECK ("project_milestones"."status" in ('pending', 'in_progress', 'completed', 'delayed')),
	CONSTRAINT "project_milestones_billing_pct_valid" CHECK ("project_milestones"."billing_percentage" >= 0 and "project_milestones"."billing_percentage" <= 100),
	CONSTRAINT "project_milestones_row_version_positive" CHECK ("project_milestones"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"task_number" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(1000),
	"assigned_user_id" uuid,
	"planned_start_date" date NOT NULL,
	"planned_end_date" date NOT NULL,
	"actual_start_date" date,
	"actual_end_date" date,
	"status" varchar(30) DEFAULT 'not_started' NOT NULL,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"weightage" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"planned_quantity" numeric(14, 4),
	"actual_quantity" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"unit_symbol" varchar(20),
	"blocked_reason" varchar(500),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tasks_status_valid" CHECK ("project_tasks"."status" in ('not_started', 'in_progress', 'completed', 'blocked')),
	CONSTRAINT "project_tasks_progress_pct_valid" CHECK ("project_tasks"."progress_percentage" >= 0 and "project_tasks"."progress_percentage" <= 100),
	CONSTRAINT "project_tasks_weightage_positive" CHECK ("project_tasks"."weightage" > 0),
	CONSTRAINT "project_tasks_dates_valid" CHECK ("project_tasks"."planned_end_date" >= "project_tasks"."planned_start_date"),
	CONSTRAINT "project_tasks_row_version_positive" CHECK ("project_tasks"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_variations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"variation_number" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(1000) NOT NULL,
	"reason_category" varchar(40) NOT NULL,
	"scope_delta_summary" varchar(2000) NOT NULL,
	"schedule_impact_days" integer DEFAULT 0 NOT NULL,
	"cost_impact_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"initiator_user_id" uuid NOT NULL,
	"design_review_notes" varchar(1000),
	"design_reviewed_by_user_id" uuid,
	"design_reviewed_at" timestamp with time zone,
	"customer_evidence_snapshot" varchar(1000),
	"customer_approved_at" timestamp with time zone,
	"revised_boq_revision_id" uuid,
	"revised_design_revision_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_variations_status_valid" CHECK ("project_variations"."status" in ('draft', 'under_review', 'approved_internal', 'submitted_to_customer', 'customer_approved', 'rejected', 'superseded')),
	CONSTRAINT "project_variations_reason_valid" CHECK ("project_variations"."reason_category" in ('customer_request', 'site_condition', 'regulatory_compliance', 'design_optimization', 'error_omission', 'other')),
	CONSTRAINT "project_variations_row_version_positive" CHECK ("project_variations"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "daily_progress_reports" ADD CONSTRAINT "daily_progress_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_reports" ADD CONSTRAINT "daily_progress_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_reports" ADD CONSTRAINT "daily_progress_reports_site_engineer_user_id_users_id_fk" FOREIGN KEY ("site_engineer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_reports" ADD CONSTRAINT "daily_progress_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_material_consumption" ADD CONSTRAINT "daily_report_material_consumption_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_material_consumption" ADD CONSTRAINT "daily_report_material_consumption_daily_report_revision_id_daily_report_revisions_id_fk" FOREIGN KEY ("daily_report_revision_id") REFERENCES "public"."daily_report_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_material_consumption" ADD CONSTRAINT "daily_report_material_consumption_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_material_consumption" ADD CONSTRAINT "daily_report_material_consumption_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_material_consumption" ADD CONSTRAINT "daily_report_material_consumption_stock_ledger_entry_id_stock_ledger_entries_id_fk" FOREIGN KEY ("stock_ledger_entry_id") REFERENCES "public"."stock_ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_revisions" ADD CONSTRAINT "daily_report_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_revisions" ADD CONSTRAINT "daily_report_revisions_daily_report_id_daily_progress_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_progress_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_revisions" ADD CONSTRAINT "daily_report_revisions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_task_progress" ADD CONSTRAINT "daily_report_task_progress_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_task_progress" ADD CONSTRAINT "daily_report_task_progress_daily_report_revision_id_daily_report_revisions_id_fk" FOREIGN KEY ("daily_report_revision_id") REFERENCES "public"."daily_report_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_task_progress" ADD CONSTRAINT "daily_report_task_progress_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_delays" ADD CONSTRAINT "project_delays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_delays" ADD CONSTRAINT "project_delays_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_delays" ADD CONSTRAINT "project_delays_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_delays" ADD CONSTRAINT "project_delays_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_delays" ADD CONSTRAINT "project_delays_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_variations" ADD CONSTRAINT "project_variations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_variations" ADD CONSTRAINT "project_variations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_variations" ADD CONSTRAINT "project_variations_initiator_user_id_users_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_variations" ADD CONSTRAINT "project_variations_design_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("design_reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_variations" ADD CONSTRAINT "project_variations_revised_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("revised_boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_variations" ADD CONSTRAINT "project_variations_revised_design_revision_id_design_package_revisions_id_fk" FOREIGN KEY ("revised_design_revision_id") REFERENCES "public"."design_package_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_progress_reports_number_uidx" ON "daily_progress_reports" USING btree ("company_id","report_number");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_progress_reports_project_date_uidx" ON "daily_progress_reports" USING btree ("company_id","project_id","report_date");--> statement-breakpoint
CREATE INDEX "daily_progress_reports_project_status_idx" ON "daily_progress_reports" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_report_material_consumption_key_uidx" ON "daily_report_material_consumption" USING btree ("company_id","unique_consumption_key");--> statement-breakpoint
CREATE INDEX "daily_report_material_consumption_project_item_idx" ON "daily_report_material_consumption" USING btree ("company_id","project_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_report_revisions_report_rev_uidx" ON "daily_report_revisions" USING btree ("daily_report_id","revision_number");--> statement-breakpoint
CREATE INDEX "daily_report_revisions_company_idx" ON "daily_report_revisions" USING btree ("company_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_report_task_progress_uidx" ON "daily_report_task_progress" USING btree ("daily_report_revision_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_delays_number_uidx" ON "project_delays" USING btree ("company_id","delay_number");--> statement-breakpoint
CREATE INDEX "project_delays_project_status_idx" ON "project_delays" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_expenses_number_uidx" ON "project_expenses" USING btree ("company_id","expense_number");--> statement-breakpoint
CREATE INDEX "project_expenses_project_status_idx" ON "project_expenses" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_milestones_number_uidx" ON "project_milestones" USING btree ("company_id","project_id","milestone_number");--> statement-breakpoint
CREATE INDEX "project_milestones_project_status_idx" ON "project_milestones" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_tasks_number_uidx" ON "project_tasks" USING btree ("company_id","project_id","task_number");--> statement-breakpoint
CREATE INDEX "project_tasks_assigned_status_idx" ON "project_tasks" USING btree ("company_id","assigned_user_id","status");--> statement-breakpoint
CREATE INDEX "project_tasks_milestone_idx" ON "project_tasks" USING btree ("company_id","milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_variations_number_uidx" ON "project_variations" USING btree ("company_id","variation_number");--> statement-breakpoint
CREATE INDEX "project_variations_project_status_idx" ON "project_variations" USING btree ("company_id","project_id","status");