import { Router } from 'express';
import { AppError } from '../../core/errors/appError.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { createPrivateUpload, resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import {
  activityInputSchema,
  authorizeDesignInputSchema,
  bulkLeadAssignmentSchema,
  bulkReminderInputSchema,
  completeReminderSchema,
  commitImportSchema,
  contactInputSchema,
  customerChildParamsSchema,
  customerInputSchema,
  customerListQuerySchema,
  designAssigneeQuerySchema,
  crmImportTypeParamsSchema,
  idParamsSchema,
  leadInputSchema,
  leadAttachmentParamsSchema,
  leadChildParamsSchema,
  leadListQuerySchema,
  leadStageInputSchema,
  opportunityListQuerySchema,
  qualifyLeadInputSchema,
  reminderInputSchema,
  reminderListQuerySchema,
  serviceCategoryInputSchema,
  siteInputSchema,
  versionedReasonSchema,
} from './crm.schemas.js';
import { crmService } from './crm.service.js';
import { buildImportTemplate } from './crm.imports.js';

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

function attachmentDto(attachment: {
  id: string; originalName: string; mimeType: string; sizeBytes: number; checksumSha256: string;
  createdByUserId: string; createdAt: Date; createdByName?: string;
}) {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksumSha256: attachment.checksumSha256,
    createdByUserId: attachment.createdByUserId,
    createdByName: attachment.createdByName,
    createdAt: attachment.createdAt,
  };
}

function designJobDto(job: {
  id: string; leadId: string; opportunityId: string; title: string; status: string;
  designerUserId: string; designHeadUserId: string; surveyRequested: boolean;
  authorizationNotes: string; authorizedByUserId: string; authorizedAt: Date; rowVersion: number;
}) {
  return {
    id: job.id,
    leadId: job.leadId,
    opportunityId: job.opportunityId,
    title: job.title,
    status: job.status,
    designerUserId: job.designerUserId,
    designHeadUserId: job.designHeadUserId,
    surveyRequested: job.surveyRequested,
    authorizationNotes: job.authorizationNotes,
    authorizedByUserId: job.authorizedByUserId,
    authorizedAt: job.authorizedAt,
    rowVersion: job.rowVersion,
  };
}

export function createCrmRouter() {
  const router = Router();
  const attachmentUpload = createPrivateUpload({
    allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png']),
    maxFileBytes: 20 * 1024 * 1024,
  });
  const importUpload = createPrivateUpload({
    allowedMimeTypes: new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ]),
    maxFileBytes: 5 * 1024 * 1024,
  });
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
  router.get('/design-assignees', requirePermission('crm.lead.authorize_design'), async (request, response) => {
    const { role } = designAssigneeQuerySchema.parse(request.query);
    sendData(request, response, { items: await crmService.listDesignAssignees(getPrincipal(request), role) });
  });
  router.get('/imports/:type/template', async (request, response) => {
    const { type } = crmImportTypeParamsSchema.parse(request.params);
    crmService.assertImportPermission(getPrincipal(request), type);
    const workbook = await buildImportTemplate(type);
    response
      .status(200)
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="fire-safety-${type}-import.xlsx"`)
      .send(workbook);
  });
  router.post(
    '/imports/:type/stage',
    requireCsrf,
    async (request, _response, next) => {
      try {
        const { type } = crmImportTypeParamsSchema.parse(request.params);
        crmService.assertImportPermission(getPrincipal(request), type);
        next();
      } catch (error) {
        next(error);
      }
    },
    importUpload.single('file'),
    async (request, response) => {
      const { type } = crmImportTypeParamsSchema.parse(request.params);
      if (!request.file) throw new AppError('VALIDATION_ERROR', 'Choose an Excel workbook to upload.', 422);
      const batch = await crmService.stageImport(getPrincipal(request), type, request.file, getRequestId(request));
      sendData(request, response, { batch }, 201);
    },
  );
  router.get('/imports/:id', async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    sendData(request, response, { batch: await crmService.getImportBatch(getPrincipal(request), id) });
  });
  router.post('/imports/:id/commit', requireCsrf, async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const { expectedVersion } = commitImportSchema.parse(request.body);
    const batch = await crmService.commitImport(getPrincipal(request), id, expectedVersion, getRequestId(request));
    sendData(request, response, { batch });
  });
  router.get('/reminders', requirePermission('crm.lead.read'), async (request, response) => {
    const result = await crmService.listMyReminders(
      getPrincipal(request), reminderListQuerySchema.parse(request.query),
    );
    sendData(request, response, result);
  });
  router.post('/reminders/:id/complete', requireCsrf, requirePermission('crm.lead.write'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const { expectedVersion } = completeReminderSchema.parse(request.body);
    const reminder = await crmService.completeReminder(
      getPrincipal(request), id, expectedVersion, getRequestId(request),
    );
    sendData(request, response, { reminder });
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
  router.post('/leads/bulk/assign', requireCsrf, requirePermission('crm.lead.assign'), async (request, response) => {
    const result = await crmService.bulkAssignLeads(
      getPrincipal(request), bulkLeadAssignmentSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, result);
  });
  router.post('/leads/bulk/reminders', requireCsrf, requirePermission('crm.lead.write'), async (request, response) => {
    const result = await crmService.bulkCreateReminders(
      getPrincipal(request), bulkReminderInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, result, 201);
  });
  router.get('/leads/:id', requirePermission('crm.lead.read'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    sendData(request, response, { lead: leadDto(await crmService.getLead(getPrincipal(request), id)) });
  });
  router.get('/leads/:leadId/activities', requirePermission('crm.lead.read'), async (request, response) => {
    const { leadId } = leadChildParamsSchema.parse(request.params);
    sendData(request, response, { items: await crmService.listActivities(getPrincipal(request), leadId) });
  });
  router.post('/leads/:leadId/activities', requireCsrf, requirePermission('crm.lead.write'), async (request, response) => {
    const { leadId } = leadChildParamsSchema.parse(request.params);
    const activity = await crmService.createActivity(
      getPrincipal(request), leadId, activityInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { activity }, 201);
  });
  router.get('/leads/:leadId/reminders', requirePermission('crm.lead.read'), async (request, response) => {
    const { leadId } = leadChildParamsSchema.parse(request.params);
    sendData(request, response, { items: await crmService.listLeadReminders(getPrincipal(request), leadId) });
  });
  router.post('/leads/:leadId/reminders', requireCsrf, requirePermission('crm.lead.write'), async (request, response) => {
    const { leadId } = leadChildParamsSchema.parse(request.params);
    const reminder = await crmService.createReminder(
      getPrincipal(request), leadId, reminderInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { reminder }, 201);
  });
  router.get('/leads/:leadId/attachments', requirePermission('crm.lead.read'), async (request, response) => {
    const { leadId } = leadChildParamsSchema.parse(request.params);
    const items = await crmService.listAttachments(getPrincipal(request), leadId);
    sendData(request, response, { items: items.map(attachmentDto) });
  });
  router.post(
    '/leads/:leadId/attachments',
    requireCsrf,
    requirePermission('crm.lead.write'),
    async (request, _response, next) => {
      try {
        const { leadId } = leadChildParamsSchema.parse(request.params);
        await crmService.getLead(getPrincipal(request), leadId);
        next();
      } catch (error) {
        next(error);
      }
    },
    attachmentUpload.single('file'),
    async (request, response) => {
      const { leadId } = leadChildParamsSchema.parse(request.params);
      if (!request.file) throw new AppError('VALIDATION_ERROR', 'Choose a file to upload.', 422);
      const attachment = await crmService.createAttachment(
        getPrincipal(request), leadId, request.file, getRequestId(request),
      );
      sendData(request, response, { attachment: attachmentDto(attachment) }, 201);
    },
  );
  router.get('/leads/:leadId/attachments/:attachmentId/download', requirePermission('crm.lead.read'), async (request, response, next) => {
    const { leadId, attachmentId } = leadAttachmentParamsSchema.parse(request.params);
    const attachment = await crmService.getAttachment(getPrincipal(request), leadId, attachmentId);
    response.download(resolvePrivateFile(attachment.storageName), attachment.originalName, (error) => {
      if (error && !response.headersSent) next(error);
    });
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
  router.post('/leads/:id/authorize-design', requireCsrf, requirePermission('crm.lead.authorize_design'), async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const result = await crmService.authorizeDesign(
      getPrincipal(request), id, authorizeDesignInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { designJob: designJobDto(result.designJob), replayed: result.replayed }, result.replayed ? 200 : 201);
  });
  router.get('/opportunities', requirePermission('crm.opportunity.read'), async (request, response) => {
    const result = await crmService.listOpportunities(
      getPrincipal(request), opportunityListQuerySchema.parse(request.query),
    );
    sendData(request, response, { ...result, items: result.items.map(opportunityDto) });
  });

  return router;
}
