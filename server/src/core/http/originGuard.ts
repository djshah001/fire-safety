import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { ForbiddenError } from '../errors/appError.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedOrigin = new URL(env.APP_ORIGIN).origin;

export const originGuard: RequestHandler = (request, _response, next) => {
  if (safeMethods.has(request.method)) {
    next();
    return;
  }

  const origin = request.get('origin');
  if (origin && origin !== allowedOrigin) {
    next(new ForbiddenError('Cross-site mutation request rejected.'));
    return;
  }

  next();
};
