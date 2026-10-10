import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from '../errors/appError.js';
import { getRequestId } from './requestContext.js';

type DatabaseError = Error & { code?: string; cause?: unknown };

function databaseErrorCode(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
    const databaseError = current as DatabaseError;
    if (databaseError.code) return databaseError.code;
    current = databaseError.cause;
  }
  return undefined;
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new NotFoundError('API endpoint not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (response.headersSent) {
    _next(error);
    return;
  }

  const requestId = getRequestId(request);

  if (error instanceof ZodError) {
    response.locals.logErrorCode = 'VALIDATION_ERROR';
    response.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request could not be validated.',
        fieldErrors: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      requestId,
    });
    return;
  }

  if (error instanceof MulterError) {
    response.locals.logErrorCode = `UPLOAD_${error.code}`;
    response.status(422).json({
      error: {
        code: `UPLOAD_${error.code}`,
        message: error.code === 'LIMIT_FILE_SIZE' ? 'The uploaded file is too large.' : 'The upload could not be accepted.',
      },
      requestId,
    });
    return;
  }

  if (error instanceof AppError) {
    response.locals.logErrorCode = error.code;
    if (error.statusCode >= 500) {
      (response as Response & { err?: Error }).err = error;
    }
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      requestId,
    });
    return;
  }

  if (databaseErrorCode(error) === '23505') {
    response.locals.logErrorCode = 'CONFLICT';
    response.status(409).json({
      error: { code: 'CONFLICT', message: 'A record with the same unique value already exists.' },
      requestId,
    });
    return;
  }

  response.locals.logErrorCode = 'INTERNAL_ERROR';
  // pino-http logs this actual error once when the response completes.
  // Do not stringify non-Error throws, which may contain sensitive data.
  (response as Response & { err?: Error }).err =
    error instanceof Error ? error : new Error('A non-Error value was thrown');
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    requestId,
  });
};
