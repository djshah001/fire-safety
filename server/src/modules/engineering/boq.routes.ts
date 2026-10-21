import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  boqLineParamsSchema,
  boqParamsSchema,
  boqQuantityInputSchema,
  boqReviewSchema,
  boqTemplateInputSchema,
  boqTemplateParamsSchema,
  createBoqSchema,
  deleteLineSchema,
  estimateLineInputSchema,
  estimateLineUpdateSchema,
  itemCatalogQuerySchema,
  versionInputSchema,
} from './boq.schemas.js';
import { boqService } from './boq.service.js';
import { designJobParamsSchema } from './engineering.schemas.js';

export function createBoqRouter() {
  const router = Router();
  router.use(requireAuthentication);

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

  router.patch('/design-jobs/:jobId/boqs/:boqId/lines/:lineId', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    const line = await boqService.saveQuantity(getPrincipal(request), jobId, boqId, lineId, boqQuantityInputSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/estimate-lines', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const line = await boqService.saveEstimateLine(getPrincipal(request), jobId, boqId, undefined, estimateLineInputSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line }, 201);
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/estimate-lines/:lineId', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    const line = await boqService.saveEstimateLine(getPrincipal(request), jobId, boqId, lineId, estimateLineUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line });
  });

  router.delete('/design-jobs/:jobId/boqs/:boqId/estimate-lines/:lineId', requireCsrf, requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    await boqService.deleteEstimateLine(getPrincipal(request), jobId, boqId, lineId, deleteLineSchema.parse(request.body), getRequestId(request));
    response.status(204).end();
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
