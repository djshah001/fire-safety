import { Router } from 'express';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { notificationListQuerySchema, notificationParamsSchema, markNotificationReadSchema } from './notification.schemas.js';
import { notificationService } from './notification.service.js';

export function createNotificationRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', async (request, response) => {
    sendData(request, response, await notificationService.list(getPrincipal(request), notificationListQuerySchema.parse(request.query)));
  });

  router.get('/summary', async (request, response) => {
    sendData(request, response, await notificationService.summary(getPrincipal(request)));
  });

  router.post('/read-all', requireCsrf, async (request, response) => {
    sendData(request, response, await notificationService.markAllRead(getPrincipal(request)));
  });

  router.post('/:notificationId/read', requireCsrf, async (request, response) => {
    const { notificationId } = notificationParamsSchema.parse(request.params);
    const { expectedVersion } = markNotificationReadSchema.parse(request.body);
    sendData(request, response, { notification: await notificationService.markRead(getPrincipal(request), notificationId, expectedVersion) });
  });

  return router;
}
