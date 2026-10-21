CREATE TYPE "public"."quotation_customer_decision" AS ENUM('accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."quotation_revision_status" AS ENUM('draft', 'submitted', 'returned', 'approved', 'issued', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "quotation_customer_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_revision_id" uuid NOT NULL,
	"decision" "quotation_customer_decision" NOT NULL,
	"evidence_reference" varchar(1000) NOT NULL,
	"customer_order_reference" varchar(200),
	"notes" varchar(1000),
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_customer_evidence_required" CHECK (length(trim("quotation_customer_decisions"."evidence_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_issue_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_revision_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_name" varchar(80) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"template_version" varchar(40) NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_issue_documents_size_positive" CHECK ("quotation_issue_documents"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_revision_id" uuid NOT NULL,
	"boq_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"section_snapshot" varchar(120) NOT NULL,
	"item_code_snapshot" varchar(50) NOT NULL,
	"item_name_snapshot" varchar(160) NOT NULL,
	"specification_snapshot" varchar(2000) NOT NULL,
	"unit_symbol_snapshot" varchar(20) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_rate" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(20, 2) DEFAULT '0' NOT NULL,
	"line_subtotal" numeric(20, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(20, 2) DEFAULT '0' NOT NULL,
	"notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_lines_number_positive" CHECK ("quotation_lines"."line_number" > 0),
	CONSTRAINT "quotation_lines_quantity_positive" CHECK ("quotation_lines"."quantity" > 0),
	CONSTRAINT "quotation_lines_amounts_valid" CHECK ("quotation_lines"."unit_rate" >= 0 and "quotation_lines"."discount_amount" >= 0 and "quotation_lines"."line_subtotal" >= 0 and "quotation_lines"."line_total" >= 0 and "quotation_lines"."discount_amount" <= "quotation_lines"."line_subtotal"),
	CONSTRAINT "quotation_lines_row_version_positive" CHECK ("quotation_lines"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_revision_id" uuid NOT NULL,
	"decision" "design_review_decision" NOT NULL,
	"reason" varchar(1000),
	"actor_user_id" uuid NOT NULL,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_review_reason_required" CHECK ("quotation_review_actions"."decision" = 'approved' or ("quotation_review_actions"."reason" is not null and length(trim("quotation_review_actions"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "quotation_revision_contributors" (
	"quotation_revision_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_revision_contributors_pk" PRIMARY KEY("quotation_revision_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "quotation_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"boq_revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"status" "quotation_revision_status" DEFAULT 'draft' NOT NULL,
	"title" varchar(200) NOT NULL,
	"customer_name_snapshot" varchar(200) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"validity_days" integer DEFAULT 30 NOT NULL,
	"exclusions" varchar(4000) NOT NULL,
	"delivery_terms" varchar(2000) NOT NULL,
	"payment_terms" varchar(2000) NOT NULL,
	"tax_label" varchar(120),
	"subtotal" numeric(20, 2) DEFAULT '0' NOT NULL,
	"line_discount_total" numeric(20, 2) DEFAULT '0' NOT NULL,
	"additional_discount" numeric(20, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(20, 2) DEFAULT '0' NOT NULL,
	"rounding_adjustment" numeric(20, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(20, 2) DEFAULT '0' NOT NULL,
	"cash_percentage" numeric(5, 2),
	"non_cash_percentage" numeric(5, 2),
	"created_by_user_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"issued_by_user_id" uuid,
	"issued_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_revisions_number_positive" CHECK ("quotation_revisions"."revision_number" > 0),
	CONSTRAINT "quotation_revisions_validity" CHECK ("quotation_revisions"."validity_days" between 1 and 365),
	CONSTRAINT "quotation_revisions_currency_valid" CHECK ("quotation_revisions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "quotation_revisions_amounts_nonnegative" CHECK ("quotation_revisions"."subtotal" >= 0 and "quotation_revisions"."line_discount_total" >= 0 and "quotation_revisions"."additional_discount" >= 0 and "quotation_revisions"."tax_amount" >= 0 and "quotation_revisions"."grand_total" >= 0),
	CONSTRAINT "quotation_revisions_payment_split_valid" CHECK (("quotation_revisions"."cash_percentage" is null and "quotation_revisions"."non_cash_percentage" is null) or ("quotation_revisions"."cash_percentage" between 0 and 100 and "quotation_revisions"."non_cash_percentage" between 0 and 100 and "quotation_revisions"."cash_percentage" + "quotation_revisions"."non_cash_percentage" = 100)),
	CONSTRAINT "quotation_revisions_tax_label_consistent" CHECK ("quotation_revisions"."tax_amount" = 0 or ("quotation_revisions"."tax_label" is not null and length(trim("quotation_revisions"."tax_label")) > 0)),
	CONSTRAINT "quotation_revisions_row_version_positive" CHECK ("quotation_revisions"."row_version" > 0),
	CONSTRAINT "quotation_revisions_submission_consistent" CHECK (("quotation_revisions"."status" = 'draft' and "quotation_revisions"."submitted_at" is null and "quotation_revisions"."submitted_by_user_id" is null) or ("quotation_revisions"."status" <> 'draft' and "quotation_revisions"."submitted_at" is not null and "quotation_revisions"."submitted_by_user_id" is not null)),
	CONSTRAINT "quotation_revisions_approval_consistent" CHECK ("quotation_revisions"."status" in ('draft', 'submitted', 'returned') or ("quotation_revisions"."approved_at" is not null and "quotation_revisions"."approved_by_user_id" is not null)),
	CONSTRAINT "quotation_revisions_issue_consistent" CHECK ("quotation_revisions"."status" not in ('issued', 'accepted', 'declined') or ("quotation_revisions"."issued_at" is not null and "quotation_revisions"."issued_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_job_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"quotation_number" varchar(40) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotation_customer_decisions" ADD CONSTRAINT "quotation_customer_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_customer_decisions" ADD CONSTRAINT "quotation_customer_decisions_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_customer_decisions" ADD CONSTRAINT "quotation_customer_decisions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_issue_documents" ADD CONSTRAINT "quotation_issue_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_issue_documents" ADD CONSTRAINT "quotation_issue_documents_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_issue_documents" ADD CONSTRAINT "quotation_issue_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_boq_line_id_boq_lines_id_fk" FOREIGN KEY ("boq_line_id") REFERENCES "public"."boq_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_review_actions" ADD CONSTRAINT "quotation_review_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_review_actions" ADD CONSTRAINT "quotation_review_actions_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_review_actions" ADD CONSTRAINT "quotation_review_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revision_contributors" ADD CONSTRAINT "quotation_revision_contributors_quotation_revision_id_quotation_revisions_id_fk" FOREIGN KEY ("quotation_revision_id") REFERENCES "public"."quotation_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revision_contributors" ADD CONSTRAINT "quotation_revision_contributors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revision_contributors" ADD CONSTRAINT "quotation_revision_contributors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_design_job_id_design_jobs_id_fk" FOREIGN KEY ("design_job_id") REFERENCES "public"."design_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_customer_decisions_revision_uidx" ON "quotation_customer_decisions" USING btree ("quotation_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_issue_documents_revision_uidx" ON "quotation_issue_documents" USING btree ("quotation_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_issue_documents_storage_uidx" ON "quotation_issue_documents" USING btree ("storage_name");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_lines_revision_number_uidx" ON "quotation_lines" USING btree ("quotation_revision_id","line_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_lines_revision_boq_line_uidx" ON "quotation_lines" USING btree ("quotation_revision_id","boq_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_review_actions_revision_uidx" ON "quotation_review_actions" USING btree ("quotation_revision_id");--> statement-breakpoint
CREATE INDEX "quotation_revision_contributors_user_idx" ON "quotation_revision_contributors" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_revisions_number_uidx" ON "quotation_revisions" USING btree ("quotation_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_revisions_one_draft_uidx" ON "quotation_revisions" USING btree ("quotation_id") WHERE "quotation_revisions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "quotation_revisions_company_status_idx" ON "quotation_revisions" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "quotation_revisions_boq_idx" ON "quotation_revisions" USING btree ("company_id","boq_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_company_number_uidx" ON "quotations" USING btree ("company_id","quotation_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_job_uidx" ON "quotations" USING btree ("design_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_opportunity_uidx" ON "quotations" USING btree ("opportunity_id");--> statement-breakpoint

INSERT INTO "permissions" ("code", "description") VALUES
	('engineering.quotation.read', 'View quotation revisions for assigned opportunities.'),
	('engineering.quotation.write', 'Prepare quotation revisions for assigned opportunities.'),
	('engineering.quotation.approve', 'Approve quotation revisions prepared by a different employee.'),
	('engineering.quotation.issue', 'Issue approved quotation revisions using the configured document mode.'),
	('engineering.quotation.customer_decision', 'Record customer quotation decisions and evidence.'),
	('engineering.payment_plan.read', 'View cash and non-cash payment plans for assigned opportunities.'),
	('engineering.payment_plan.write', 'Configure cash and non-cash payment plans for assigned opportunities.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", permission_code FROM "roles"
CROSS JOIN unnest(ARRAY[
	'engineering.quotation.read',
	'engineering.quotation.write',
	'engineering.quotation.issue',
	'engineering.quotation.customer_decision'
]) AS permission_code
WHERE "code" IN ('sales_executive', 'sales_manager')
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", permission_code FROM "roles"
CROSS JOIN unnest(ARRAY[
	'engineering.quotation.approve',
	'engineering.payment_plan.read',
	'engineering.payment_plan.write'
]) AS permission_code
WHERE "code" = 'sales_manager'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'engineering.quotation.read' FROM "roles" WHERE "code" = 'design_head'
ON CONFLICT DO NOTHING;
