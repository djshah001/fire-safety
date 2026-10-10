import { Router } from 'express';
import { sendData } from '../../core/http/response.js';

export type ReadinessCheck = () => Promise<void>;

export function createHealthRouter(checkReadiness: ReadinessCheck) {
  const router = Router();

  router.get('/live', (request, response) => {
    sendData(request, response, {
      service: 'fire-safety-api' as const,
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', async (request, response) => {
    try {
      await checkReadiness();
      sendData(request, response, {
        service: 'fire-safety-api' as const,
        status: 'ready' as const,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      request.log.warn({ err: error }, 'Readiness check failed');
      response.status(503).json({
        error: { code: 'NOT_READY', message: 'The API is not ready to serve database-backed requests.' },
        requestId: request.id,
      });
    }
  });

  return router;
}
