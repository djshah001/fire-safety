import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger/logger.js';

type RequestWithId = Request & { requestId: string; id?: string };
const validRequestId = /^[A-Za-z0-9_.:-]{1,100}$/;

const httpLogger = pinoHttp<Request, Response>({
  logger,
  // Use the compact raw-request serializers from logger.ts.
  wrapSerializers: false,
  quietReqLogger: true,
  customAttributeKeys: {
    reqId: 'requestId',
    responseTime: 'durationMs',
  },
  customSuccessMessage(request, response) {
    return `${request.method} ${request.originalUrl.split('?')[0]} → ${response.statusCode}`;
  },
  customErrorMessage(request, response) {
    return `${request.method} ${request.originalUrl.split('?')[0]} → ${response.statusCode} failed`;
  },
  customSuccessObject(_request, response, loggableObject) {
    return {
      ...loggableObject,
      event: 'http.request_completed',
      ...(typeof response.locals.logErrorCode === 'string'
        ? { errorCode: response.locals.logErrorCode }
        : {}),
    };
  },
  customErrorObject(_request, response, _error, loggableObject) {
    return {
      ...loggableObject,
      event: 'http.request_failed',
      ...(typeof response.locals.logErrorCode === 'string'
        ? { errorCode: response.locals.logErrorCode }
        : {}),
    };
  },
  genReqId(request) {
    const supplied = request.headers['x-request-id'];
    return typeof supplied === 'string' && validRequestId.test(supplied) ? supplied : randomUUID();
  },
  customLogLevel(_request, response, error) {
    if (error || response.statusCode >= 500) return 'error';
    if (response.statusCode >= 400) return 'warn';
    return 'info';
  },
});

export const requestContext: RequestHandler = (request, response, next) => {
  httpLogger(request, response, () => {
    const requestWithId = request as RequestWithId;
    requestWithId.requestId = requestWithId.id ?? randomUUID();
    response.setHeader('X-Request-Id', requestWithId.requestId);
    next();
  });
};

export function getRequestId(request: Request): string {
  return (request as RequestWithId).requestId;
}
