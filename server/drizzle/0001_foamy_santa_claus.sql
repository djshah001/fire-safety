CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'qualified', 'design_authorized', 'commercial_negotiation', 'won', 'lost', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."master_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."opportunity_commercial_state" AS ENUM('unawarded', 'quoted', 'awarded', 'lost', 'on_hold');--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100),
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_row_version_positive" CHECK ("customer_addresses"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
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
	CONSTRAINT "customer_contacts_method_required" CHECK ("customer_contacts"."phone_normalized" is not null or "customer_contacts"."email_normalized" is not null),
	CONSTRAINT "customer_contacts_row_version_positive" CHECK ("customer_contacts"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "customer_members" (
	"customer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" varchar(30) DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_members_pk" PRIMARY KEY("customer_id","user_id"),
	CONSTRAINT "customer_members_role_valid" CHECK ("customer_members"."role" in ('owner', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"display_name_normalized" varchar(160) NOT NULL,
	"legal_name" varchar(200),
	"tax_identifier" varchar(40),
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_row_version_positive" CHECK ("customers"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "lead_members" (
	"lead_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" varchar(30) DEFAULT 'collaborator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_members_pk" PRIMARY KEY("lead_id","user_id"),
	CONSTRAINT "lead_members_role_valid" CHECK ("lead_members"."role" in ('owner', 'collaborator', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_number" varchar(40) NOT NULL,
	"inquiry_name" varchar(160) NOT NULL,
	"company_name" varchar(200),
	"contact_name" varchar(120) NOT NULL,
	"phone" varchar(30),
	"phone_normalized" varchar(20),
	"email" varchar(254),
	"email_normalized" varchar(254),
	"address" varchar(500),
	"source" varchar(100) NOT NULL,
	"service_category_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"customer_id" uuid,
	"primary_contact_id" uuid,
	"site_id" uuid,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"lost_reason" varchar(500),
	"qualification_notes" varchar(1000),
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_contact_method_required" CHECK ("leads"."phone_normalized" is not null or "leads"."email_normalized" is not null),
	CONSTRAINT "leads_lost_reason_consistent" CHECK (("leads"."stage" = 'lost' and "leads"."lost_reason" is not null) or ("leads"."stage" <> 'lost' and "leads"."lost_reason" is null)),
	CONSTRAINT "leads_row_version_positive" CHECK ("leads"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"primary_contact_id" uuid NOT NULL,
	"site_id" uuid,
	"title" varchar(200) NOT NULL,
	"commercial_state" "opportunity_commercial_state" DEFAULT 'unawarded' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_row_version_positive" CHECK ("opportunities"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opportunity_members" (
	"opportunity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" varchar(30) DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_members_pk" PRIMARY KEY("opportunity_id","user_id"),
	CONSTRAINT "opportunity_members_role_valid" CHECK ("opportunity_members"."role" in ('owner', 'sales', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
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
	CONSTRAINT "service_categories_row_version_positive" CHECK ("service_categories"."row_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100),
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_row_version_positive" CHECK ("sites"."row_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_members" ADD CONSTRAINT "lead_members_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_members" ADD CONSTRAINT "lead_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_members" ADD CONSTRAINT "lead_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_service_category_id_service_categories_id_fk" FOREIGN KEY ("service_category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_primary_contact_id_customer_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."customer_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primary_contact_id_customer_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."customer_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_members" ADD CONSTRAINT "opportunity_members_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_members" ADD CONSTRAINT "opportunity_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_members" ADD CONSTRAINT "opportunity_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_status_idx" ON "customer_addresses" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_status_idx" ON "customer_contacts" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_contacts_company_phone_idx" ON "customer_contacts" USING btree ("company_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "customer_contacts_company_email_idx" ON "customer_contacts" USING btree ("company_id","email_normalized");--> statement-breakpoint
CREATE INDEX "customer_members_user_idx" ON "customer_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "customers_company_name_idx" ON "customers" USING btree ("company_id","display_name_normalized");--> statement-breakpoint
CREATE INDEX "customers_company_status_idx" ON "customers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "lead_members_user_idx" ON "lead_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_number_uidx" ON "leads" USING btree ("company_id","lead_number");--> statement-breakpoint
CREATE INDEX "leads_company_owner_stage_idx" ON "leads" USING btree ("company_id","owner_user_id","stage");--> statement-breakpoint
CREATE INDEX "leads_company_phone_idx" ON "leads" USING btree ("company_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "leads_company_email_idx" ON "leads" USING btree ("company_id","email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_company_lead_uidx" ON "opportunities" USING btree ("company_id","lead_id");--> statement-breakpoint
CREATE INDEX "opportunities_company_customer_idx" ON "opportunities" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "opportunity_members_user_idx" ON "opportunity_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_company_code_uidx" ON "service_categories" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_company_name_uidx" ON "service_categories" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE INDEX "service_categories_company_status_idx" ON "service_categories" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "sites_customer_status_idx" ON "sites" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "sites_company_name_idx" ON "sites" USING btree ("company_id","name");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('crm.service_category.read', 'Use active CRM service categories.'),
	('crm.service_category.manage', 'Create and deactivate CRM service categories.'),
	('crm.customer.read', 'View customers, contacts, addresses, and sites in an assigned context.'),
	('crm.customer_master.manage', 'Create and update customer, contact, address, and site records in scope.'),
	('crm.lead.read', 'View explicitly assigned leads.'),
	('crm.lead.write', 'Create and edit explicitly assigned leads.'),
	('crm.lead.assign', 'Assign eligible employees to managed leads.'),
	('crm.lead.qualify', 'Qualify an assigned lead into an opportunity.'),
	('crm.opportunity.read', 'View explicitly assigned opportunities.')
ON CONFLICT ("code") DO UPDATE SET "description" = excluded."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", permission_codes."code"
FROM "roles"
CROSS JOIN (VALUES
	('crm.service_category.read'),
	('crm.customer.read'),
	('crm.customer_master.manage'),
	('crm.lead.read'),
	('crm.lead.write'),
	('crm.lead.qualify'),
	('crm.opportunity.read')
) AS permission_codes("code")
WHERE "roles"."code" IN ('sales_executive', 'sales_manager')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", permission_codes."code"
FROM "roles"
CROSS JOIN (VALUES
	('crm.service_category.manage'),
	('crm.lead.assign')
) AS permission_codes("code")
WHERE "roles"."code" = 'sales_manager'
ON CONFLICT DO NOTHING;
