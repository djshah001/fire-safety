import { Router } from 'express';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { db } from '../../infrastructure/database/db.js';
import { QualityRepository } from './quality.repository.js';
import { QualityService } from './quality.service.js';

export const qualityRepository = new QualityRepository(db as any);
export const qualityService = new QualityService(qualityRepository);

export function createQualityRouter() {
  const router = Router({ mergeParams: true });
  router.use(requireAuthentication);

  // ==========================================
  // Checklist Templates
  // ==========================================
  router.get('/quality/templates', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const category = req.query.category as string | undefined;
      const templates = await qualityService.listTemplates(getPrincipal(req), category);
      sendData(req, res, { templates });
    } catch (err) {
      next(err);
    }
  });

  router.get('/quality/templates/:templateId', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const template = await qualityService.getTemplate(getPrincipal(req), req.params.templateId as string);
      sendData(req, res, { template });
    } catch (err) {
      next(err);
    }
  });

  router.post('/quality/templates', requireCsrf, requirePermission('project.quality.manage'), async (req, res, next) => {
    try {
      const template = await qualityService.createTemplate(getPrincipal(req), req.body);
      sendData(req, res, { template }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/quality/templates/:templateId', requireCsrf, requirePermission('project.quality.manage'), async (req, res, next) => {
    try {
      const template = await qualityService.updateTemplate(
        getPrincipal(req),
        req.params.templateId as string,
        req.body,
      );
      sendData(req, res, { template });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // Quality Inspections
  // ==========================================
  router.get('/projects/:projectId/inspections', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const status = req.query.status as string | undefined;
      const inspections = await qualityService.listInspections(
        getPrincipal(req),
        req.params.projectId as string,
        status,
      );
      sendData(req, res, { inspections });
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:projectId/inspections/:inspectionId', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const inspection = await qualityService.getInspection(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.inspectionId as string,
      );
      sendData(req, res, { inspection });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/inspections', requireCsrf, requirePermission('project.quality.manage'), async (req, res, next) => {
    try {
      const inspection = await qualityService.createInspection(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { inspection }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/inspections/:inspectionId/execute', requireCsrf, requirePermission('project.quality.manage'), async (req, res, next) => {
    try {
      const inspection = await qualityService.executeInspection(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.inspectionId as string,
        req.body,
      );
      sendData(req, res, { inspection });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/inspections/:inspectionId/review', requireCsrf, requirePermission('project.quality.review'), async (req, res, next) => {
    try {
      const inspection = await qualityService.reviewInspection(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.inspectionId as string,
        req.body,
      );
      sendData(req, res, { inspection });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // Test Reports
  // ==========================================
  router.get('/projects/:projectId/test-reports', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const testType = req.query.testType as string | undefined;
      const testReports = await qualityService.listTestReports(
        getPrincipal(req),
        req.params.projectId as string,
        testType,
      );
      sendData(req, res, { testReports });
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:projectId/test-reports/:reportId', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const testReport = await qualityService.getTestReport(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.reportId as string,
      );
      sendData(req, res, { testReport });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/test-reports', requireCsrf, requirePermission('project.quality.manage'), async (req, res, next) => {
    try {
      const testReport = await qualityService.createTestReport(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { testReport }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/test-reports/:reportId', requireCsrf, requirePermission('project.quality.manage'), async (req, res, next) => {
    try {
      const testReport = await qualityService.updateTestReport(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.reportId as string,
        req.body,
      );
      sendData(req, res, { testReport });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // Punch Items
  // ==========================================
  router.get('/projects/:projectId/punch-items', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const { severity, status, assignedToUserId } = req.query;
      const punchItems = await qualityService.listPunchItems(
        getPrincipal(req),
        req.params.projectId as string,
        {
          severity: severity as string | undefined,
          status: status as string | undefined,
          assignedToUserId: assignedToUserId as string | undefined,
        },
      );
      sendData(req, res, { punchItems });
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:projectId/punch-items/:itemId', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const punchItem = await qualityService.getPunchItem(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.itemId as string,
      );
      sendData(req, res, { punchItem });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/punch-items', requireCsrf, requirePermission('project.punch_item.manage'), async (req, res, next) => {
    try {
      const punchItem = await qualityService.createPunchItem(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { punchItem }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/punch-items/:itemId', requireCsrf, requirePermission('project.punch_item.manage'), async (req, res, next) => {
    try {
      const punchItem = await qualityService.updatePunchItem(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.itemId as string,
        req.body,
      );
      sendData(req, res, { punchItem });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/punch-items/:itemId/rectify', requireCsrf, requirePermission('project.punch_item.manage'), async (req, res, next) => {
    try {
      const punchItem = await qualityService.rectifyPunchItem(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.itemId as string,
        req.body,
      );
      sendData(req, res, { punchItem });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/punch-items/:itemId/close', requireCsrf, requirePermission('project.punch_item.close'), async (req, res, next) => {
    try {
      const punchItem = await qualityService.closePunchItem(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.itemId as string,
        req.body,
      );
      sendData(req, res, { punchItem });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // Handover & Statutory Documents
  // ==========================================
  router.get('/projects/:projectId/handover', requirePermission('project.quality.read'), async (req, res, next) => {
    try {
      const handover = await qualityService.getHandoverRecord(
        getPrincipal(req),
        req.params.projectId as string,
      );
      sendData(req, res, { handover });
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/handover/clearance', requireCsrf, requirePermission('project.handover.manage'), async (req, res, next) => {
    try {
      const handover = await qualityService.updateClearanceCertificate(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { handover });
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/handover/noc', requireCsrf, requirePermission('project.handover.manage'), async (req, res, next) => {
    try {
      const handover = await qualityService.updateNocCertificate(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { handover });
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/handover/completion-document', requireCsrf, requirePermission('project.handover.manage'), async (req, res, next) => {
    try {
      const handover = await qualityService.updateCompletionDocument(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { handover });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/handover/certify-completion', requireCsrf, requirePermission('project.handover.certify'), async (req, res, next) => {
    try {
      const handover = await qualityService.certifyOperationalCompletion(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { handover });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/handover/commercial-closure', requireCsrf, requirePermission('project.closure.execute'), async (req, res, next) => {
    try {
      const handover = await qualityService.executeCommercialClosure(
        getPrincipal(req),
        req.params.projectId as string,
        req.body,
      );
      sendData(req, res, { handover });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
