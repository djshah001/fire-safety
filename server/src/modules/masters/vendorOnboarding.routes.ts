import { Router } from 'express';
import { AppError } from '../../core/errors/appError.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { createPrivateUpload } from '../../infrastructure/storage/localFileStorage.js';
import { onboardingTokenParamsSchema, vendorCreateSchema } from './masters.schemas.js';
import { mastersService } from './masters.service.js';

const publicDocUpload = createPrivateUpload({
  allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  maxFileBytes: 20 * 1024 * 1024,
});

export function createPublicVendorOnboardingRouter() {
  const router = Router();

  router.get('/:token', async (request, response) => {
    const { token } = onboardingTokenParamsSchema.parse(request.params);
    const data = await mastersService.getPublicOnboardingInvitation(token);
    sendData(request, response, data);
  });

  router.post('/:token/submit', async (request, response) => {
    const { token } = onboardingTokenParamsSchema.parse(request.params);
    const input = vendorCreateSchema.parse(request.body);
    const result = await mastersService.submitPublicOnboarding(token, input, getRequestId(request));
    sendData(request, response, result, 201);
  });

  router.post('/:token/documents', publicDocUpload.single('file'), async (request, response) => {
    const { token } = onboardingTokenParamsSchema.parse(request.params);
    const documentType = (request.body.documentType as string) || 'other';
    if (!request.file) throw new AppError('VALIDATION_ERROR', 'Choose a file to upload.', 422);
    const document = await mastersService.uploadPublicOnboardingDocument(token, documentType, request.file);
    sendData(request, response, { document }, 201);
  });

  return router;
}

