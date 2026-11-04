import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  createPriceInquirySchema,
  inviteVendorSchema,
  priceInquiryInvitationParamsSchema,
  priceInquiryListQuerySchema,
  priceInquiryParamsSchema,
} from './priceInquiry.schemas.js';
import { priceInquiryService } from './priceInquiry.service.js';

export function createPriceInquiryRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/price-inquiries', requirePermission('procurement.sourcing.read'), async (request, response) => {
    sendData(
      request,
      response,
      await priceInquiryService.listInquiries(
        getPrincipal(request),
        priceInquiryListQuerySchema.parse(request.query),
      ),
    );
  });

  router.post('/price-inquiries', requireCsrf, requirePermission('procurement.rfq.manage'), async (request, response) => {
    const result = await priceInquiryService.createInquiry(
      getPrincipal(request),
      createPriceInquirySchema.parse(request.body),
      getRequestId(request),
    );
    sendData(request, response, result, 201);
  });

  router.get('/price-inquiries/:inquiryId', requirePermission('procurement.sourcing.read'), async (request, response) => {
    const { inquiryId } = priceInquiryParamsSchema.parse(request.params);
    sendData(request, response, await priceInquiryService.getInquiry(getPrincipal(request), inquiryId));
  });

  router.post('/price-inquiries/:inquiryId/invite', requireCsrf, requirePermission('procurement.rfq.manage'), async (request, response) => {
    const { inquiryId } = priceInquiryParamsSchema.parse(request.params);
    const result = await priceInquiryService.inviteVendor(
      getPrincipal(request),
      inquiryId,
      inviteVendorSchema.parse(request.body),
      getRequestId(request),
    );
    sendData(request, response, result, 201);
  });

  router.post(
    '/price-inquiries/:inquiryId/invitations/:invitationId/send-msg91',
    requireCsrf,
    requirePermission('procurement.rfq.manage'),
    async (request, response) => {
      const { inquiryId, invitationId } = priceInquiryInvitationParamsSchema.parse(request.params);
      const result = await priceInquiryService.sendMsg91(getPrincipal(request), inquiryId, invitationId);
      sendData(request, response, result);
    },
  );

  return router;
}

