import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  boqAddLinesSchema,
  boqApplyTemplateSchema,
  boqBatchQuantitiesSchema,
  boqBulkDeleteLinesSchema,
  boqBulkMarkupSchema,
  boqBulkUpdateLinesSchema,
  boqLineParamsSchema,
  boqMarkupInputSchema,
  boqParamsSchema,
  boqQuantityInputSchema,
  boqReassignChainSchema,
  boqReorderLinesSchema,
  boqReviewSchema,
  boqRevisionLineParamsSchema,
  boqRevisionParamsSchema,
  boqTemplateInputSchema,
  boqTemplateParamsSchema,
  createBoqSchema,
  itemCatalogQuerySchema,
  versionInputSchema,
} from './boq.schemas.js';
import { boqService } from './boq.service.js';
import { designJobParamsSchema } from './engineering.schemas.js';

export function createBoqRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/design-jobs/:jobId/boqs/:boqId/export.pdf', async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    response.setHeader('Cache-Control', 'private, no-store');
    response.type('application/pdf').attachment(`BOQ-${boqId}.pdf`).send(await boqService.exportPdf(getPrincipal(request), jobId, boqId));
  });

  router.get('/design-jobs/:jobId/boqs', async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    sendData(request, response, await boqService.getWorkspace(getPrincipal(request), jobId));
  });

  router.get('/boq-templates', requirePermission('engineering.boq.template.manage'), async (request, response) => {
    sendData(request, response, { items: await boqService.listTemplates(getPrincipal(request)) });
  });

  router.get('/boq-templates/options', requirePermission('engineering.boq.template.manage'), async (request, response) => {
    sendData(request, response, await boqService.templateOptions(getPrincipal(request)));
  });

  router.post('/boq-templates', requireCsrf, requirePermission('engineering.boq.template.manage'), async (request, response) => {
    const template = await boqService.saveTemplate(
      getPrincipal(request), undefined, boqTemplateInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { template }, 201);
  });

  router.patch('/boq-templates/:templateId', requireCsrf, requirePermission('engineering.boq.template.manage'), async (request, response) => {
    const { templateId } = boqTemplateParamsSchema.parse(request.params);
    const template = await boqService.saveTemplate(
      getPrincipal(request), templateId, boqTemplateInputSchema.parse(request.body), getRequestId(request),
    );
    sendData(request, response, { template });
  });

  router.get('/design-jobs/:jobId/boq-items', async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    const { search } = itemCatalogQuerySchema.parse(request.query);
    sendData(request, response, { items: await boqService.listCatalog(getPrincipal(request), jobId, search) });
  });

  router.post('/design-jobs/:jobId/boqs', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    const revision = await boqService.createRevision(getPrincipal(request), jobId, createBoqSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision }, 201);
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/lines/reorder', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.reorderLines(getPrincipal(request), jobId, boqId, boqReorderLinesSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/boqs/:boqId/lines/reorder', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.reorderLines(principal, jobId, boqId, boqReorderLinesSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/lines/quantities', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.saveQuantitiesBatch(getPrincipal(request), jobId, boqId, boqBatchQuantitiesSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/boqs/:boqId/lines/quantities', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.saveQuantitiesBatch(principal, jobId, boqId, boqBatchQuantitiesSchema.parse(request.body), getRequestId(request)));
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/apply-template', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.applyTemplate(getPrincipal(request), jobId, boqId, boqApplyTemplateSchema.parse(request.body), getRequestId(request)));
  });

  router.post('/boqs/:boqId/apply-template', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.applyTemplate(principal, jobId, boqId, boqApplyTemplateSchema.parse(request.body), getRequestId(request)));
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/lines', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.addLines(getPrincipal(request), jobId, boqId, boqAddLinesSchema.parse(request.body), getRequestId(request)), 201);
  });

  router.post('/boqs/:boqId/lines', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.addLines(principal, jobId, boqId, boqAddLinesSchema.parse(request.body), getRequestId(request)), 201);
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/lines/bulk-delete', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.bulkDeleteLines(getPrincipal(request), jobId, boqId, boqBulkDeleteLinesSchema.parse(request.body), getRequestId(request)));
  });

  router.post('/boqs/:boqId/lines/bulk-delete', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.bulkDeleteLines(principal, jobId, boqId, boqBulkDeleteLinesSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/lines/bulk-update', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.bulkUpdateLines(getPrincipal(request), jobId, boqId, boqBulkUpdateLinesSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/boqs/:boqId/lines/bulk-update', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.bulkUpdateLines(principal, jobId, boqId, boqBulkUpdateLinesSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/lines/:lineId', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    const line = await boqService.saveQuantity(getPrincipal(request), jobId, boqId, lineId, boqQuantityInputSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line });
  });

  router.delete('/design-jobs/:jobId/boqs/:boqId/lines/:lineId', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    const { expectedVersion } = versionInputSchema.parse(request.body?.expectedVersion !== undefined ? request.body : { expectedVersion: request.query.expectedVersion });
    sendData(request, response, await boqService.removeLine(getPrincipal(request), jobId, boqId, lineId, expectedVersion, getRequestId(request)));
  });

  router.delete('/boqs/:boqId/lines/:lineId', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId, lineId } = boqRevisionLineParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    const { expectedVersion } = versionInputSchema.parse(request.body?.expectedVersion !== undefined ? request.body : { expectedVersion: request.query.expectedVersion });
    sendData(request, response, await boqService.removeLine(principal, jobId, boqId, lineId, expectedVersion, getRequestId(request)));
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/costing/bulk-markup', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, await boqService.bulkMarkup(getPrincipal(request), jobId, boqId, boqBulkMarkupSchema.parse(request.body), getRequestId(request)));
  });

  router.patch('/boqs/:boqId/costing/bulk-markup', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, await boqService.bulkMarkup(principal, jobId, boqId, boqBulkMarkupSchema.parse(request.body), getRequestId(request)));
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/costing/refresh-rates', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const { expectedVersion } = versionInputSchema.parse(request.body);
    sendData(request, response, await boqService.refreshCostingRates(getPrincipal(request), jobId, boqId, expectedVersion, getRequestId(request)));
  });

  router.post('/boqs/:boqId/costing/refresh-rates', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    const { expectedVersion } = versionInputSchema.parse(request.body);
    sendData(request, response, await boqService.refreshCostingRates(principal, jobId, boqId, expectedVersion, getRequestId(request)));
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/reassign-chain', requireCsrf, requirePermission('system.access.all'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    sendData(request, response, { revision: await boqService.reassignChain(getPrincipal(request), jobId, boqId, boqReassignChainSchema.parse(request.body), getRequestId(request)) });
  });

  router.patch('/boqs/:boqId/reassign-chain', requireCsrf, requirePermission('system.access.all'), async (request, response) => {
    const principal = getPrincipal(request);
    const { boqId } = boqRevisionParamsSchema.parse(request.params);
    const jobId = await boqService.resolveJobIdForBoq(principal, boqId);
    sendData(request, response, { revision: await boqService.reassignChain(principal, jobId, boqId, boqReassignChainSchema.parse(request.body), getRequestId(request)) });
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/cost-lines/:lineId/markup', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    const line = await boqService.saveMarkup(getPrincipal(request), jobId, boqId, lineId, boqMarkupInputSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/submit', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.submitQuantities(getPrincipal(request), jobId, boqId, versionInputSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/submit-costing', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.submitCosting(getPrincipal(request), jobId, boqId, versionInputSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/purchase-review', requireCsrf, requirePermission('engineering.boq.purchase_review'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.purchaseReview(getPrincipal(request), jobId, boqId, boqReviewSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/final-review', requireCsrf, requirePermission('engineering.boq.final_review'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.finalReview(getPrincipal(request), jobId, boqId, boqReviewSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/review', requireCsrf, requirePermission('engineering.design.review'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.legacyReview(getPrincipal(request), jobId, boqId, boqReviewSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  return router;
}
