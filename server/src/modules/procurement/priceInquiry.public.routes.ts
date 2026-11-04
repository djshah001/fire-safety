import { Router } from 'express';
import { sendData } from '../../core/http/response.js';
import { priceInquiryTokenParamsSchema, submitPriceResponseSchema } from './priceInquiry.schemas.js';
import { priceInquiryService } from './priceInquiry.service.js';

export function createPublicPriceInquiryRouter() {
  const router = Router();

  router.get('/:token', async (request, response) => {
    const { token } = priceInquiryTokenParamsSchema.parse(request.params);
    const data = await priceInquiryService.getPublicInquiry(token);
    sendData(request, response, data);
  });

  router.post('/:token/submit', async (request, response) => {
    const { token } = priceInquiryTokenParamsSchema.parse(request.params);
    const input = submitPriceResponseSchema.parse(request.body);
    const result = await priceInquiryService.submitPublicResponse(token, input);
    sendData(request, response, result, 201);
  });

  return router;
}

