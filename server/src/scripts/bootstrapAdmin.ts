import { count, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import {
  permissionCatalog,
  boqAdminApproverPermissionCodes,
  designEngineerPermissionCodes,
  designHeadPermissionCodes,
  purchaseExecutivePermissionCodes,
  purchaseManagerPermissionCodes,
  receiverPermissionCodes,
  salesExecutivePermissionCodes,
  salesManagerPermissionCodes,
  systemAdminPermissionCodes,
} from '../core/security/permissions.js';
import { hashPassword } from '../core/security/password.js';
import { closeDatabase, db } from '../infrastructure/database/db.js';
import {
  branches,
  companies,
  leadPurposes,
  marketSectors,
  permissions,
  rolePermissions,
  roles,
  userRoleAssignments,
  users,
} from '../infrastructure/database/schema/index.js';

const bootstrapFields = [
  ['BOOTSTRAP_COMPANY_NAME', env.BOOTSTRAP_COMPANY_NAME],
  ['BOOTSTRAP_BRANCH_NAME', env.BOOTSTRAP_BRANCH_NAME],
  ['BOOTSTRAP_ADMIN_NAME', env.BOOTSTRAP_ADMIN_NAME],
  ['BOOTSTRAP_ADMIN_EMAIL', env.BOOTSTRAP_ADMIN_EMAIL],
  ['BOOTSTRAP_ADMIN_PASSWORD', env.BOOTSTRAP_ADMIN_PASSWORD],
] as const;

const missing = bootstrapFields.filter(([, value]) => !value).map(([name]) => name);
if (missing.length > 0) {
  throw new Error(`Bootstrap requires explicit values for: ${missing.join(', ')}`);
}

const roleDefinitions = [
  ['system_admin', 'System administrator', 'Employee access and technical configuration only.'],
  ['management', 'Management', 'Management role; permissions are configured after company review.'],
  ['sales_executive', 'Sales executive', 'Sales role; record scope is assigned explicitly.'],
  ['sales_manager', 'Sales manager', 'Sales review role; no approval policy is implied.'],
  ['design_engineer', 'Design engineer', 'Engineering role; design jobs are assigned explicitly.'],
  ['design_head', 'Design head', 'Engineering review role; no approver identity is implied.'],
  ['purchase_executive', 'Purchase executive', 'Procurement preparation role.'],
  ['purchase_manager', 'Purchase manager', 'Procurement review role; no approval policy is implied.'],
  ['boq_admin_approver', 'BOQ administrative approver', 'Explicit final BOQ approval role; not implied by system administration.'],
  ['receiver', 'Receiver / storekeeper', 'Delivery receipt role; inventory permission is not implied.'],
  ['project_manager', 'Project manager', 'Project role reserved for later configuration.'],
  ['quality_reviewer', 'Quality reviewer', 'Quality role reserved for later configuration.'],
  ['accountant', 'Accountant', 'Finance role with no permissions until finance scope is approved.'],
] as const;

const defaultLeadPurposes = [
  ['NEW_PROJECT', 'New project'],
  ['RENEWAL', 'Renewal'],
  ['UPGRADE_RETROFIT', 'Upgrade / retrofit'],
  ['MAINTENANCE_SERVICE', 'Maintenance / service'],
  ['EXPANSION_EXTENSION', 'Expansion / extension'],
  ['COMPLIANCE_AUDIT', 'Compliance / audit'],
  ['REPAIR_REPLACEMENT', 'Repair / replacement'],
  ['OTHER', 'Other'],
] as const;

const defaultMarketSectors = [
  ['INDUSTRIAL', 'Industrial'],
  ['COMMERCIAL', 'Commercial'],
  ['RESIDENTIAL', 'Residential'],
  ['INSTITUTIONAL', 'Institutional'],
  ['HEALTHCARE', 'Healthcare'],
  ['HOSPITALITY', 'Hospitality'],
  ['WAREHOUSE_LOGISTICS', 'Warehouse / logistics'],
  ['INFRASTRUCTURE_PUBLIC', 'Infrastructure / public'],
  ['MIXED_USE', 'Mixed use'],
  ['OTHER', 'Other'],
] as const;

async function bootstrap() {
  const [companyResult] = await db.select({ companyCount: count() }).from(companies);
  if ((companyResult?.companyCount ?? 0) !== 0) {
    throw new Error('Bootstrap refused: a company already exists. Use the admin APIs for later changes.');
  }

  const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD!);
  const adminEmail = env.BOOTSTRAP_ADMIN_EMAIL!.trim().toLowerCase();

  const result = await db.transaction(async (transaction) => {
    await transaction.insert(permissions).values(
      Object.entries(permissionCatalog).map(([code, description]) => ({ code, description })),
    ).onConflictDoNothing();

    const [company] = await transaction.insert(companies).values({
      name: env.BOOTSTRAP_COMPANY_NAME!,
      timezone: env.BUSINESS_TIMEZONE,
    }).returning();
    await transaction.insert(branches).values({
      companyId: company!.id,
      code: 'MAIN',
      name: env.BOOTSTRAP_BRANCH_NAME!,
    });
    const createdRoles = await transaction.insert(roles).values(roleDefinitions.map(([code, name, description]) => ({
      companyId: company!.id,
      code,
      name,
      description,
      isSystem: true,
    }))).returning({ id: roles.id, code: roles.code });
    const adminRole = createdRoles.find((role) => role.code === 'system_admin')!;
    const salesExecutiveRole = createdRoles.find((role) => role.code === 'sales_executive')!;
    const salesManagerRole = createdRoles.find((role) => role.code === 'sales_manager')!;
    const designEngineerRole = createdRoles.find((role) => role.code === 'design_engineer')!;
    const designHeadRole = createdRoles.find((role) => role.code === 'design_head')!;
    const purchaseExecutiveRole = createdRoles.find((role) => role.code === 'purchase_executive')!;
    const purchaseManagerRole = createdRoles.find((role) => role.code === 'purchase_manager')!;
    const boqAdminApproverRole = createdRoles.find((role) => role.code === 'boq_admin_approver')!;
    const receiverRole = createdRoles.find((role) => role.code === 'receiver')!;
    await transaction.insert(rolePermissions).values([
      ...systemAdminPermissionCodes.map((permissionCode) => ({ roleId: adminRole.id, permissionCode })),
      ...salesExecutivePermissionCodes.map((permissionCode) => ({ roleId: salesExecutiveRole.id, permissionCode })),
      ...salesManagerPermissionCodes.map((permissionCode) => ({ roleId: salesManagerRole.id, permissionCode })),
      ...designEngineerPermissionCodes.map((permissionCode) => ({ roleId: designEngineerRole.id, permissionCode })),
      ...designHeadPermissionCodes.map((permissionCode) => ({ roleId: designHeadRole.id, permissionCode })),
      ...purchaseExecutivePermissionCodes.map((permissionCode) => ({ roleId: purchaseExecutiveRole.id, permissionCode })),
      ...purchaseManagerPermissionCodes.map((permissionCode) => ({ roleId: purchaseManagerRole.id, permissionCode })),
      ...boqAdminApproverPermissionCodes.map((permissionCode) => ({ roleId: boqAdminApproverRole.id, permissionCode })),
      ...receiverPermissionCodes.map((permissionCode) => ({ roleId: receiverRole.id, permissionCode })),
    ]);
    const [admin] = await transaction.insert(users).values({
      companyId: company!.id,
      name: env.BOOTSTRAP_ADMIN_NAME!,
      email: adminEmail,
      emailNormalized: adminEmail,
      passwordHash,
      mustChangePassword: true,
    }).returning({ id: users.id, email: users.email });
    await transaction.insert(leadPurposes).values(defaultLeadPurposes.map(([code, name]) => ({
      companyId: company!.id,
      code,
      name,
      nameNormalized: name.toLowerCase(),
      createdByUserId: admin!.id,
    })));
    await transaction.insert(marketSectors).values(defaultMarketSectors.map(([code, name]) => ({
      companyId: company!.id,
      code,
      name,
      nameNormalized: name.toLowerCase(),
      createdByUserId: admin!.id,
    })));
    await transaction.insert(userRoleAssignments).values({
      companyId: company!.id,
      userId: admin!.id,
      roleId: adminRole.id,
    });
    return { companyId: company!.id, adminEmail: admin!.email };
  });

  const [assignedAdmin] = await db.select({ email: users.email }).from(users)
    .where(eq(users.email, result.adminEmail)).limit(1);
  process.stdout.write(`Bootstrap complete for ${assignedAdmin!.email}. Company ID: ${result.companyId}\n`);
}

bootstrap()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
