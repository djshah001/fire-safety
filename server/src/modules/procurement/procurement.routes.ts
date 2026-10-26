import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  createRequisitionSchema,
  createRfqSchema,
  createVendorOfferSchema,
  requisitionListQuerySchema,
  requisitionParamsSchema,
  selectVendorOfferSchema,
  substitutionDecisionSchema,
  substitutionReviewListQuerySchema,
  substitutionReviewParamsSchema,
} from './procurement.schemas.js';
import { procurementService } from './procurement.service.js';

export function createProcurementRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/requisitions', requirePermission('procurement.sourcing.read'), async (request, response) => {
    sendData(request, response, await procurementService.list(getPrincipal(request), requisitionListQuerySchema.parse(request.query)));
  });

  router.get('/requisitions/create-options', requirePermission('procurement.requisition.create'), async (request, response) => {
    sendData(request, response, await procurementService.createOptions(getPrincipal(request)));
  });

  router.post('/requisitions', requireCsrf, requirePermission('procurement.requisition.create'), async (request, response) => {
    const requisition = await procurementService.create(getPrincipal(request), createRequisitionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { requisition }, 201);
  });

  router.get('/requisitions/:requisitionId', requirePermission('procurement.sourcing.read'), async (request, response) => {
    const { requisitionId } = requisitionParamsSchema.parse(request.params);
    sendData(request, response, await procurementService.get(getPrincipal(request), requisitionId));
  });

  router.post('/requisitions/:requisitionId/rfq', requireCsrf, requirePermission('procurement.rfq.manage'), async (request, response) => {
    const { requisitionId } = requisitionParamsSchema.parse(request.params);
    const rfq = await procurementService.createRfq(getPrincipal(request), requisitionId, createRfqSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { rfq }, 201);
  });

  router.post('/requisitions/:requisitionId/offers', requireCsrf, requirePermission('procurement.offer.manage'), async (request, response) => {
    const { requisitionId } = requisitionParamsSchema.parse(request.params);
    const offer = await procurementService.recordOffer(getPrincipal(request), requisitionId, createVendorOfferSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { offer }, 201);
  });

  router.post('/requisitions/:requisitionId/select', requireCsrf, requirePermission('procurement.comparison.select'), async (request, response) => {
    const { requisitionId } = requisitionParamsSchema.parse(request.params);
    const selection = await procurementService.selectOffer(getPrincipal(request), requisitionId, selectVendorOfferSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { selection });
  });

  router.get('/substitution-reviews', requirePermission('procurement.substitution.review'), async (request, response) => {
    sendData(request, response, await procurementService.listSubstitutionReviews(getPrincipal(request), substitutionReviewListQuerySchema.parse(request.query)));
  });

  router.get('/substitution-reviews/:requisitionId', requirePermission('procurement.substitution.review'), async (request, response) => {
    const { requisitionId } = requisitionParamsSchema.parse(request.params);
    sendData(request, response, await procurementService.getSubstitutionReview(getPrincipal(request), requisitionId));
  });

  router.post('/substitution-reviews/:requisitionId/lines/:offerLineId/decision', requireCsrf, requirePermission('procurement.substitution.review'), async (request, response) => {
    const { requisitionId, offerLineId } = substitutionReviewParamsSchema.parse(request.params);
    const review = await procurementService.reviewSubstitution(getPrincipal(request), requisitionId, offerLineId, substitutionDecisionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { review }, 201);
  });

  return router;
}
