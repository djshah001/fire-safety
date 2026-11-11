import { Decimal } from 'decimal.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { hasPermission } from '../auth/auth.middleware.js';
import { isAdministrator } from '../../core/security/administrator.js';
import { ExecutionRepository } from './execution.repository.js';
import {
  createDailyReportSchema,
  createDelaySchema,
  createExpenseSchema,
  createMilestoneSchema,
  createTaskSchema,
  createVariationSchema,
  recordCustomerVariationSchema,
  reviewDailyReportSchema,
  reviewDelaySchema,
  reviewExpenseSchema,
  reviewVariationSchema,
  submitDailyReportRevisionSchema,
  updateMilestoneSchema,
  updateTaskSchema,
} from './execution.schemas.js';

export class ExecutionService {
  constructor(private readonly repo: ExecutionRepository) {}

  private assertPermission(principal: AuthenticatedPrincipal, permission: string) {
    if (
      hasPermission(principal, 'system.access.all') ||
      hasPermission(principal, permission)
    ) {
      return;
    }
    const err: any = new Error(`Forbidden: missing required permission ${permission}`);
    err.statusCode = 403;
    throw err;
  }

  private async assertProjectAccess(principal: AuthenticatedPrincipal, projectId: string) {
    const hasAccess = await this.repo.checkProjectAccess(
      principal.companyId,
      principal.userId,
      projectId,
    );
    if (!hasAccess && !isAdministrator(principal)) {
      const err: any = new Error('Forbidden: you do not have assigned access to this project.');
      err.statusCode = 403;
      throw err;
    }
  }

  // --- Milestones ---

  async listMilestones(principal: AuthenticatedPrincipal, projectId: string) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listMilestones(principal.companyId, projectId);
  }

  async createMilestone(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.task.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createMilestoneSchema.parse(payload);

    const count = (await this.repo.listMilestones(principal.companyId, projectId)).length;
    const milestoneNumber = `MS-${String(count + 1).padStart(2, '0')}`;

    return this.repo.createMilestone({
      companyId: principal.companyId,
      projectId,
      milestoneNumber,
      name: parsed.name,
      description: parsed.description ?? null,
      targetDate: parsed.targetDate,
      billingPercentage: new Decimal(parsed.billingPercentage).toFixed(2),
      orderIndex: parsed.orderIndex,
    });
  }

  async updateMilestone(
    principal: AuthenticatedPrincipal,
    projectId: string,
    milestoneId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.task.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updateMilestoneSchema.parse(payload);

    const existing = await this.repo.findMilestone(principal.companyId, milestoneId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Milestone not found.');
      err.statusCode = 404;
      throw err;
    }

    return this.repo.updateMilestone(principal.companyId, milestoneId, {
      ...(parsed.name ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.targetDate ? { targetDate: parsed.targetDate } : {}),
      ...(parsed.actualDate !== undefined ? { actualDate: parsed.actualDate } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.billingPercentage !== undefined
        ? { billingPercentage: new Decimal(parsed.billingPercentage).toFixed(2) }
        : {}),
      ...(parsed.orderIndex !== undefined ? { orderIndex: parsed.orderIndex } : {}),
    });
  }

  // --- Tasks ---

  async listTasks(
    principal: AuthenticatedPrincipal,
    projectId: string,
    filters?: { milestoneId?: string; assignedUserId?: string; status?: string },
  ) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    const [tasks, overallProgress] = await Promise.all([
      this.repo.listTasks(principal.companyId, projectId, filters),
      this.repo.getOverallProgress(principal.companyId, projectId),
    ]);
    return { tasks, overallProgress };
  }

  async createTask(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.task.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createTaskSchema.parse(payload);

    const taskNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'project_task',
      'TSK',
    );

    return this.repo.createTask({
      companyId: principal.companyId,
      projectId,
      milestoneId: parsed.milestoneId ?? null,
      taskNumber,
      title: parsed.title,
      description: parsed.description ?? null,
      assignedUserId: parsed.assignedUserId ?? null,
      plannedStartDate: parsed.plannedStartDate,
      plannedEndDate: parsed.plannedEndDate,
      weightage: new Decimal(parsed.weightage).toFixed(2),
      plannedQuantity: parsed.plannedQuantity !== undefined && parsed.plannedQuantity !== null
        ? new Decimal(parsed.plannedQuantity).toFixed(4)
        : null,
      unitSymbol: parsed.unitSymbol ?? null,
    });
  }

  async updateTask(
    principal: AuthenticatedPrincipal,
    projectId: string,
    taskId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.task.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updateTaskSchema.parse(payload);

    const existing = await this.repo.findTask(principal.companyId, taskId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Task not found.');
      err.statusCode = 404;
      throw err;
    }

    let status = parsed.status ?? existing.status;
    let actualStartDate: string | null = parsed.actualStartDate !== undefined ? (parsed.actualStartDate ?? null) : existing.actualStartDate;
    let actualEndDate: string | null = parsed.actualEndDate !== undefined ? (parsed.actualEndDate ?? null) : existing.actualEndDate;

    if (parsed.progressPercentage !== undefined) {
      if (parsed.progressPercentage > 0 && status === 'not_started') {
        status = 'in_progress';
        if (!actualStartDate) {
          actualStartDate = new Date().toISOString().split('T')[0]!;
        }
      }
      if (parsed.progressPercentage === 100 && status !== 'completed') {
        status = 'completed';
        if (!actualEndDate) {
          actualEndDate = new Date().toISOString().split('T')[0]!;
        }
      }
    }

    return this.repo.updateTask(principal.companyId, taskId, {
      ...(parsed.milestoneId !== undefined ? { milestoneId: parsed.milestoneId } : {}),
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.assignedUserId !== undefined ? { assignedUserId: parsed.assignedUserId } : {}),
      ...(parsed.plannedStartDate ? { plannedStartDate: parsed.plannedStartDate } : {}),
      ...(parsed.plannedEndDate ? { plannedEndDate: parsed.plannedEndDate } : {}),
      actualStartDate,
      actualEndDate,
      status,
      ...(parsed.progressPercentage !== undefined ? { progressPercentage: parsed.progressPercentage } : {}),
      ...(parsed.weightage !== undefined ? { weightage: new Decimal(parsed.weightage).toFixed(2) } : {}),
      ...(parsed.plannedQuantity !== undefined
        ? { plannedQuantity: parsed.plannedQuantity ? new Decimal(parsed.plannedQuantity).toFixed(4) : null }
        : {}),
      ...(parsed.actualQuantity !== undefined && parsed.actualQuantity !== null
        ? { actualQuantity: new Decimal(parsed.actualQuantity).toFixed(4) }
        : {}),
      ...(parsed.unitSymbol !== undefined ? { unitSymbol: parsed.unitSymbol } : {}),
      ...(parsed.blockedReason !== undefined ? { blockedReason: parsed.blockedReason } : {}),
    });
  }

  // --- Daily Progress Reports ---

  async listDailyReports(
    principal: AuthenticatedPrincipal,
    projectId: string,
    limit?: number,
    offset?: number,
  ) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listDailyReports(principal.companyId, projectId, limit, offset);
  }

  async getDailyReport(
    principal: AuthenticatedPrincipal,
    projectId: string,
    reportId: string,
  ) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    const report = await this.repo.findDailyReport(principal.companyId, reportId);
    if (!report || report.report.projectId !== projectId) {
      const err: any = new Error('Daily progress report not found.');
      err.statusCode = 404;
      throw err;
    }
    return report;
  }

  async createDailyReport(
    principal: AuthenticatedPrincipal,
    projectId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.daily_report.create');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createDailyReportSchema.parse(payload);

    // Enforce unique DPR per project per day
    const existing = await this.repo.findDailyReportByDate(
      principal.companyId,
      projectId,
      parsed.reportDate,
    );
    if (existing) {
      const err: any = new Error(
        `A daily progress report already exists for ${parsed.reportDate} (${existing.reportNumber}). Edit or revise the existing report.`,
      );
      err.statusCode = 409;
      throw err;
    }

    const reportNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'daily_progress_report',
      'DPR',
    );

    return this.repo.withTransaction(async (tx) => {
      const report = await this.repo.createDailyReport(
        {
          companyId: principal.companyId,
          projectId,
          reportNumber,
          reportDate: parsed.reportDate,
          siteEngineerUserId: principal.userId,
          status: 'submitted',
          submittedAt: new Date(),
        },
        {
          weatherCondition: parsed.weatherCondition,
          workSummary: parsed.workSummary,
          obstaclesEncountered: parsed.obstaclesEncountered ?? null,
          correctiveActions: parsed.correctiveActions ?? null,
          generalNotes: parsed.generalNotes ?? null,
          manpowerCount: parsed.manpowerCount,
          manpowerDetails: parsed.manpowerDetails,
          equipmentDetails: parsed.equipmentDetails,
          sitePhotos: parsed.sitePhotos,
          submittedByUserId: principal.userId,
        },
        parsed.taskProgress.map((tp) => ({
          taskId: tp.taskId,
          workCompletedToday: tp.workCompletedToday,
          progressPercentage: tp.progressPercentage,
          quantityCompletedToday: new Decimal(tp.quantityCompletedToday).toFixed(4),
          unitSymbol: tp.unitSymbol ?? null,
          notes: tp.notes ?? null,
        })),
        parsed.materialConsumption.map((m) => ({
          itemId: m.itemId,
          quantityConsumed: new Decimal(m.quantityConsumed).toFixed(4),
          notes: m.notes ?? null,
        })),
        tx,
      );

      // Automatically update task progress on reported tasks
      for (const tp of parsed.taskProgress) {
        await this.repo.updateTask(
          principal.companyId,
          tp.taskId,
          {
            progressPercentage: tp.progressPercentage,
            status: tp.progressPercentage === 100 ? 'completed' : tp.progressPercentage > 0 ? 'in_progress' : undefined,
          },
          tx,
        );
      }

      return report;
    });
  }

  async submitDailyReportRevision(
    principal: AuthenticatedPrincipal,
    projectId: string,
    reportId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.daily_report.create');
    await this.assertProjectAccess(principal, projectId);
    const parsed = submitDailyReportRevisionSchema.parse(payload);

    const existing = await this.repo.findDailyReport(principal.companyId, reportId);
    if (!existing || existing.report.projectId !== projectId) {
      const err: any = new Error('Daily progress report not found.');
      err.statusCode = 404;
      throw err;
    }

    if (existing.report.status !== 'returned' && existing.report.status !== 'draft') {
      const err: any = new Error(
        `Cannot revise a daily report with status "${existing.report.status}". Only returned or draft reports can be revised.`,
      );
      err.statusCode = 400;
      throw err;
    }

    const nextRevision = existing.report.currentRevisionNumber + 1;

    return this.repo.withTransaction(async (tx) => {
      const report = await this.repo.addDailyReportRevision(
        reportId,
        principal.companyId,
        projectId,
        nextRevision,
        {
          weatherCondition: parsed.weatherCondition,
          workSummary: parsed.workSummary,
          obstaclesEncountered: parsed.obstaclesEncountered ?? null,
          correctiveActions: parsed.correctiveActions ?? null,
          generalNotes: parsed.generalNotes ?? null,
          manpowerCount: parsed.manpowerCount,
          manpowerDetails: parsed.manpowerDetails,
          equipmentDetails: parsed.equipmentDetails,
          sitePhotos: parsed.sitePhotos,
          submittedByUserId: principal.userId,
        },
        parsed.taskProgress.map((tp) => ({
          taskId: tp.taskId,
          workCompletedToday: tp.workCompletedToday,
          progressPercentage: tp.progressPercentage,
          quantityCompletedToday: new Decimal(tp.quantityCompletedToday).toFixed(4),
          unitSymbol: tp.unitSymbol ?? null,
          notes: tp.notes ?? null,
        })),
        parsed.materialConsumption.map((m) => ({
          itemId: m.itemId,
          quantityConsumed: new Decimal(m.quantityConsumed).toFixed(4),
          notes: m.notes ?? null,
        })),
        tx,
      );

      for (const tp of parsed.taskProgress) {
        await this.repo.updateTask(
          principal.companyId,
          tp.taskId,
          {
            progressPercentage: tp.progressPercentage,
            status: tp.progressPercentage === 100 ? 'completed' : tp.progressPercentage > 0 ? 'in_progress' : undefined,
          },
          tx,
        );
      }

      return report;
    });
  }

  async reviewDailyReport(
    principal: AuthenticatedPrincipal,
    projectId: string,
    reportId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.daily_report.review');
    await this.assertProjectAccess(principal, projectId);
    const parsed = reviewDailyReportSchema.parse(payload);

    const existing = await this.repo.findDailyReport(principal.companyId, reportId);
    if (!existing || existing.report.projectId !== projectId) {
      const err: any = new Error('Daily progress report not found.');
      err.statusCode = 404;
      throw err;
    }

    if (existing.report.status !== 'submitted') {
      const err: any = new Error(`Only submitted daily reports can be reviewed. Current status is ${existing.report.status}.`);
      err.statusCode = 400;
      throw err;
    }

    // No self-approval rule for non-administrators
    if (existing.report.siteEngineerUserId === principal.userId && !isAdministrator(principal)) {
      const err: any = new Error('Self-approval policy violation: you cannot approve your own submitted daily progress report.');
      err.statusCode = 403;
      throw err;
    }

    const newStatus = parsed.action === 'approve' ? 'approved' : 'returned';

    return this.repo.reviewDailyReport(
      principal.companyId,
      reportId,
      newStatus,
      principal.userId,
      parsed.reviewNotes,
    );
  }

  // --- Delays ---

  async listDelays(principal: AuthenticatedPrincipal, projectId: string) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listDelays(principal.companyId, projectId);
  }

  async createDelay(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.delay.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createDelaySchema.parse(payload);

    const delayNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'project_delay',
      'DEL',
    );

    return this.repo.createDelay({
      companyId: principal.companyId,
      projectId,
      taskId: parsed.taskId ?? null,
      delayNumber,
      reasonCategory: parsed.reasonCategory,
      responsibleParty: parsed.responsibleParty,
      delayDays: parsed.delayDays,
      originalTargetDate: parsed.originalTargetDate,
      revisedTargetDate: parsed.revisedTargetDate,
      impactDescription: parsed.impactDescription,
      mitigationPlan: parsed.mitigationPlan,
      reportedByUserId: principal.userId,
    });
  }

  async reviewDelay(
    principal: AuthenticatedPrincipal,
    projectId: string,
    delayId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.delay.review');
    await this.assertProjectAccess(principal, projectId);
    const parsed = reviewDelaySchema.parse(payload);

    const existing = await this.repo.findDelay(principal.companyId, delayId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Delay record not found.');
      err.statusCode = 404;
      throw err;
    }

    // No self-approval rule for non-administrators
    if (existing.reportedByUserId === principal.userId && !isAdministrator(principal)) {
      const err: any = new Error('Self-approval policy violation: you cannot review your own reported delay.');
      err.statusCode = 403;
      throw err;
    }

    const status = parsed.action === 'approve' ? 'approved' : 'rejected';

    return this.repo.withTransaction(async (tx) => {
      const result = await this.repo.reviewDelay(
        principal.companyId,
        delayId,
        status,
        principal.userId,
        parsed.reviewNotes,
        tx,
      );

      // If approved and linked to a task, optionally update the task planned end date
      if (status === 'approved' && existing.taskId) {
        await this.repo.updateTask(
          principal.companyId,
          existing.taskId,
          {
            plannedEndDate: existing.revisedTargetDate,
          },
          tx,
        );
      }

      return result;
    });
  }

  // --- Variations ---

  async listVariations(principal: AuthenticatedPrincipal, projectId: string) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listVariations(principal.companyId, projectId);
  }

  async createVariation(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.variation.create');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createVariationSchema.parse(payload);

    const variationNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'project_variation',
      'VAR',
    );

    return this.repo.createVariation({
      companyId: principal.companyId,
      projectId,
      variationNumber,
      title: parsed.title,
      description: parsed.description,
      reasonCategory: parsed.reasonCategory,
      scopeDeltaSummary: parsed.scopeDeltaSummary,
      scheduleImpactDays: parsed.scheduleImpactDays,
      costImpactAmount: new Decimal(parsed.costImpactAmount).toFixed(2),
      initiatorUserId: principal.userId,
    });
  }

  async reviewVariationInternal(
    principal: AuthenticatedPrincipal,
    projectId: string,
    variationId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.variation.review');
    await this.assertProjectAccess(principal, projectId);
    const parsed = reviewVariationSchema.parse(payload);

    const existing = await this.repo.findVariation(principal.companyId, variationId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Variation record not found.');
      err.statusCode = 404;
      throw err;
    }

    // No self-approval rule for non-administrators
    if (existing.initiatorUserId === principal.userId && !isAdministrator(principal)) {
      const err: any = new Error('Self-approval policy violation: you cannot conduct the technical review for your own initiated variation.');
      err.statusCode = 403;
      throw err;
    }

    const status = parsed.action === 'approve_internal' ? 'approved_internal' : 'rejected';

    return this.repo.reviewVariationInternal(principal.companyId, variationId, {
      status,
      designReviewNotes: parsed.designReviewNotes,
      designReviewedByUserId: principal.userId,
      revisedBoqRevisionId: parsed.revisedBoqRevisionId ?? null,
      revisedDesignRevisionId: parsed.revisedDesignRevisionId ?? null,
    });
  }

  async recordVariationCustomerApproval(
    principal: AuthenticatedPrincipal,
    projectId: string,
    variationId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.variation.approve');
    await this.assertProjectAccess(principal, projectId);
    const parsed = recordCustomerVariationSchema.parse(payload);

    const existing = await this.repo.findVariation(principal.companyId, variationId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Variation record not found.');
      err.statusCode = 404;
      throw err;
    }

    if (existing.status !== 'approved_internal' && existing.status !== 'submitted_to_customer') {
      const err: any = new Error(
        `Cannot record customer approval: variation must be internally approved first. Current status is ${existing.status}.`,
      );
      err.statusCode = 400;
      throw err;
    }

    return this.repo.recordVariationCustomerApproval(principal.companyId, variationId, {
      customerEvidenceSnapshot: parsed.customerEvidenceSnapshot,
      customerApprovedAt: parsed.customerApprovedAt ? new Date(parsed.customerApprovedAt) : new Date(),
    });
  }

  // --- Expenses ---

  async listExpenses(principal: AuthenticatedPrincipal, projectId: string) {
    this.assertPermission(principal, 'project.execution.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listExpenses(principal.companyId, projectId);
  }

  async createExpense(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.expense.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createExpenseSchema.parse(payload);

    const expenseNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'project_expense',
      'EXP',
    );

    return this.repo.createExpense({
      companyId: principal.companyId,
      projectId,
      expenseNumber,
      category: parsed.category,
      amount: new Decimal(parsed.amount).toFixed(2),
      expenseDate: parsed.expenseDate,
      description: parsed.description,
      receiptFileUrl: parsed.receiptFileUrl ?? null,
      submittedByUserId: principal.userId,
    });
  }

  async reviewExpense(
    principal: AuthenticatedPrincipal,
    projectId: string,
    expenseId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.expense.review');
    await this.assertProjectAccess(principal, projectId);
    const parsed = reviewExpenseSchema.parse(payload);

    const existing = await this.repo.findExpense(principal.companyId, expenseId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Expense record not found.');
      err.statusCode = 404;
      throw err;
    }

    if (existing.submittedByUserId === principal.userId && !isAdministrator(principal)) {
      const err: any = new Error('Self-approval policy violation: you cannot approve your own submitted expense.');
      err.statusCode = 403;
      throw err;
    }

    const status = parsed.action === 'approve' ? 'approved' : 'rejected';
    return this.repo.reviewExpense(
      principal.companyId,
      expenseId,
      status,
      principal.userId,
      parsed.reviewNotes,
    );
  }
}
