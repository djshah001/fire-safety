import pino from 'pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../../config/env.js';

const isDevelopment = env.NODE_ENV === 'development';

const sensitiveFields = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'secret',
  'clientSecret',
  'apiKey',
  'otp',
];

export const logger = pino({
  level: env.LOG_LEVEL ?? 'info',

  base: {
    service: 'fire-safety-api',
    environment: env.NODE_ENV,
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,

    req(req: IncomingMessage & { id?: string | number }) {
      return {
        method: req.method,
        // Exclude query parameters, which may contain sensitive values.
        path: req.url?.split('?')[0],
      };
    },

    res(res: ServerResponse) {
      return {
        statusCode: res.statusCode,
      };
    },
  },

  redact: {
    paths: [
      ...sensitiveFields.flatMap((field) => [
        field,
        `*.${field}`,
        `*.*.${field}`,
      ]),
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
      'headers["x-api-key"]',
      'headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },

  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname,service,environment',
        singleLine: true,
        messageFormat: '{msg}',
      },
    },
  }),
});
