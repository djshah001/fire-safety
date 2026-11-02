INSERT INTO permissions (code, description) VALUES ('system.access.all', 'Administrator access to all company records and operations.') ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT role.id, permission.code FROM roles role CROSS JOIN permissions permission
WHERE role.code = 'system_admin' AND role.is_system = true ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM role_permissions assignment USING roles role
WHERE assignment.role_id = role.id AND role.is_system = true AND role.code IN ('sales_executive', 'sales_manager')
AND assignment.permission_code = 'engineering.quotation.write';
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT role.id, permission.code FROM roles role CROSS JOIN permissions permission
WHERE role.is_system = true AND role.code IN ('purchase_executive', 'purchase_manager')
AND permission.code IN ('engineering.quotation.read', 'engineering.quotation.write', 'engineering.quotation.issue')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT id, 'engineering.quotation.approve' FROM roles WHERE is_system = true AND code = 'purchase_manager' ON CONFLICT DO NOTHING;
