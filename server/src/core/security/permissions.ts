export const permissionCatalog = {
  'identity.users.read': 'View employee accounts and their access status.',
  'identity.users.manage': 'Create, enable, disable, and reset employee accounts.',
  'identity.roles.manage': 'Configure roles and employee role assignments.',
  'configuration.manage': 'Manage non-commercial company configuration.',
  'jobs.read': 'View background job state and failures.',
  'crm.service_category.read': 'Use active CRM service categories.',
  'crm.service_category.manage': 'Create and deactivate CRM service categories.',
  'crm.customer.read': 'View customers, contacts, addresses, and sites in an assigned context.',
  'crm.customer_master.manage': 'Create and update customer, contact, address, and site records in scope.',
  'crm.lead.read': 'View explicitly assigned leads.',
  'crm.lead.write': 'Create and edit explicitly assigned leads.',
  'crm.lead.assign': 'Assign eligible employees to managed leads.',
  'crm.lead.qualify': 'Qualify an assigned lead into an opportunity.',
  'crm.opportunity.read': 'View explicitly assigned opportunities.',
} as const;

export type PermissionCode = keyof typeof permissionCatalog;

export const systemAdminPermissionCodes: PermissionCode[] = [
  'identity.users.read',
  'identity.users.manage',
  'identity.roles.manage',
  'configuration.manage',
  'jobs.read',
];

export const salesExecutivePermissionCodes: PermissionCode[] = [
  'crm.service_category.read',
  'crm.customer.read',
  'crm.customer_master.manage',
  'crm.lead.read',
  'crm.lead.write',
  'crm.lead.qualify',
  'crm.opportunity.read',
];

export const salesManagerPermissionCodes: PermissionCode[] = [
  ...salesExecutivePermissionCodes,
  'crm.service_category.manage',
  'crm.lead.assign',
];
