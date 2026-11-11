import { Router } from 'express';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { db } from '../../infrastructure/database/db.js';
import { ExecutionRepository } from './execution.repository.js';
import { ExecutionService } from './execution.service.js';

export const executionRepository = new ExecutionRepository(db as any);
export const executionService = new ExecutionService(executionRepository);

export function createExecutionRouter() {
  const router = Router({ mergeParams: true });
  router.use(requireAuthentication);

  // --- Milestones ---
  router.get('/projects/:projectId/milestones', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const data = await executionService.listMilestones(getPrincipal(req), req.params.projectId as string);
      sendData(req, res, { milestones: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/milestones', requireCsrf, requirePermission('project.task.manage'), async (req, res, next) => {
    try {
      const milestone = await executionService.createMilestone(getPrincipal(req), req.params.projectId as string, req.body);
      sendData(req, res, { milestone }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/milestones/:milestoneId', requireCsrf, requirePermission('project.task.manage'), async (req, res, next) => {
    try {
      const milestone = await executionService.updateMilestone(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.milestoneId as string,
        req.body,
      );
      sendData(req, res, { milestone });
    } catch (err) {
      next(err);
    }
  });

  // --- Tasks ---
  router.get('/projects/:projectId/tasks', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const { milestoneId, assignedUserId, status } = req.query;
      const data = await executionService.listTasks(getPrincipal(req), req.params.projectId as string, {
        milestoneId: milestoneId as string | undefined,
        assignedUserId: assignedUserId as string | undefined,
        status: status as string | undefined,
      });
      sendData(req, res, data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/tasks', requireCsrf, requirePermission('project.task.manage'), async (req, res, next) => {
    try {
      const task = await executionService.createTask(getPrincipal(req), req.params.projectId as string, req.body);
      sendData(req, res, { task }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/projects/:projectId/tasks/:taskId', requireCsrf, requirePermission('project.task.manage'), async (req, res, next) => {
    try {
      const task = await executionService.updateTask(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.taskId as string,
        req.body,
      );
      sendData(req, res, { task });
    } catch (err) {
      next(err);
    }
  });

  // --- Daily Progress Reports ---
  router.get('/projects/:projectId/daily-reports', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      const data = await executionService.listDailyReports(getPrincipal(req), req.params.projectId as string, limit, offset);
      sendData(req, res, { reports: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/daily-reports', requireCsrf, requirePermission('project.daily_report.create'), async (req, res, next) => {
    try {
      const report = await executionService.createDailyReport(getPrincipal(req), req.params.projectId as string, req.body);
      sendData(req, res, { report }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/projects/:projectId/daily-reports/:reportId', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const data = await executionService.getDailyReport(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.reportId as string,
      );
      sendData(req, res, data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/daily-reports/:reportId/revisions', requireCsrf, requirePermission('project.daily_report.create'), async (req, res, next) => {
    try {
      const report = await executionService.submitDailyReportRevision(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.reportId as string,
        req.body,
      );
      sendData(req, res, { report }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/daily-reports/:reportId/review', requireCsrf, requirePermission('project.daily_report.review'), async (req, res, next) => {
    try {
      const report = await executionService.reviewDailyReport(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.reportId as string,
        req.body,
      );
      sendData(req, res, { report });
    } catch (err) {
      next(err);
    }
  });

  // --- Delays ---
  router.get('/projects/:projectId/delays', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const data = await executionService.listDelays(getPrincipal(req), req.params.projectId as string);
      sendData(req, res, { delays: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/delays', requireCsrf, requirePermission('project.delay.manage'), async (req, res, next) => {
    try {
      const delay = await executionService.createDelay(getPrincipal(req), req.params.projectId as string, req.body);
      sendData(req, res, { delay }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/delays/:delayId/review', requireCsrf, requirePermission('project.delay.review'), async (req, res, next) => {
    try {
      const delay = await executionService.reviewDelay(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.delayId as string,
        req.body,
      );
      sendData(req, res, { delay });
    } catch (err) {
      next(err);
    }
  });

  // --- Variations ---
  router.get('/projects/:projectId/variations', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const data = await executionService.listVariations(getPrincipal(req), req.params.projectId as string);
      sendData(req, res, { variations: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/variations', requireCsrf, requirePermission('project.variation.create'), async (req, res, next) => {
    try {
      const variation = await executionService.createVariation(getPrincipal(req), req.params.projectId as string, req.body);
      sendData(req, res, { variation }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/variations/:variationId/review-internal', requireCsrf, requirePermission('project.variation.review'), async (req, res, next) => {
    try {
      const variation = await executionService.reviewVariationInternal(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.variationId as string,
        req.body,
      );
      sendData(req, res, { variation });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/variations/:variationId/customer-approval', requireCsrf, requirePermission('project.variation.approve'), async (req, res, next) => {
    try {
      const variation = await executionService.recordVariationCustomerApproval(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.variationId as string,
        req.body,
      );
      sendData(req, res, { variation });
    } catch (err) {
      next(err);
    }
  });

  // --- Expenses ---
  router.get('/projects/:projectId/expenses', requirePermission('project.execution.read'), async (req, res, next) => {
    try {
      const data = await executionService.listExpenses(getPrincipal(req), req.params.projectId as string);
      sendData(req, res, { expenses: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/expenses', requireCsrf, requirePermission('project.expense.manage'), async (req, res, next) => {
    try {
      const expense = await executionService.createExpense(getPrincipal(req), req.params.projectId as string, req.body);
      sendData(req, res, { expense }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:projectId/expenses/:expenseId/review', requireCsrf, requirePermission('project.expense.review'), async (req, res, next) => {
    try {
      const expense = await executionService.reviewExpense(
        getPrincipal(req),
        req.params.projectId as string,
        req.params.expenseId as string,
        req.body,
      );
      sendData(req, res, { expense });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

