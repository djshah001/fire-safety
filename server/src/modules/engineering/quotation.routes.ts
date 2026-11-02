import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { designJobParamsSchema } from './engineering.schemas.js';
import {
  createQuotationRevisionSchema,
  paymentPlanSchema,
  quotationCustomerDecisionSchema,
  quotationDocumentParamsSchema,
  quotationDocumentDetailsSchema,
  quotationHeaderSchema,
  quotationLineParamsSchema,
  quotationLineSchema,
  quotationListQuerySchema,
  quotationParamsSchema,
  quotationReviewSchema,
  quotationVersionSchema,
} from './quotation.schemas.js';
import { quotationService } from './quotation.service.js';

export function createQuotationRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/quotations', requirePermission('engineering.quotation.read'), async (request, response) => {
    sendData(request, response, await quotationService.listQueue(getPrincipal(request), quotationListQuerySchema.parse(request.query)));
  });

  router.patch('/design-jobs/:jobId/quotations/:revisionId/document-details', requireCsrf, requirePermission('engineering.quotation.write'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    sendData(request, response, { revision: await quotationService.updateDocumentDetails(getPrincipal(request), jobId, revisionId, quotationDocumentDetailsSchema.parse(request.body), getRequestId(request)) });
  });

  router.get('/design-jobs/:jobId/quotations/:revisionId/preview.pdf', requirePermission('engineering.quotation.read'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; sandbox");
    response.type('application/pdf').send(await quotationService.previewPdf(getPrincipal(request), jobId, revisionId));
  });

  router.get('/design-jobs/:jobId/quotations', requirePermission('engineering.quotation.read'), async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    sendData(request, response, await quotationService.getWorkspace(getPrincipal(request), jobId));
  });

  router.post('/design-jobs/:jobId/quotations', requireCsrf, requirePermission('engineering.quotation.write'), async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    const result = await quotationService.createRevision(getPrincipal(request), jobId, createQuotationRevisionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, result, 201);
  });

  router.patch('/design-jobs/:jobId/quotations/:revisionId', requireCsrf, requirePermission('engineering.quotation.write'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const revision = await quotationService.updateHeader(getPrincipal(request), jobId, revisionId, quotationHeaderSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.patch('/design-jobs/:jobId/quotations/:revisionId/lines/:lineId', requireCsrf, requirePermission('engineering.quotation.write'), async (request, response) => {
    const { jobId, revisionId, lineId } = quotationLineParamsSchema.parse(request.params);
    const line = await quotationService.updateLine(getPrincipal(request), jobId, revisionId, lineId, quotationLineSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line });
  });

  router.patch('/design-jobs/:jobId/quotations/:revisionId/payment-plan', requireCsrf, requirePermission('engineering.payment_plan.write'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const revision = await quotationService.updatePaymentPlan(getPrincipal(request), jobId, revisionId, paymentPlanSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/quotations/:revisionId/submit', requireCsrf, requirePermission('engineering.quotation.write'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const revision = await quotationService.submit(getPrincipal(request), jobId, revisionId, quotationVersionSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/quotations/:revisionId/review', requireCsrf, requirePermission('engineering.quotation.approve'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const revision = await quotationService.review(getPrincipal(request), jobId, revisionId, quotationReviewSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/quotations/:revisionId/issue', requireCsrf, requirePermission('engineering.quotation.issue'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const result = await quotationService.issue(getPrincipal(request), jobId, revisionId, quotationVersionSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, result);
  });

  router.post('/design-jobs/:jobId/quotations/:revisionId/customer-decision', requireCsrf, requirePermission('engineering.quotation.customer_decision'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const revision = await quotationService.recordCustomerDecision(getPrincipal(request), jobId, revisionId, quotationCustomerDecisionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.get('/design-jobs/:jobId/quotations/:revisionId/export.xlsx', requirePermission('engineering.quotation.read'), async (request, response) => {
    const { jobId, revisionId } = quotationParamsSchema.parse(request.params);
    const result = await quotationService.exportExcel(getPrincipal(request), jobId, revisionId);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
    response.send(result.buffer);
  });

  router.get('/design-jobs/:jobId/quotations/:revisionId/documents/:documentId', requirePermission('engineering.quotation.read'), async (request, response, next) => {
    const { jobId, revisionId, documentId } = quotationDocumentParamsSchema.parse(request.params);
    const document = await quotationService.getDocument(getPrincipal(request), jobId, revisionId, documentId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalName)}"`);
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; sandbox");
    // The configured private upload root may be inside a dot-directory. The
    // service has already authorized this exact generated storage name.
    response.sendFile(resolvePrivateFile(document.storageName), { dotfiles: 'allow' }, (error) => { if (error && !response.headersSent) next(error); });
  });

  return router;
}
