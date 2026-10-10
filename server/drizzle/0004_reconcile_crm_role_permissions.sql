-- Idempotent upgrade repair for databases that recorded the original CRM
-- schema migration before its permission seed was finalized.
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
