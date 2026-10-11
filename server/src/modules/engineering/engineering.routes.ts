import { Router } from 'express';
import { AppError } from '../../core/errors/appError.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { createPrivateUpload, resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  createRevisionSchema,
  customerDecisionSchema,
  designFileParamsSchema,
  designJobListQuerySchema,
  designJobParamsSchema,
  revisionParamsSchema,
  reviewRevisionSchema,
  sendToCustomerSchema,
  submitRevisionSchema,
} from './engineering.schemas.js';
import { engineeringService } from './engineering.service.js';

const cadUpload = createPrivateUpload({
  allowedMimeTypes: new Set(['application/acad', 'application/x-acad', 'application/autocad_dwg', 'application/dwg', 'application/dxf', 'image/vnd.dwg', 'image/vnd.dxf', 'application/octet-stream']),
  maxFileBytes: 100 * 1024 * 1024,
});
const pdfUpload = createPrivateUpload({ allowedMimeTypes: new Set(['application/pdf']), maxFileBytes: 20 * 1024 * 1024 });

export function createEngineeringRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/design-jobs', async (request, response) => {
    sendData(request, response, await engineeringService.listJobs(getPrincipal(request), designJobListQuerySchema.parse(request.query)));
  });

  router.get('/design-jobs/:jobId', async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    sendData(request, response, await engineeringService.getJob(getPrincipal(request), jobId));
  });

  router.post('/design-jobs/:jobId/revisions', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId } = designJobParamsSchema.parse(request.params);
    const revision = await engineeringService.createRevision(getPrincipal(request), jobId, createRevisionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision }, 201);
  });

  const uploadRoute = (kind: 'cad' | 'pdf') => [
    requireCsrf,
    requirePermission('engineering.design.write'),
    (kind === 'cad' ? cadUpload : pdfUpload).single('file'),
    async (request: Parameters<Parameters<typeof router.post>[1]>[0], response: Parameters<Parameters<typeof router.post>[1]>[1]) => {
      const { jobId, revisionId } = revisionParamsSchema.parse(request.params);
      if (!request.file) throw new AppError('VALIDATION_ERROR', 'Choose a file to upload.', 422);
      const file = await engineeringService.uploadFile(getPrincipal(request), jobId, revisionId, kind, request.file, getRequestId(request));
      sendData(request, response, { file }, 201);
    },
  ] as const;

  router.post('/design-jobs/:jobId/revisions/:revisionId/files/cad', ...uploadRoute('cad'));
  router.post('/design-jobs/:jobId/revisions/:revisionId/files/pdf', ...uploadRoute('pdf'));

  router.post('/design-jobs/:jobId/revisions/:revisionId/submit', requireCsrf, requirePermission('engineering.design.write'), async (request, response) => {
    const { jobId, revisionId } = revisionParamsSchema.parse(request.params);
    const revision = await engineeringService.submitRevision(getPrincipal(request), jobId, revisionId, submitRevisionSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/revisions/:revisionId/review', requireCsrf, requirePermission('engineering.design.review'), async (request, response) => {
    const { jobId, revisionId } = revisionParamsSchema.parse(request.params);
    const revision = await engineeringService.reviewRevision(getPrincipal(request), jobId, revisionId, reviewRevisionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/revisions/:revisionId/send-to-customer', requireCsrf, requirePermission('engineering.design.customer_decision'), async (request, response) => {
    const { jobId, revisionId } = revisionParamsSchema.parse(request.params);
    const revision = await engineeringService.sendToCustomer(getPrincipal(request), jobId, revisionId, sendToCustomerSchema.parse(request.body).expectedVersion, getRequestId(request));
    sendData(request, response, { revision });
  });

  router.post('/design-jobs/:jobId/revisions/:revisionId/customer-decision', requireCsrf, requirePermission('engineering.design.customer_decision'), async (request, response) => {
    const { jobId, revisionId } = revisionParamsSchema.parse(request.params);
    const revision = await engineeringService.recordCustomerDecision(getPrincipal(request), jobId, revisionId, customerDecisionSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { revision });
  });

  router.get('/design-jobs/:jobId/revisions/:revisionId/files/:fileId', async (request, response, next) => {
    const { jobId, revisionId, fileId } = designFileParamsSchema.parse(request.params);
    const file = await engineeringService.getFile(getPrincipal(request), jobId, revisionId, fileId);
    const filePath = resolvePrivateFile(file.storageName);
    if (file.kind === 'pdf') {
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; sandbox");
      response.sendFile(filePath, (error) => { if (error && !response.headersSent) next(error); });
      return;
    }
    response.download(filePath, file.originalName, (error) => { if (error && !response.headersSent) next(error); });
  });

  return router;
}
