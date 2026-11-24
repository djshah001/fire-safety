CREATE TABLE "project_handover_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'in_progress' NOT NULL,
	"clearance_certificate_number" varchar(100),
	"clearance_certificate_issuer" varchar(200),
	"clearance_certificate_date" date,
	"clearance_certificate_file_url" varchar(500),
	"clearance_certificate_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"noc_number" varchar(100),
	"noc_issuer" varchar(200),
	"noc_date" date,
	"noc_expiry_date" date,
	"noc_file_url" varchar(500),
	"noc_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"completion_document_number" varchar(100),
	"completion_signatory_name" varchar(200),
	"completion_date" date,
	"completion_document_file_url" varchar(500),
	"completion_document_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"operational_completion_date" timestamp with time zone,
	"completed_by_user_id" uuid,
	"completion_notes" varchar(2000),
	"commercial_closure_date" timestamp with time zone,
	"commercial_closure_notes" varchar(2000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_handover_status_valid" CHECK ("project_handover_records"."status" in ('in_progress', 'ready_for_inspection', 'documents_submitted', 'operationally_complete', 'closed')),
	CONSTRAINT "project_handover_clearance_status_valid" CHECK ("project_handover_records"."clearance_certificate_status" in ('pending', 'uploaded', 'accepted', 'rejected')),
	CONSTRAINT "project_handover_noc_status_valid" CHECK ("project_handover_records"."noc_status" in ('pending', 'uploaded', 'accepted', 'rejected')),
	CONSTRAINT "project_handover_comp_doc_status_valid" CHECK ("project_handover_records"."completion_document_status" in ('pending', 'uploaded', 'accepted', 'rejected')),
	CONSTRAINT "project_handover_row_version_positive" CHECK ("project_handover_records"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_punch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"inspection_id" uuid,
	"item_number" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(1000) NOT NULL,
	"location" varchar(200) NOT NULL,
	"severity" varchar(30) DEFAULT 'major' NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" uuid,
	"due_date" date,
	"photo_url" varchar(500),
	"rectified_at" timestamp with time zone,
	"rectification_notes" varchar(1000),
	"rectification_photo_url" varchar(500),
	"closed_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"closure_remarks" varchar(1000),
	"reported_by_user_id" uuid NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_punch_items_severity_valid" CHECK ("project_punch_items"."severity" in ('critical', 'major', 'minor')),
	CONSTRAINT "project_punch_items_status_valid" CHECK ("project_punch_items"."status" in ('open', 'assigned', 'rectified', 'verified_closed', 'cancelled')),
	CONSTRAINT "project_punch_items_row_version_positive" CHECK ("project_punch_items"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "quality_checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" varchar(1000),
	"items" jsonb DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_checklist_templates_category_valid" CHECK ("quality_checklist_templates"."category" in ('hydrant_piping', 'fire_alarm', 'sprinkler_system', 'fire_pump', 'extinguishers', 'general')),
	CONSTRAINT "quality_checklist_templates_row_version_positive" CHECK ("quality_checklist_templates"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"template_id" uuid,
	"inspection_number" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"inspection_date" date NOT NULL,
	"inspector_user_id" uuid NOT NULL,
	"witness_name" varchar(100),
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"results" jsonb DEFAULT '[]' NOT NULL,
	"summary_remarks" varchar(2000),
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_inspections_category_valid" CHECK ("quality_inspections"."category" in ('hydrant_piping', 'fire_alarm', 'sprinkler_system', 'fire_pump', 'extinguishers', 'general')),
	CONSTRAINT "quality_inspections_status_valid" CHECK ("quality_inspections"."status" in ('scheduled', 'in_progress', 'passed', 'failed_with_punch_items', 'rejected')),
	CONSTRAINT "quality_inspections_row_version_positive" CHECK ("quality_inspections"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "quality_test_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"inspection_id" uuid,
	"report_number" varchar(50) NOT NULL,
	"test_type" varchar(50) NOT NULL,
	"test_date" date NOT NULL,
	"test_location" varchar(200) NOT NULL,
	"parameters" jsonb DEFAULT '{}' NOT NULL,
	"conducted_by_user_id" uuid NOT NULL,
	"witnessed_by" varchar(150),
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"certificate_url" varchar(500),
	"remarks" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_test_reports_type_valid" CHECK ("quality_test_reports"."test_type" in ('hydrostatic_pressure', 'flushing', 'smoke_detector_response', 'sounder_db_level', 'insulation_resistance', 'pump_flow_head', 'other')),
	CONSTRAINT "quality_test_reports_status_valid" CHECK ("quality_test_reports"."status" in ('draft', 'verified', 'rejected')),
	CONSTRAINT "quality_test_reports_row_version_positive" CHECK ("quality_test_reports"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_handover_records" ADD CONSTRAINT "project_handover_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover_records" ADD CONSTRAINT "project_handover_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover_records" ADD CONSTRAINT "project_handover_records_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_items" ADD CONSTRAINT "project_punch_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_items" ADD CONSTRAINT "project_punch_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_items" ADD CONSTRAINT "project_punch_items_inspection_id_quality_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_items" ADD CONSTRAINT "project_punch_items_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_items" ADD CONSTRAINT "project_punch_items_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_items" ADD CONSTRAINT "project_punch_items_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checklist_templates" ADD CONSTRAINT "quality_checklist_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_template_id_quality_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quality_checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspector_user_id_users_id_fk" FOREIGN KEY ("inspector_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_test_reports" ADD CONSTRAINT "quality_test_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_test_reports" ADD CONSTRAINT "quality_test_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_test_reports" ADD CONSTRAINT "quality_test_reports_inspection_id_quality_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_test_reports" ADD CONSTRAINT "quality_test_reports_conducted_by_user_id_users_id_fk" FOREIGN KEY ("conducted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_handover_records_project_uidx" ON "project_handover_records" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "project_handover_records_status_idx" ON "project_handover_records" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_punch_items_number_uidx" ON "project_punch_items" USING btree ("company_id","item_number");--> statement-breakpoint
CREATE INDEX "project_punch_items_project_status_idx" ON "project_punch_items" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "project_punch_items_severity_idx" ON "project_punch_items" USING btree ("company_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_checklist_templates_code_uidx" ON "quality_checklist_templates" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "quality_checklist_templates_category_idx" ON "quality_checklist_templates" USING btree ("company_id","category","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_inspections_number_uidx" ON "quality_inspections" USING btree ("company_id","inspection_number");--> statement-breakpoint
CREATE INDEX "quality_inspections_project_status_idx" ON "quality_inspections" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_test_reports_number_uidx" ON "quality_test_reports" USING btree ("company_id","report_number");--> statement-breakpoint
CREATE INDEX "quality_test_reports_project_status_idx" ON "quality_test_reports" USING btree ("company_id","project_id","status");