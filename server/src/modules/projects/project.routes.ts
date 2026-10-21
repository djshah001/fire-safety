import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { projectListQuerySchema, projectParamsSchema, projectStartOptionsParamsSchema, startProjectSchema } from './project.schemas.js';
import { projectService } from './project.service.js';

export function createProjectRouter() {
  const router = Router();
  router.use(requireAuthentication);
  router.get('/', requirePermission('project.read'), async (request, response) => sendData(request, response, await projectService.list(getPrincipal(request), projectListQuerySchema.parse(request.query))));
  router.get('/start-options/:jobId', requirePermission('project.start'), async (request, response) => { const { jobId } = projectStartOptionsParamsSchema.parse(request.params); sendData(request, response, await projectService.startOptions(getPrincipal(request), jobId)); });
  router.post('/from-design/:jobId', requireCsrf, requirePermission('project.start'), async (request, response) => { const { jobId } = projectStartOptionsParamsSchema.parse(request.params); sendData(request, response, await projectService.start(getPrincipal(request), jobId, startProjectSchema.parse(request.body), getRequestId(request)), 201); });
  router.get('/:projectId', requirePermission('project.read'), async (request, response) => { const { projectId } = projectParamsSchema.parse(request.params); sendData(request, response, await projectService.get(getPrincipal(request), projectId)); });
  return router;
}
