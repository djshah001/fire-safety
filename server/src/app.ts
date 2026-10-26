import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './core/http/errorHandler.js';
import { originGuard } from './core/http/originGuard.js';
import { requestContext } from './core/http/requestContext.js';
import { checkDatabaseConnection } from './infrastructure/database/db.js';
import { createHealthRouter, type ReadinessCheck } from './modules/health/health.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createCrmRouter } from './modules/crm/crm.routes.js';
import { createMastersRouter } from './modules/masters/masters.routes.js';
import { createEngineeringRouter } from './modules/engineering/engineering.routes.js';
import { createBoqRouter } from './modules/engineering/boq.routes.js';
import { createQuotationRouter } from './modules/engineering/quotation.routes.js';
import { createNotificationRouter } from './modules/notifications/notification.routes.js';
import { createProjectRouter } from './modules/projects/project.routes.js';
import { createProcurementRouter } from './modules/procurement/procurement.routes.js';

export type AppDependencies = {
  checkReadiness?: ReadinessCheck;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(cors({
    origin: env.APP_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(cookieParser());
  app.use(originGuard);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use('/api/v1/health', createHealthRouter(dependencies.checkReadiness ?? checkDatabaseConnection));
  app.use('/api/v1', rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }));
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/notifications', createNotificationRouter());
  app.use('/api/v1/projects', createProjectRouter());
  app.use('/api/v1/admin', createAdminRouter());
  app.use('/api/v1/crm', createCrmRouter());
  app.use('/api/v1/masters', createMastersRouter());
  app.use('/api/v1/engineering', createEngineeringRouter());
  app.use('/api/v1/engineering', createBoqRouter());
  app.use('/api/v1/engineering', createQuotationRouter());
  app.use('/api/v1/procurement', createProcurementRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
