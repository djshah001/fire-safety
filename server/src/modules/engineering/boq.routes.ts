import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  boqLineInputSchema,
  boqLineParamsSchema,
  boqLineUpdateSchema,
  boqParamsSchema,
  boqReviewSchema,
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

  router.get('/design-jobs/:jobId/boq-items', async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    const { search } = itemCatalogQuerySchema.parse(request.query);
    sendData(request, response, { items: await boqService.listCatalog(getPrincipal(request), jobId, search) });
  });

  router.post('/design-jobs/:jobId/boqs', requireCsrf, requirePermission('engineering.design.write'), requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    const revision = await boqService.createRevision(getPrincipal(request), jobId, createBoqSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision }, 201);
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/lines', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const line = await boqService.saveTechnicalLine(getPrincipal(request), jobId, boqId, undefined, boqLineInputSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line }, 201);
  });

  router.patch('/design-jobs/:jobId/boqs/:boqId/lines/:lineId', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    const line = await boqService.saveTechnicalLine(getPrincipal(request), jobId, boqId, lineId, boqLineUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { line });
  });

  router.delete('/design-jobs/:jobId/boqs/:boqId/lines/:lineId', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, boqId, lineId } = boqLineParamsSchema.parse(request.params);
    await boqService.deleteTechnicalLine(getPrincipal(request), jobId, boqId, lineId, deleteLineSchema.parse(request.body), getRequestId(request));
    response.status(204).end();
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

  router.post('/design-jobs/:jobId/boqs/:boqId/submit', requireCsrf, requirePermission('engineering.design.write'), requirePermission('engineering.estimate.write'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.submit(getPrincipal(request), jobId, boqId, versionInputSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/boqs/:boqId/review', requireCsrf, requirePermission('engineering.design.review'), async (request, response) => {
    const { jobId, boqId } = boqParamsSchema.parse(request.params);
    const revision = await boqService.review(getPrincipal(request), jobId, boqId, boqReviewSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  return router;
}
