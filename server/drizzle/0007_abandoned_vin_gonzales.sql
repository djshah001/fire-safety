CREATE TABLE "item_categories" (
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
	CONSTRAINT "item_categories_row_version_positive" CHECK ("item_categories"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(160) NOT NULL,
	"name_normalized" varchar(160) NOT NULL,
	"specification" varchar(2000),
	"category_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_row_version_positive" CHECK ("items"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(80) NOT NULL,
	"name_normalized" varchar(80) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_row_version_positive" CHECK ("units"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"job_title" varchar(100),
	"phone" varchar(30),
	"phone_normalized" varchar(20),
	"email" varchar(254),
	"email_normalized" varchar(254),
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_contacts_method_required" CHECK ("vendor_contacts"."phone_normalized" is not null or "vendor_contacts"."email_normalized" is not null),
	CONSTRAINT "vendor_contacts_row_version_positive" CHECK ("vendor_contacts"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"display_name_normalized" varchar(160) NOT NULL,
	"legal_name" varchar(200),
	"tax_identifier" varchar(40),
	"address_line_1" varchar(200),
	"address_line_2" varchar(200),
	"city" varchar(100),
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100),
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_row_version_positive" CHECK ("vendors"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "design_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(40) DEFAULT 'authorized' NOT NULL,
	"designer_user_id" uuid NOT NULL,
	"design_head_user_id" uuid NOT NULL,
	"survey_requested" boolean DEFAULT false NOT NULL,
	"authorization_notes" varchar(1000) NOT NULL,
	"authorized_by_user_id" uuid NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_jobs_status_valid" CHECK ("design_jobs"."status" in ('authorized')),
	CONSTRAINT "design_jobs_assignees_distinct" CHECK ("design_jobs"."designer_user_id" <> "design_jobs"."design_head_user_id"),
	CONSTRAINT "design_jobs_row_version_positive" CHECK ("design_jobs"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_designer_user_id_users_id_fk" FOREIGN KEY ("designer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_design_head_user_id_users_id_fk" FOREIGN KEY ("design_head_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_authorized_by_user_id_users_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_company_code_uidx" ON "item_categories" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_company_name_uidx" ON "item_categories" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "item_categories_company_status_idx" ON "item_categories" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "items_company_code_uidx" ON "items" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "items_company_name_idx" ON "items" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "items_company_category_idx" ON "items" USING btree ("company_id","category_id");--> statement-breakpoint
CREATE INDEX "items_company_unit_idx" ON "items" USING btree ("company_id","unit_id");--> statement-breakpoint
CREATE INDEX "items_company_status_idx" ON "items" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "units_company_code_uidx" ON "units" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "units_company_name_uidx" ON "units" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "units_company_status_idx" ON "units" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_contacts_vendor_primary_uidx" ON "vendor_contacts" USING btree ("vendor_id") WHERE "vendor_contacts"."is_primary" = true and "vendor_contacts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "vendor_contacts_vendor_status_idx" ON "vendor_contacts" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "vendor_contacts_company_phone_idx" ON "vendor_contacts" USING btree ("company_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "vendor_contacts_company_email_idx" ON "vendor_contacts" USING btree ("company_id","email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_company_code_uidx" ON "vendors" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "vendors_company_name_idx" ON "vendors" USING btree ("company_id","display_name_normalized");--> statement-breakpoint
CREATE INDEX "vendors_company_status_idx" ON "vendors" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "design_jobs_company_lead_uidx" ON "design_jobs" USING btree ("company_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_jobs_company_opportunity_uidx" ON "design_jobs" USING btree ("company_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "design_jobs_designer_status_idx" ON "design_jobs" USING btree ("company_id","designer_user_id","status");--> statement-breakpoint
CREATE INDEX "design_jobs_head_status_idx" ON "design_jobs" USING btree ("company_id","design_head_user_id","status");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('crm.lead.authorize_design', 'Authorize free design for a qualified assigned lead and create its design handoff.'),
	('engineering.design.write', 'Work on explicitly assigned design jobs.'),
	('engineering.design.review', 'Review explicitly assigned design jobs; authors cannot review their own revisions.'),
	('procurement.vendor.read', 'View operational vendor identity and contact fields.'),
	('procurement.vendor.manage', 'Create, update, and deactivate vendor master records.'),
	('procurement.item.read', 'View item, category, and unit master records.'),
	('procurement.item.manage', 'Create, update, and deactivate item, category, and unit master records.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'crm.lead.authorize_design' FROM "roles" WHERE "code" IN ('sales_executive', 'sales_manager')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'engineering.design.write' FROM "roles" WHERE "code" IN ('design_engineer', 'design_head')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", 'engineering.design.review' FROM "roles" WHERE "code" = 'design_head'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", "permission_code"
FROM "roles"
CROSS JOIN (VALUES
	('procurement.vendor.read'),
	('procurement.vendor.manage'),
	('procurement.item.read'),
	('procurement.item.manage')
) AS assigned("permission_code")
WHERE "roles"."code" IN ('purchase_executive', 'purchase_manager')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "id", "permission_code"
FROM "roles"
CROSS JOIN (VALUES
	('procurement.vendor.read'),
	('procurement.item.read')
) AS assigned("permission_code")
WHERE "roles"."code" = 'receiver'
ON CONFLICT DO NOTHING;
