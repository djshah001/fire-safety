import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  contactInputSchema,
  customerChildParamsSchema,
  customerInputSchema,
  customerListQuerySchema,
  idParamsSchema,
  leadInputSchema,
  leadListQuerySchema,
  leadStageInputSchema,
  opportunityListQuerySchema,
  qualifyLeadInputSchema,
  serviceCategoryInputSchema,
  siteInputSchema,
  versionedReasonSchema,
} from './crm.schemas.js';
import { crmService } from './crm.service.js';

function serviceCategoryDto(category: {
  id: string; code: string; name: string; status: 'active' | 'inactive'; rowVersion: number;
}) {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    status: category.status,
    rowVersion: category.rowVersion,
  };
}

function contactDto(contact: {
  id: string; name: string; jobTitle: string | null; phone: string | null; email: string | null;
  isPrimary: boolean; status: 'active' | 'inactive'; rowVersion: number;
}) {
  return {
    id: contact.id,
    name: contact.name,
    jobTitle: contact.jobTitle,
    phone: contact.phone,
    email: contact.email,
    isPrimary: contact.isPrimary,
    status: contact.status,
    rowVersion: contact.rowVersion,
  };
}

function siteDto(site: {
  id: string; name: string; addressLine1: string; addressLine2: string | null; city: string;
  state: string | null; postalCode: string | null; country: string | null;
  status: 'active' | 'inactive'; rowVersion: number;
}) {
  return {
    id: site.id,
    name: site.name,
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    city: site.city,
    state: site.state,
    postalCode: site.postalCode,
    country: site.country,
    status: site.status,
    rowVersion: site.rowVersion,
  };
}

function customerSummaryDto(customer: {
  id: string; displayName: string; legalName: string | null; status: 'active' | 'inactive';
  rowVersion: number; createdAt?: Date; updatedAt: Date;
}) {
  return {
    id: customer.id,
    displayName: customer.displayName,
    legalName: customer.legalName,
    status: customer.status,
    rowVersion: customer.rowVersion,
    ...('createdAt' in customer ? { createdAt: customer.createdAt } : {}),
    updatedAt: customer.updatedAt,
  };
}

function customerDetailDto(customer: Awaited<ReturnType<typeof crmService.getCustomer>>) {
  return {
    ...customerSummaryDto(customer),
    contacts: customer.contacts.map(contactDto),
    addresses: customer.addresses,
    sites: customer.sites.map(siteDto),
  };
}

function leadDto(lead: {
  id: string; leadNumber: string; inquiryName: string; companyName: string | null;
  contactName: string; phone: string | null; email: string | null; source: string;
  stage: 'new' | 'contacted' | 'qualified' | 'design_authorized' | 'commercial_negotiation' | 'won' | 'lost' | 'on_hold';
  ownerUserId: string; rowVersion: number; updatedAt: Date; serviceCategoryName?: string;
  address?: string | null; serviceCategoryId?: string; customerId?: string | null;
  primaryContactId?: string | null; siteId?: string | null; lostReason?: string | null;
  qualificationNotes?: string | null; createdAt?: Date;
}) {
  return {
    id: lead.id,
    leadNumber: lead.leadNumber,
    inquiryName: lead.inquiryName,
    companyName: lead.companyName,
    contactName: lead.contactName,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    ownerUserId: lead.ownerUserId,
    rowVersion: lead.rowVersion,
    updatedAt: lead.updatedAt,
    ...('serviceCategoryName' in lead ? { serviceCategoryName: lead.serviceCategoryName } : {}),
    ...('address' in lead ? {
      address: lead.address,
      serviceCategoryId: lead.serviceCategoryId,
      customerId: lead.customerId,
      primaryContactId: lead.primaryContactId,
      siteId: lead.siteId,
      lostReason: lead.lostReason,
      qualificationNotes: lead.qualificationNotes,
      createdAt: lead.createdAt,
    } : {}),
  };
}

function opportunityDto(opportunity: {
  id: string; leadId: string; customerId: string; siteId: string | null; title: string;
  commercialState: 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold'; rowVersion: number;
  leadNumber?: string; customerName?: string; updatedAt: Date;
}) {
  return {
    id: opportunity.id,
    leadId: opportunity.leadId,
    leadNumber: opportunity.leadNumber,
    title: opportunity.title,
    customerId: opportunity.customerId,
    customerName: opportunity.customerName,
    siteId: opportunity.siteId,
    commercialState: opportunity.commercialState,
    rowVersion: opportunity.rowVersion,
    updatedAt: opportunity.updatedAt,
  };
}

export function createCrmRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/service-categories', requirePermission('crm.service_category.read'), async (request, response) => {
    const includeInactive = request.query.includeInactive === 'true';
    const items = await crmService.listServiceCategories(getPrincipal(request), includeInactive);
    sendData(request, response, { items: items.map(serviceCategoryDto) });
  });
  router.post('/service-categories', requireCsrf, requirePermission('crm.service_category.manage'), async (request, response) => {
    const category = await crmService.createServiceCategory(
      getPrincipal(request), serviceCategoryInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { category: serviceCategoryDto(category) }, 201);
  });
  router.post('/service-categories/:id/deactivate', requireCsrf, requirePermission('crm.service_category.manage'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const input = versionedReasonSchema.parse(request.body);
    const category = await crmService.deactivateServiceCategory(
      getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request),
    );
    sendData(request, response, { category: serviceCategoryDto(category) });
  });

  router.get('/customers', requirePermission('crm.customer.read'), async (request, response) => {
    const result = await crmService.listCustomers(getPrincipal(request), customerListQuerySchema.parse(request.query));
    sendData(request, response, { ...result, items: result.items.map(customerSummaryDto) });
  });
  router.post('/customers', requireCsrf, requirePermission('crm.customer_master.manage'), async (request, response) => {
    const result = await crmService.createCustomer(
      getPrincipal(request), customerInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, {
      customer: customerDetailDto(result.customer), duplicateHints: result.duplicateHints,
    }, 201);
  });
  router.get('/customers/:id', requirePermission('crm.customer.read'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    sendData(request, response, { customer: customerDetailDto(await crmService.getCustomer(getPrincipal(request), id)) });
  });
  router.post('/customers/:customerId/contacts', requireCsrf, requirePermission('crm.customer_master.manage'), async (request, response) => {
    const { customerId } = customerChildParamsSchema.parse(request.params);
    const contact = await crmService.addContact(
      getPrincipal(request), customerId, contactInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { contact: contactDto(contact) }, 201);
  });
  router.post('/customers/:customerId/sites', requireCsrf, requirePermission('crm.customer_master.manage'), async (request, response) => {
    const { customerId } = customerChildParamsSchema.parse(request.params);
    const site = await crmService.addSite(
      getPrincipal(request), customerId, siteInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { site: siteDto(site) }, 201);
  });
  router.post('/customers/:id/deactivate', requireCsrf, requirePermission('crm.customer_master.manage'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const input = versionedReasonSchema.parse(request.body);
    const customer = await crmService.deactivateCustomer(
      getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request),
    );
    sendData(request, response, { customer: customerSummaryDto(customer) });
  });

  router.get('/assignees', requirePermission('crm.lead.assign'), async (request, response) => {
    sendData(request, response, { items: await crmService.listAssignees(getPrincipal(request)) });
  });
  router.get('/leads', requirePermission('crm.lead.read'), async (request, response) => {
    const result = await crmService.listLeads(getPrincipal(request), leadListQuerySchema.parse(request.query));
    sendData(request, response, { ...result, items: result.items.map(leadDto) });
  });
  router.post('/leads', requireCsrf, requirePermission('crm.lead.write'), async (request, response) => {
    const result = await crmService.createLead(
      getPrincipal(request), leadInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { lead: leadDto(result.lead), duplicateHints: result.duplicateHints }, 201);
  });
  router.get('/leads/:id', requirePermission('crm.lead.read'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    sendData(request, response, { lead: leadDto(await crmService.getLead(getPrincipal(request), id)) });
  });
  router.post('/leads/:id/stage', requireCsrf, requirePermission('crm.lead.write'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const lead = await crmService.changeLeadStage(
      getPrincipal(request), id, leadStageInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { lead: leadDto(lead) });
  });
  router.post('/leads/:id/qualify', requireCsrf, requirePermission('crm.lead.qualify'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const result = await crmService.qualifyLead(
      getPrincipal(request), id, qualifyLeadInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { opportunity: opportunityDto(result.opportunity), replayed: result.replayed }, result.replayed ? 200 : 201);
  });
  router.get('/opportunities', requirePermission('crm.opportunity.read'), async (request, response) => {
    const result = await crmService.listOpportunities(
      getPrincipal(request), opportunityListQuerySchema.parse(request.query),
    );
    sendData(request, response, { ...result, items: result.items.map(opportunityDto) });
  });

  return router;
}
