import type { Request, Response } from 'express';
import { getRequestId } from './requestContext.js';

export function sendData<T>(request: Request, response: Response, data: T, statusCode = 200) {
  return response.status(statusCode).json({
    data,
    requestId: getRequestId(request),
  });
}
