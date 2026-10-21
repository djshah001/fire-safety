ALTER TYPE "public"."boq_revision_status" ADD VALUE 'costing' BEFORE 'returned';--> statement-breakpoint
ALTER TYPE "public"."boq_revision_status" ADD VALUE 'purchase_review' BEFORE 'returned';--> statement-breakpoint
ALTER TYPE "public"."boq_revision_status" ADD VALUE 'admin_review' BEFORE 'returned';--> statement-breakpoint
CREATE TABLE "lead_purposes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_normalized" varchar(120) NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_purposes_row_version_positive" CHECK ("lead_purposes"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "market_sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_normalized" varchar(120) NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_sectors_row_version_positive" CHECK ("market_sectors"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "boq_revision_contributors" (
	"boq_revision_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contribution" varchar(30) NOT NULL,
	"contributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_revision_contributors_pk" PRIMARY KEY("boq_revision_id","user_id"),
	CONSTRAINT "boq_revision_contribution_valid" CHECK ("boq_revision_contributors"."contribution" in ('quantity', 'costing'))
);
--> statement-breakpoint
CREATE TABLE "boq_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"section" varchar(120) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_template_items_sort_positive" CHECK ("boq_template_items"."sort_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "boq_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"costing_user_id" uuid NOT NULL,
	"purchase_head_user_id" uuid NOT NULL,
	"admin_approver_user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_templates_status_valid" CHECK ("boq_templates"."status" in ('active', 'inactive')),
	CONSTRAINT "boq_templates_assignees_distinct" CHECK ("boq_templates"."costing_user_id" <> "boq_templates"."purchase_head_user_id" and "boq_templates"."costing_user_id" <> "boq_templates"."admin_approver_user_id" and "boq_templates"."purchase_head_user_id" <> "boq_templates"."admin_approver_user_id"),
	CONSTRAINT "boq_templates_row_version_positive" CHECK ("boq_templates"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "boq_lines" DROP CONSTRAINT "boq_lines_quantity_positive";--> statement-breakpoint
ALTER TABLE "design_jobs" DROP CONSTRAINT "design_jobs_status_valid";--> statement-breakpoint
DROP INDEX "boq_review_actions_revision_uidx";--> statement-breakpoint
ALTER TABLE "design_jobs" ALTER COLUMN "designer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "purpose_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "sector_id" uuid;--> statement-breakpoint
ALTER TABLE "boq_review_actions" ADD COLUMN "review_stage" varchar(30) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "template_name_snapshot" varchar(160);--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "costing_user_id" uuid;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "purchase_head_user_id" uuid;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD COLUMN "admin_approver_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_purposes" ADD CONSTRAINT "lead_purposes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_purposes" ADD CONSTRAINT "lead_purposes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_sectors" ADD CONSTRAINT "market_sectors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_sectors" ADD CONSTRAINT "market_sectors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revision_contributors" ADD CONSTRAINT "boq_revision_contributors_boq_revision_id_boq_revisions_id_fk" FOREIGN KEY ("boq_revision_id") REFERENCES "public"."boq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revision_contributors" ADD CONSTRAINT "boq_revision_contributors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revision_contributors" ADD CONSTRAINT "boq_revision_contributors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_template_items" ADD CONSTRAINT "boq_template_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_template_items" ADD CONSTRAINT "boq_template_items_template_id_boq_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."boq_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_template_items" ADD CONSTRAINT "boq_template_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_templates" ADD CONSTRAINT "boq_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_templates" ADD CONSTRAINT "boq_templates_sector_id_market_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."market_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_templates" ADD CONSTRAINT "boq_templates_costing_user_id_users_id_fk" FOREIGN KEY ("costing_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_templates" ADD CONSTRAINT "boq_templates_purchase_head_user_id_users_id_fk" FOREIGN KEY ("purchase_head_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_templates" ADD CONSTRAINT "boq_templates_admin_approver_user_id_users_id_fk" FOREIGN KEY ("admin_approver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_templates" ADD CONSTRAINT "boq_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_purposes_company_code_uidx" ON "lead_purposes" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_purposes_company_name_uidx" ON "lead_purposes" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "lead_purposes_company_status_idx" ON "lead_purposes" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "market_sectors_company_code_uidx" ON "market_sectors" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "market_sectors_company_name_uidx" ON "market_sectors" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "market_sectors_company_status_idx" ON "market_sectors" USING btree ("company_id","status");--> statement-breakpoint
INSERT INTO "lead_purposes" ("company_id", "code", "name", "name_normalized", "created_by_user_id")
SELECT company_user."company_id", purpose."code", purpose."name", lower(purpose."name"), company_user."user_id"
FROM (
	SELECT DISTINCT ON ("company_id") "company_id", "id" AS "user_id"
	FROM "users"
	ORDER BY "company_id", "created_at", "id"
) AS company_user
CROSS JOIN (VALUES
	('NEW_PROJECT', 'New project'),
	('RENEWAL', 'Renewal'),
	('UPGRADE_RETROFIT', 'Upgrade / retrofit'),
	('MAINTENANCE_SERVICE', 'Maintenance / service'),
	('EXPANSION_EXTENSION', 'Expansion / extension'),
	('COMPLIANCE_AUDIT', 'Compliance / audit'),
	('REPAIR_REPLACEMENT', 'Repair / replacement'),
	('OTHER', 'Other')
) AS purpose("code", "name")
ON CONFLICT ("company_id", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "market_sectors" ("company_id", "code", "name", "name_normalized", "created_by_user_id")
SELECT company_user."company_id", sector."code", sector."name", lower(sector."name"), company_user."user_id"
FROM (
	SELECT DISTINCT ON ("company_id") "company_id", "id" AS "user_id"
	FROM "users"
	ORDER BY "company_id", "created_at", "id"
) AS company_user
CROSS JOIN (VALUES
	('INDUSTRIAL', 'Industrial'),
	('COMMERCIAL', 'Commercial'),
	('RESIDENTIAL', 'Residential'),
	('INSTITUTIONAL', 'Institutional'),
	('HEALTHCARE', 'Healthcare'),
	('HOSPITALITY', 'Hospitality'),
	('WAREHOUSE_LOGISTICS', 'Warehouse / logistics'),
	('INFRASTRUCTURE_PUBLIC', 'Infrastructure / public'),
	('MIXED_USE', 'Mixed use'),
	('OTHER', 'Other')
) AS sector("code", "name")
ON CONFLICT ("company_id", "code") DO NOTHING;--> statement-breakpoint
UPDATE "leads"
SET "purpose_id" = purpose."id"
FROM "lead_purposes" AS purpose
WHERE purpose."company_id" = "leads"."company_id" AND purpose."code" = 'OTHER' AND "leads"."purpose_id" IS NULL;--> statement-breakpoint
UPDATE "leads"
SET "sector_id" = sector."id"
FROM "market_sectors" AS sector
WHERE sector."company_id" = "leads"."company_id" AND sector."code" = 'OTHER' AND "leads"."sector_id" IS NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "purpose_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "sector_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "boq_revision_contributors_user_idx" ON "boq_revision_contributors" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_template_items_template_item_uidx" ON "boq_template_items" USING btree ("template_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_template_items_template_order_uidx" ON "boq_template_items" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "boq_template_items_company_item_idx" ON "boq_template_items" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_templates_company_sector_uidx" ON "boq_templates" USING btree ("company_id","sector_id");--> statement-breakpoint
CREATE INDEX "boq_templates_company_status_idx" ON "boq_templates" USING btree ("company_id","status");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_purpose_id_lead_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."lead_purposes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sector_id_market_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."market_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_template_id_boq_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."boq_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_costing_user_id_users_id_fk" FOREIGN KEY ("costing_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_purchase_head_user_id_users_id_fk" FOREIGN KEY ("purchase_head_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_admin_approver_user_id_users_id_fk" FOREIGN KEY ("admin_approver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_company_purpose_idx" ON "leads" USING btree ("company_id","purpose_id");--> statement-breakpoint
CREATE INDEX "leads_company_sector_idx" ON "leads" USING btree ("company_id","sector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_review_actions_revision_stage_uidx" ON "boq_review_actions" USING btree ("boq_revision_id","review_stage");--> statement-breakpoint
CREATE INDEX "boq_revisions_costing_idx" ON "boq_revisions" USING btree ("company_id","costing_user_id","status");--> statement-breakpoint
CREATE INDEX "boq_revisions_purchase_head_idx" ON "boq_revisions" USING btree ("company_id","purchase_head_user_id","status");--> statement-breakpoint
CREATE INDEX "boq_revisions_admin_approver_idx" ON "boq_revisions" USING btree ("company_id","admin_approver_user_id","status");--> statement-breakpoint
ALTER TABLE "boq_lines" ADD CONSTRAINT "boq_lines_quantity_nonnegative" CHECK ("boq_lines"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "boq_review_actions" ADD CONSTRAINT "boq_review_stage_valid" CHECK ("boq_review_actions"."review_stage" in ('legacy', 'purchase', 'admin'));--> statement-breakpoint
ALTER TABLE "boq_revisions" ADD CONSTRAINT "boq_revisions_template_assignment_consistent" CHECK ("boq_revisions"."template_id" is null or ("boq_revisions"."template_name_snapshot" is not null and "boq_revisions"."costing_user_id" is not null and "boq_revisions"."purchase_head_user_id" is not null and "boq_revisions"."admin_approver_user_id" is not null));--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_status_valid" CHECK ("design_jobs"."status" in ('awaiting_designer', 'authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested'));
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('engineering.design.assign_engineer', 'Assign an eligible design engineer to a design job where the employee is the assigned design head.'),
	('engineering.boq.template.manage', 'Configure sector-based BOQ item and approval templates.'),
	('engineering.boq.purchase_review', 'Review a costed BOQ as its explicitly assigned purchase head.'),
	('engineering.boq.final_review', 'Perform the final BOQ review as its explicitly assigned administrative approver.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";--> statement-breakpoint
INSERT INTO "roles" ("company_id", "code", "name", "description", "is_system")
SELECT "id", 'boq_admin_approver', 'BOQ administrative approver', 'Explicit final BOQ approval role; not implied by system administration.', true
FROM "companies"
ON CONFLICT ("company_id", "code") DO NOTHING;--> statement-breakpoint
DELETE FROM "role_permissions"
USING "roles"
WHERE "role_permissions"."role_id" = "roles"."id"
	AND (
		("roles"."code" = 'sales_executive' AND "role_permissions"."permission_code" = 'crm.lead.authorize_design')
		OR ("roles"."code" IN ('sales_manager', 'design_engineer', 'design_head') AND "role_permissions"."permission_code" IN ('engineering.estimate.read', 'engineering.estimate.write'))
		OR ("roles"."code" = 'purchase_manager' AND "role_permissions"."permission_code" = 'engineering.estimate.write')
	);--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", assigned."permission_code"
FROM "roles"
CROSS JOIN (VALUES
	('design_head', 'engineering.design.assign_engineer'),
	('purchase_executive', 'engineering.estimate.read'),
	('purchase_executive', 'engineering.estimate.write'),
	('purchase_manager', 'engineering.estimate.read'),
	('purchase_manager', 'engineering.boq.template.manage'),
	('purchase_manager', 'engineering.boq.purchase_review'),
	('boq_admin_approver', 'engineering.estimate.read'),
	('boq_admin_approver', 'engineering.boq.final_review')
) AS assigned("role_code", "permission_code")
WHERE "roles"."code" = assigned."role_code"
ON CONFLICT DO NOTHING;
