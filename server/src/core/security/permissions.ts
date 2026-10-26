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
  'crm.lead.authorize_design': 'Authorize free design for a qualified assigned lead and create its design handoff.',
  'crm.opportunity.read': 'View explicitly assigned opportunities.',
  'engineering.design.write': 'Work on explicitly assigned design jobs.',
  'engineering.design.assign_engineer': 'Assign an eligible design engineer to a design job where the employee is the assigned design head.',
  'engineering.design.review': 'Review explicitly assigned design jobs; authors cannot review their own revisions.',
  'engineering.design.customer_decision': 'Record customer decisions and evidence for design jobs linked to assigned CRM work.',
  'engineering.estimate.read': 'View internal cost estimates for assigned engineering work.',
  'engineering.estimate.write': 'Prepare internal cost estimates for assigned engineering work.',
  'engineering.boq.template.manage': 'Configure sector-based BOQ item and approval templates.',
  'engineering.boq.purchase_review': 'Review a costed BOQ as its explicitly assigned purchase head.',
  'engineering.boq.final_review': 'Perform the final BOQ review as its explicitly assigned administrative approver.',
  'engineering.quotation.read': 'View quotation revisions for assigned opportunities.',
  'engineering.quotation.write': 'Prepare quotation revisions for assigned opportunities.',
  'engineering.quotation.approve': 'Approve quotation revisions prepared by a different employee.',
  'engineering.quotation.issue': 'Issue approved quotation revisions using the configured document mode.',
  'engineering.quotation.customer_decision': 'Record customer quotation decisions and evidence.',
  'engineering.payment_plan.read': 'View cash and non-cash payment plans for assigned opportunities.',
  'engineering.payment_plan.write': 'Configure cash and non-cash payment plans for assigned opportunities.',
  'project.read': 'View projects where the employee is an explicit project member.',
  'project.start': 'Start one project from an exact customer-approved design in assigned scope.',
  'procurement.vendor.read': 'View operational vendor identity and contact fields.',
  'procurement.vendor.manage': 'Create, update, and deactivate vendor master records.',
  'procurement.item.read': 'View item, category, and unit master records.',
  'procurement.item.manage': 'Create, update, and deactivate item, category, and unit master records.',
  'procurement.sourcing.read': 'View explicitly assigned requisitions, RFQs, vendor offers, and comparisons.',
  'procurement.requisition.create': 'Create immutable project demand from approved BOQ lines in assigned project scope.',
  'procurement.rfq.manage': 'Create RFQs for explicitly assigned requisitions.',
  'procurement.offer.manage': 'Record submitted vendor offers for explicitly assigned RFQs.',
  'procurement.comparison.select': 'Select a technically equivalent vendor offer as the assigned purchase manager.',
  'procurement.substitution.review': 'Approve or reject technical offer deviations as the assigned project design head.',
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
  'engineering.design.customer_decision',
  'engineering.quotation.read',
  'engineering.quotation.write',
  'engineering.quotation.issue',
  'engineering.quotation.customer_decision',
  'project.read',
];

export const salesManagerPermissionCodes: PermissionCode[] = [
  ...salesExecutivePermissionCodes,
  'crm.service_category.manage',
  'crm.lead.assign',
  'crm.lead.authorize_design',
  'engineering.quotation.approve',
  'engineering.payment_plan.read',
  'engineering.payment_plan.write',
  'project.start',
];

export const designEngineerPermissionCodes: PermissionCode[] = [
  'engineering.design.write',
  'project.read',
];

export const designHeadPermissionCodes: PermissionCode[] = [
  'engineering.design.write',
  'engineering.design.assign_engineer',
  'engineering.design.review',
  'engineering.quotation.read',
  'project.read',
  'procurement.substitution.review',
];

export const purchaseExecutivePermissionCodes: PermissionCode[] = [
  'procurement.vendor.read',
  'procurement.vendor.manage',
  'procurement.item.read',
  'procurement.item.manage',
  'engineering.estimate.read',
  'engineering.estimate.write',
  'project.read',
  'procurement.sourcing.read',
  'procurement.requisition.create',
  'procurement.rfq.manage',
  'procurement.offer.manage',
];

export const purchaseManagerPermissionCodes: PermissionCode[] = [
  'procurement.vendor.read',
  'procurement.vendor.manage',
  'procurement.item.read',
  'procurement.item.manage',
  'engineering.estimate.read',
  'engineering.boq.template.manage',
  'engineering.boq.purchase_review',
  'project.read',
  'procurement.sourcing.read',
  'procurement.comparison.select',
];

export const boqAdminApproverPermissionCodes: PermissionCode[] = [
  'engineering.estimate.read',
  'engineering.boq.final_review',
];

export const receiverPermissionCodes: PermissionCode[] = [
  'procurement.vendor.read',
  'procurement.item.read',
  'project.read',
];

export const managementPermissionCodes: PermissionCode[] = ['project.read', 'project.start'];
export const projectManagerPermissionCodes: PermissionCode[] = ['project.read'];
