import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../../core/errors/appError.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { hasPermission, requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { createPrivateUpload, removePrivateFile, resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import {
  activityInputSchema,
  authorizeDesignInputSchema,
  bulkLeadAssignmentSchema,
  bulkReminderInputSchema,
  completeReminderSchema,
  commitImportSchema,
  classificationInputSchema,
  classificationTypeParamsSchema,
  contactInputSchema,
  customerChildParamsSchema,
  customerInputSchema,
  customerListQuerySchema,
  designAssigneeQuerySchema,
  duplicateHintsInputSchema,
  crmImportTypeParamsSchema,
  idParamsSchema,
  leadInputSchema,
  leadAttachmentParamsSchema,
  leadChildParamsSchema,
  leadListQuerySchema,
  leadStageInputSchema,
  opportunityAttachmentParamsSchema,
  opportunityChildParamsSchema,
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

const classificationDto = serviceCategoryDto;

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
  customerType: string; gstin: string | null; pan: string | null;
  rowVersion: number; createdAt?: Date; updatedAt: Date;
}) {
  return {
    id: customer.id,
    displayName: customer.displayName,
    legalName: customer.legalName,
    customerType: customer.customerType,
    gstin: customer.gstin,
    pan: customer.pan,
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
  ownerUserId: string; ownerName?: string; ownerIsOnLeave?: boolean;
  createdByUserId?: string; createdByName?: string;
  lastModifiedByUserId?: string; lastModifiedByName?: string;
  opportunityId?: string | null; designJobId?: string | null; designStatus?: string | null;
  purposeId?: string; purposeName?: string; sectorId?: string; sectorName?: string;
  rowVersion: number; updatedAt: Date; serviceCategoryName?: string;
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
    ownerName: lead.ownerName,
    ownerIsOnLeave: lead.ownerIsOnLeave,
    createdByUserId: lead.createdByUserId,
    createdByName: lead.createdByName,
    lastModifiedByUserId: lead.lastModifiedByUserId,
    lastModifiedByName: lead.lastModifiedByName,
    opportunityId: lead.opportunityId ?? null,
    designJobId: lead.designJobId ?? null,
    designStatus: lead.designStatus ?? null,
    purposeId: lead.purposeId,
    purposeName: lead.purposeName,
    sectorId: lead.sectorId,
    sectorName: lead.sectorName,
    rowVersion: lead.rowVersion,
    createdAt: lead.createdAt,
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
    } : {}),
  };
}

function opportunityDto(opportunity: {
  id: string; leadId: string; customerId: string; siteId: string | null; title: string;
  commercialState: 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold'; rowVersion: number;
  leadNumber?: string; leadStage?: string; customerName?: string; siteName?: string | null;
  ownerName?: string; designJobId?: string | null; designStatus?: string | null;
  attachmentCount?: number; createdAt?: Date; updatedAt: Date;
}) {
  return {
    id: opportunity.id,
    leadId: opportunity.leadId,
    leadNumber: opportunity.leadNumber,
    leadStage: opportunity.leadStage,
    title: opportunity.title,
    customerId: opportunity.customerId,
    customerName: opportunity.customerName,
    siteId: opportunity.siteId,
    siteName: opportunity.siteName ?? null,
    ownerName: opportunity.ownerName,
    designJobId: opportunity.designJobId ?? null,
    designStatus: opportunity.designStatus ?? null,
    attachmentCount: opportunity.attachmentCount,
    commercialState: opportunity.commercialState,
    rowVersion: opportunity.rowVersion,
    createdAt: opportunity.createdAt,
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

function opportunityAttachmentDto(attachment: {
  id: string; opportunityId: string; originalName: string; mimeType: string; sizeBytes: number; checksumSha256: string;
  uploadedByUserId: string; createdAt: Date; uploadedByName?: string;
}) {
  return {
    id: attachment.id,
    opportunityId: attachment.opportunityId,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksumSha256: attachment.checksumSha256,
    uploadedByUserId: attachment.uploadedByUserId,
    uploadedByName: attachment.uploadedByName,
    createdAt: attachment.createdAt,
  };
}

function designJobDto(job: {
  id: string; leadId: string; opportunityId: string; title: string; status: string;
  designerUserId: string | null; designHeadUserId: string; surveyRequested: boolean;
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
    maxFiles: 10,
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

  router.get('/classifications/:type', requirePermission('crm.service_category.read'), async (request, response) => {
    const { type } = classificationTypeParamsSchema.parse(request.params);
    const includeInactive = request.query.includeInactive === 'true';
    const items = await crmService.listClassifications(getPrincipal(request), type, includeInactive);
    sendData(request, response, { items: items.map(classificationDto) });
  });
  router.post('/classifications/:type', requireCsrf, requirePermission('crm.service_category.manage'), async (request, response) => {
    const { type } = classificationTypeParamsSchema.parse(request.params);
    const classification = await crmService.createClassification(
      getPrincipal(request), type, classificationInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { classification: classificationDto(classification) }, 201);
  });
  router.post('/classifications/:type/:id/deactivate', requireCsrf, requirePermission('crm.service_category.manage'), async (request, response) => {
    const { type } = classificationTypeParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    const input = versionedReasonSchema.parse(request.body);
    const classification = await crmService.deactivateClassification(
      getPrincipal(request), type, id, input.expectedVersion, input.reason, getRequestId(request),
    );
    sendData(request, response, { classification: classificationDto(classification) });
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
  router.post('/customers/duplicate-hints', requireCsrf, async (request, response) => {
    const principal = getPrincipal(request);
    if (
      !hasPermission(principal, 'crm.customer.read') &&
      !hasPermission(principal, 'crm.lead.qualify') &&
      !hasPermission(principal, 'crm.lead.write')
    ) {
      throw new AppError('FORBIDDEN', 'You do not have permission to check customer duplicates.', 403);
    }
    const hints = await crmService.checkDuplicateHints(principal, duplicateHintsInputSchema.parse(request.body));
    sendData(request, response, { hints });
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
  router.get('/leads/filter-options', requirePermission('crm.lead.read'), async (request, response) => {
    sendData(request, response, await crmService.listLeadFilterOptions(getPrincipal(request)));
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
    async (request, _response) => {
      const { leadId } = leadChildParamsSchema.parse(request.params);
      await crmService.getLead(getPrincipal(request), leadId);
      throw new AppError(
        'LEAD_ATTACHMENTS_DISABLED',
        'Attachments are disabled on raw leads. Upload documents when converting the lead to an opportunity.',
        409,
      );
    },
  );
  router.get('/leads/:leadId/attachments/:attachmentId/download', requirePermission('crm.lead.read'), async (request, response, next) => {
    const { leadId, attachmentId } = leadAttachmentParamsSchema.parse(request.params);
    const attachment = await crmService.getAttachment(getPrincipal(request), leadId, attachmentId);
    const filePath = resolvePrivateFile(attachment.storageName);
    if (request.query.inline === '1') {
      response
        .status(200)
        .setHeader('Content-Type', attachment.mimeType)
        .setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`)
        .setHeader('X-Content-Type-Options', 'nosniff')
        .setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'self'; frame-ancestors 'self'; sandbox")
        .sendFile(filePath, { dotfiles: 'allow' }, (error) => {
          if (error && !response.headersSent) next(error);
        });
      return;
    }
    response.download(filePath, attachment.originalName, (error) => {
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

  const maybeUploadOpportunityFiles = (request: Request, response: Response, next: NextFunction) => {
    if (request.is('multipart/form-data')) {
      attachmentUpload.array('files', 10)(request, response, next);
      return;
    }
    next();
  };

  const handleQualifyLead = async (request: Request, response: Response) => {
    const files = Array.isArray(request.files) ? request.files : [];
    try {
      const { id } = idParamsSchema.parse(request.params);
      let rawBody: unknown = request.body;
      if (typeof request.body?.payload === 'string') {
        try {
          rawBody = JSON.parse(request.body.payload);
        } catch {
          throw new AppError('VALIDATION_ERROR', 'Invalid conversion payload.', 422);
        }
      }
      const input = qualifyLeadInputSchema.parse(rawBody);
      const result = await crmService.qualifyLead(
        getPrincipal(request), id, input, getRequestId(request), files,
      );
      sendData(
        request,
        response,
        {
          opportunity: opportunityDto(result.opportunity),
          attachments: result.attachments.map(opportunityAttachmentDto),
          replayed: result.replayed,
        },
        result.replayed ? 200 : 201,
      );
    } catch (error) {
      await Promise.all(files.map((file) => removePrivateFile(file.filename)));
      throw error;
    }
  };

  router.post('/leads/:id/qualify', requireCsrf, requirePermission('crm.lead.qualify'), maybeUploadOpportunityFiles, handleQualifyLead);
  router.post('/leads/:id/convert', requireCsrf, requirePermission('crm.lead.qualify'), maybeUploadOpportunityFiles, handleQualifyLead);
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
  router.get('/opportunities/:opportunityId', requirePermission('crm.opportunity.read'), async (request, response) => {
    const { opportunityId } = opportunityChildParamsSchema.parse(request.params);
    sendData(request, response, { opportunity: await crmService.getOpportunityDetail(getPrincipal(request), opportunityId) });
  });
  router.get('/opportunities/:opportunityId/attachments', async (request, response) => {
    const { opportunityId } = opportunityChildParamsSchema.parse(request.params);
    const items = await crmService.listOpportunityAttachments(getPrincipal(request), opportunityId);
    sendData(request, response, { items: items.map(opportunityAttachmentDto) });
  });
  router.post(
    '/opportunities/:opportunityId/attachments',
    requireCsrf,
    attachmentUpload.array('files', 10),
    async (request, response) => {
      const files = Array.isArray(request.files) ? request.files : [];
      try {
        const { opportunityId } = opportunityChildParamsSchema.parse(request.params);
        const items = await crmService.createOpportunityAttachments(
          getPrincipal(request), opportunityId, files, getRequestId(request),
        );
        sendData(request, response, { items: items.map(opportunityAttachmentDto) }, 201);
      } catch (error) {
        await Promise.all(files.map((file) => removePrivateFile(file.filename)));
        throw error;
      }
    },
  );
  router.get('/opportunities/:opportunityId/attachments/:attachmentId/download', async (request, response, next) => {
    const { opportunityId, attachmentId } = opportunityAttachmentParamsSchema.parse(request.params);
    const attachment = await crmService.getOpportunityAttachment(getPrincipal(request), opportunityId, attachmentId);
    const filePath = resolvePrivateFile(attachment.storageName);
    if (request.query.inline === '1') {
      response
        .status(200)
        .setHeader('Content-Type', attachment.mimeType)
        .setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`)
        .setHeader('X-Content-Type-Options', 'nosniff')
        .setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'self'; frame-ancestors 'self'; sandbox")
        .sendFile(filePath, { dotfiles: 'allow' }, (error) => {
          if (error && !response.headersSent) next(error);
        });
      return;
    }
    response.download(filePath, attachment.originalName, (error) => {
      if (error && !response.headersSent) next(error);
    });
  });

  return router;
}
