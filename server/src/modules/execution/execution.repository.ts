import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { administratorScope } from '../../core/security/administrator.js';
import {
  dailyProgressReports,
  dailyReportMaterialConsumption,
  dailyReportRevisions,
  dailyReportTaskProgress,
  documentCounters,
  items,
  projectDelays,
  projectExpenses,
  projectMembers,
  projectMilestones,
  projects,
  projectTasks,
  projectVariations,
  users,
} from '../../infrastructure/database/schema/index.js';

export type TxOrDb = NodePgDatabase<Record<string, unknown>>;

export class ExecutionRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async withTransaction<T>(callback: (tx: TxOrDb) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => callback(tx as TxOrDb));
  }

  async allocateDocumentNumber(
    companyId: string,
    documentType: string,
    prefix: string,
    executor: TxOrDb = this.db,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const periodKey = `${year}`;
    const now = new Date();

    const [counter] = await executor
      .insert(documentCounters)
      .values({ companyId, documentType, periodKey, nextValue: 2, updatedAt: now })
      .onConflictDoUpdate({
        target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey],
        set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now },
      })
      .returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });

    if (!counter) {
      throw new Error(`Failed to allocate document number for ${documentType}`);
    }

    const seq = String(counter.allocated).padStart(5, '0');
    return `${prefix}-${year}-${seq}`;
  }

  async checkProjectAccess(companyId: string, userId: string, projectId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .leftJoin(
        projectMembers,
        and(
          eq(projectMembers.projectId, projects.id),
          eq(projectMembers.userId, userId),
          eq(projectMembers.companyId, companyId),
        ),
      )
      .where(
        and(
          eq(projects.companyId, companyId),
          eq(projects.id, projectId),
          sql`(${projectMembers.userId} is not null or ${administratorScope(companyId, userId)})`,
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async getProject(companyId: string, projectId: string) {
    const [row] = await this.db
      .select({
        id: projects.id,
        projectNumber: projects.projectNumber,
        title: projects.title,
        status: projects.status,
        startDate: projects.startDate,
        targetCompletionDate: projects.targetCompletionDate,
        rowVersion: projects.rowVersion,
      })
      .from(projects)
      .where(and(eq(projects.companyId, companyId), eq(projects.id, projectId)))
      .limit(1);

    return row ?? null;
  }

  // --- Milestones ---

  async listMilestones(companyId: string, projectId: string) {
    return this.db
      .select()
      .from(projectMilestones)
      .where(and(eq(projectMilestones.companyId, companyId), eq(projectMilestones.projectId, projectId)))
      .orderBy(asc(projectMilestones.orderIndex), asc(projectMilestones.targetDate));
  }

  async findMilestone(companyId: string, milestoneId: string) {
    const [row] = await this.db
      .select()
      .from(projectMilestones)
      .where(and(eq(projectMilestones.companyId, companyId), eq(projectMilestones.id, milestoneId)))
      .limit(1);
    return row ?? null;
  }

  async createMilestone(
    data: {
      companyId: string;
      projectId: string;
      milestoneNumber: string;
      name: string;
      description?: string | null;
      targetDate: string;
      billingPercentage: string;
      orderIndex: number;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(projectMilestones)
      .values(data)
      .returning();
    return row!;
  }

  async updateMilestone(
    companyId: string,
    milestoneId: string,
    data: Partial<{
      name: string;
      description: string | null;
      targetDate: string;
      actualDate: string | null;
      status: string;
      billingPercentage: string;
      orderIndex: number;
    }>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectMilestones)
      .set({
        ...data,
        updatedAt: new Date(),
        rowVersion: sql`${projectMilestones.rowVersion} + 1`,
      })
      .where(and(eq(projectMilestones.companyId, companyId), eq(projectMilestones.id, milestoneId)))
      .returning();
    return row ?? null;
  }

  // --- Tasks ---

  async listTasks(
    companyId: string,
    projectId: string,
    filters?: { milestoneId?: string; assignedUserId?: string; status?: string },
  ) {
    const conditions = [
      eq(projectTasks.companyId, companyId),
      eq(projectTasks.projectId, projectId),
    ];
    if (filters?.milestoneId) conditions.push(eq(projectTasks.milestoneId, filters.milestoneId));
    if (filters?.assignedUserId) conditions.push(eq(projectTasks.assignedUserId, filters.assignedUserId));
    if (filters?.status) conditions.push(eq(projectTasks.status, filters.status));

    return this.db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        milestoneId: projectTasks.milestoneId,
        milestoneName: projectMilestones.name,
        taskNumber: projectTasks.taskNumber,
        title: projectTasks.title,
        description: projectTasks.description,
        assignedUserId: projectTasks.assignedUserId,
        assignedUserName: users.name,
        plannedStartDate: projectTasks.plannedStartDate,
        plannedEndDate: projectTasks.plannedEndDate,
        actualStartDate: projectTasks.actualStartDate,
        actualEndDate: projectTasks.actualEndDate,
        status: projectTasks.status,
        progressPercentage: projectTasks.progressPercentage,
        weightage: projectTasks.weightage,
        plannedQuantity: projectTasks.plannedQuantity,
        actualQuantity: projectTasks.actualQuantity,
        unitSymbol: projectTasks.unitSymbol,
        blockedReason: projectTasks.blockedReason,
        rowVersion: projectTasks.rowVersion,
        createdAt: projectTasks.createdAt,
        updatedAt: projectTasks.updatedAt,
      })
      .from(projectTasks)
      .leftJoin(projectMilestones, eq(projectMilestones.id, projectTasks.milestoneId))
      .leftJoin(users, eq(users.id, projectTasks.assignedUserId))
      .where(and(...conditions))
      .orderBy(asc(projectTasks.plannedStartDate), asc(projectTasks.taskNumber));
  }

  async findTask(companyId: string, taskId: string) {
    const [row] = await this.db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        milestoneId: projectTasks.milestoneId,
        milestoneName: projectMilestones.name,
        taskNumber: projectTasks.taskNumber,
        title: projectTasks.title,
        description: projectTasks.description,
        assignedUserId: projectTasks.assignedUserId,
        assignedUserName: users.name,
        plannedStartDate: projectTasks.plannedStartDate,
        plannedEndDate: projectTasks.plannedEndDate,
        actualStartDate: projectTasks.actualStartDate,
        actualEndDate: projectTasks.actualEndDate,
        status: projectTasks.status,
        progressPercentage: projectTasks.progressPercentage,
        weightage: projectTasks.weightage,
        plannedQuantity: projectTasks.plannedQuantity,
        actualQuantity: projectTasks.actualQuantity,
        unitSymbol: projectTasks.unitSymbol,
        blockedReason: projectTasks.blockedReason,
        rowVersion: projectTasks.rowVersion,
        createdAt: projectTasks.createdAt,
        updatedAt: projectTasks.updatedAt,
      })
      .from(projectTasks)
      .leftJoin(projectMilestones, eq(projectMilestones.id, projectTasks.milestoneId))
      .leftJoin(users, eq(users.id, projectTasks.assignedUserId))
      .where(and(eq(projectTasks.companyId, companyId), eq(projectTasks.id, taskId)))
      .limit(1);

    return row ?? null;
  }

  async createTask(
    data: {
      companyId: string;
      projectId: string;
      milestoneId?: string | null;
      taskNumber: string;
      title: string;
      description?: string | null;
      assignedUserId?: string | null;
      plannedStartDate: string;
      plannedEndDate: string;
      weightage: string;
      plannedQuantity?: string | null;
      unitSymbol?: string | null;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(projectTasks)
      .values(data)
      .returning();
    return row!;
  }

  async updateTask(
    companyId: string,
    taskId: string,
    data: Partial<{
      milestoneId: string | null;
      title: string;
      description: string | null;
      assignedUserId: string | null;
      plannedStartDate: string;
      plannedEndDate: string;
      actualStartDate: string | null;
      actualEndDate: string | null;
      status: string;
      progressPercentage: number;
      weightage: string;
      plannedQuantity: string | null;
      actualQuantity: string;
      unitSymbol: string | null;
      blockedReason: string | null;
    }>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectTasks)
      .set({
        ...data,
        updatedAt: new Date(),
        rowVersion: sql`${projectTasks.rowVersion} + 1`,
      })
      .where(and(eq(projectTasks.companyId, companyId), eq(projectTasks.id, taskId)))
      .returning();
    return row ?? null;
  }

  async getOverallProgress(companyId: string, projectId: string) {
    const tasks = await this.db
      .select({
        progress: projectTasks.progressPercentage,
        weight: projectTasks.weightage,
      })
      .from(projectTasks)
      .where(and(eq(projectTasks.companyId, companyId), eq(projectTasks.projectId, projectId)));

    if (tasks.length === 0) return 0;

    let totalWeightedProgress = 0;
    let totalWeight = 0;
    for (const t of tasks) {
      const weight = Number(t.weight);
      totalWeightedProgress += t.progress * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;
    return Math.round((totalWeightedProgress / totalWeight) * 100) / 100;
  }

  // --- Daily Progress Reports ---

  async listDailyReports(companyId: string, projectId: string, limit = 50, offset = 0) {
    return this.db
      .select({
        id: dailyProgressReports.id,
        projectId: dailyProgressReports.projectId,
        reportNumber: dailyProgressReports.reportNumber,
        reportDate: dailyProgressReports.reportDate,
        status: dailyProgressReports.status,
        currentRevisionNumber: dailyProgressReports.currentRevisionNumber,
        siteEngineerUserId: dailyProgressReports.siteEngineerUserId,
        siteEngineerName: users.name,
        submittedAt: dailyProgressReports.submittedAt,
        reviewedAt: dailyProgressReports.reviewedAt,
        reviewNotes: dailyProgressReports.reviewNotes,
        createdAt: dailyProgressReports.createdAt,
      })
      .from(dailyProgressReports)
      .innerJoin(users, eq(users.id, dailyProgressReports.siteEngineerUserId))
      .where(and(eq(dailyProgressReports.companyId, companyId), eq(dailyProgressReports.projectId, projectId)))
      .orderBy(desc(dailyProgressReports.reportDate), desc(dailyProgressReports.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async findDailyReportByDate(companyId: string, projectId: string, reportDate: string) {
    const [row] = await this.db
      .select()
      .from(dailyProgressReports)
      .where(
        and(
          eq(dailyProgressReports.companyId, companyId),
          eq(dailyProgressReports.projectId, projectId),
          eq(dailyProgressReports.reportDate, reportDate),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findDailyReport(companyId: string, reportId: string) {
    const [report] = await this.db
      .select({
        id: dailyProgressReports.id,
        projectId: dailyProgressReports.projectId,
        reportNumber: dailyProgressReports.reportNumber,
        reportDate: dailyProgressReports.reportDate,
        status: dailyProgressReports.status,
        currentRevisionNumber: dailyProgressReports.currentRevisionNumber,
        siteEngineerUserId: dailyProgressReports.siteEngineerUserId,
        siteEngineerName: users.name,
        submittedAt: dailyProgressReports.submittedAt,
        reviewedAt: dailyProgressReports.reviewedAt,
        reviewedByUserId: dailyProgressReports.reviewedByUserId,
        reviewNotes: dailyProgressReports.reviewNotes,
        rowVersion: dailyProgressReports.rowVersion,
        createdAt: dailyProgressReports.createdAt,
      })
      .from(dailyProgressReports)
      .innerJoin(users, eq(users.id, dailyProgressReports.siteEngineerUserId))
      .where(and(eq(dailyProgressReports.companyId, companyId), eq(dailyProgressReports.id, reportId)))
      .limit(1);

    if (!report) return null;

    const revisions = await this.db
      .select({
        id: dailyReportRevisions.id,
        revisionNumber: dailyReportRevisions.revisionNumber,
        weatherCondition: dailyReportRevisions.weatherCondition,
        workSummary: dailyReportRevisions.workSummary,
        obstaclesEncountered: dailyReportRevisions.obstaclesEncountered,
        correctiveActions: dailyReportRevisions.correctiveActions,
        generalNotes: dailyReportRevisions.generalNotes,
        manpowerCount: dailyReportRevisions.manpowerCount,
        manpowerDetails: dailyReportRevisions.manpowerDetails,
        equipmentDetails: dailyReportRevisions.equipmentDetails,
        sitePhotos: dailyReportRevisions.sitePhotos,
        submittedAt: dailyReportRevisions.submittedAt,
        submittedByUserId: dailyReportRevisions.submittedByUserId,
        submittedByName: users.name,
      })
      .from(dailyReportRevisions)
      .innerJoin(users, eq(users.id, dailyReportRevisions.submittedByUserId))
      .where(
        and(
          eq(dailyReportRevisions.companyId, companyId),
          eq(dailyReportRevisions.dailyReportId, reportId),
        ),
      )
      .orderBy(desc(dailyReportRevisions.revisionNumber));

    const latestRevision = revisions[0];
    let taskProgress: Array<{
      taskId: string;
      taskNumber: string;
      taskTitle: string;
      workCompletedToday: string;
      progressPercentage: number;
      quantityCompletedToday: string;
      unitSymbol: string | null;
      notes: string | null;
    }> = [];
    let materialConsumption: Array<{
      itemId: string;
      itemCode: string;
      itemName: string;
      quantityConsumed: string;
      notes: string | null;
    }> = [];

    if (latestRevision) {
      taskProgress = await this.db
        .select({
          taskId: dailyReportTaskProgress.taskId,
          taskNumber: projectTasks.taskNumber,
          taskTitle: projectTasks.title,
          workCompletedToday: dailyReportTaskProgress.workCompletedToday,
          progressPercentage: dailyReportTaskProgress.progressPercentage,
          quantityCompletedToday: dailyReportTaskProgress.quantityCompletedToday,
          unitSymbol: dailyReportTaskProgress.unitSymbol,
          notes: dailyReportTaskProgress.notes,
        })
        .from(dailyReportTaskProgress)
        .innerJoin(projectTasks, eq(projectTasks.id, dailyReportTaskProgress.taskId))
        .where(
          and(
            eq(dailyReportTaskProgress.companyId, companyId),
            eq(dailyReportTaskProgress.dailyReportRevisionId, latestRevision.id),
          ),
        );

      materialConsumption = await this.db
        .select({
          itemId: dailyReportMaterialConsumption.itemId,
          itemCode: items.code,
          itemName: items.name,
          quantityConsumed: dailyReportMaterialConsumption.quantityConsumed,
          notes: dailyReportMaterialConsumption.notes,
        })
        .from(dailyReportMaterialConsumption)
        .innerJoin(items, eq(items.id, dailyReportMaterialConsumption.itemId))
        .where(
          and(
            eq(dailyReportMaterialConsumption.companyId, companyId),
            eq(dailyReportMaterialConsumption.dailyReportRevisionId, latestRevision.id),
          ),
        );
    }

    return {
      report,
      revisions,
      latestRevision: latestRevision ?? null,
      taskProgress,
      materialConsumption,
    };
  }

  async createDailyReport(
    reportData: {
      companyId: string;
      projectId: string;
      reportNumber: string;
      reportDate: string;
      siteEngineerUserId: string;
      status: string;
      submittedAt?: Date | null;
    },
    revisionData: {
      weatherCondition: string;
      workSummary: string;
      obstaclesEncountered?: string | null;
      correctiveActions?: string | null;
      generalNotes?: string | null;
      manpowerCount: number;
      manpowerDetails: unknown[];
      equipmentDetails: unknown[];
      sitePhotos: unknown[];
      submittedByUserId: string;
    },
    taskProgressData: Array<{
      taskId: string;
      workCompletedToday: string;
      progressPercentage: number;
      quantityCompletedToday: string;
      unitSymbol?: string | null;
      notes?: string | null;
    }>,
    materialData: Array<{
      itemId: string;
      quantityConsumed: string;
      notes?: string | null;
    }>,
    executor: TxOrDb = this.db,
  ) {
    const [report] = await executor
      .insert(dailyProgressReports)
      .values({
        ...reportData,
        currentRevisionNumber: 1,
      })
      .returning();

    const [revision] = await executor
      .insert(dailyReportRevisions)
      .values({
        companyId: reportData.companyId,
        dailyReportId: report!.id,
        revisionNumber: 1,
        ...revisionData,
      })
      .returning();

    if (taskProgressData.length > 0) {
      await executor.insert(dailyReportTaskProgress).values(
        taskProgressData.map((tp) => ({
          companyId: reportData.companyId,
          dailyReportRevisionId: revision!.id,
          taskId: tp.taskId,
          workCompletedToday: tp.workCompletedToday,
          progressPercentage: tp.progressPercentage,
          quantityCompletedToday: tp.quantityCompletedToday,
          unitSymbol: tp.unitSymbol ?? null,
          notes: tp.notes ?? null,
        })),
      );
    }

    if (materialData.length > 0) {
      await executor.insert(dailyReportMaterialConsumption).values(
        materialData.map((m) => ({
          companyId: reportData.companyId,
          dailyReportRevisionId: revision!.id,
          projectId: reportData.projectId,
          itemId: m.itemId,
          quantityConsumed: m.quantityConsumed,
          notes: m.notes ?? null,
          uniqueConsumptionKey: `${reportData.projectId}-${revision!.id}-${m.itemId}`,
        })),
      );
    }

    return report!;
  }

  async addDailyReportRevision(
    reportId: string,
    companyId: string,
    projectId: string,
    newRevisionNumber: number,
    revisionData: {
      weatherCondition: string;
      workSummary: string;
      obstaclesEncountered?: string | null;
      correctiveActions?: string | null;
      generalNotes?: string | null;
      manpowerCount: number;
      manpowerDetails: unknown[];
      equipmentDetails: unknown[];
      sitePhotos: unknown[];
      submittedByUserId: string;
    },
    taskProgressData: Array<{
      taskId: string;
      workCompletedToday: string;
      progressPercentage: number;
      quantityCompletedToday: string;
      unitSymbol?: string | null;
      notes?: string | null;
    }>,
    materialData: Array<{
      itemId: string;
      quantityConsumed: string;
      notes?: string | null;
    }>,
    executor: TxOrDb = this.db,
  ) {
    const [report] = await executor
      .update(dailyProgressReports)
      .set({
        currentRevisionNumber: newRevisionNumber,
        status: 'submitted',
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNotes: null,
        updatedAt: new Date(),
        rowVersion: sql`${dailyProgressReports.rowVersion} + 1`,
      })
      .where(and(eq(dailyProgressReports.companyId, companyId), eq(dailyProgressReports.id, reportId)))
      .returning();

    const [revision] = await executor
      .insert(dailyReportRevisions)
      .values({
        companyId,
        dailyReportId: reportId,
        revisionNumber: newRevisionNumber,
        ...revisionData,
      })
      .returning();

    if (taskProgressData.length > 0) {
      await executor.insert(dailyReportTaskProgress).values(
        taskProgressData.map((tp) => ({
          companyId,
          dailyReportRevisionId: revision!.id,
          taskId: tp.taskId,
          workCompletedToday: tp.workCompletedToday,
          progressPercentage: tp.progressPercentage,
          quantityCompletedToday: tp.quantityCompletedToday,
          unitSymbol: tp.unitSymbol ?? null,
          notes: tp.notes ?? null,
        })),
      );
    }

    if (materialData.length > 0) {
      await executor.insert(dailyReportMaterialConsumption).values(
        materialData.map((m) => ({
          companyId,
          dailyReportRevisionId: revision!.id,
          projectId,
          itemId: m.itemId,
          quantityConsumed: m.quantityConsumed,
          notes: m.notes ?? null,
          uniqueConsumptionKey: `${projectId}-${revision!.id}-${m.itemId}`,
        })),
      );
    }

    return report!;
  }

  async reviewDailyReport(
    companyId: string,
    reportId: string,
    status: 'approved' | 'returned',
    reviewedByUserId: string,
    reviewNotes: string,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(dailyProgressReports)
      .set({
        status,
        reviewedByUserId,
        reviewNotes,
        reviewedAt: new Date(),
        updatedAt: new Date(),
        rowVersion: sql`${dailyProgressReports.rowVersion} + 1`,
      })
      .where(and(eq(dailyProgressReports.companyId, companyId), eq(dailyProgressReports.id, reportId)))
      .returning();
    return row ?? null;
  }

  // --- Delays ---

  async listDelays(companyId: string, projectId: string) {
    return this.db
      .select({
        id: projectDelays.id,
        projectId: projectDelays.projectId,
        taskId: projectDelays.taskId,
        taskTitle: projectTasks.title,
        delayNumber: projectDelays.delayNumber,
        reasonCategory: projectDelays.reasonCategory,
        responsibleParty: projectDelays.responsibleParty,
        delayDays: projectDelays.delayDays,
        originalTargetDate: projectDelays.originalTargetDate,
        revisedTargetDate: projectDelays.revisedTargetDate,
        impactDescription: projectDelays.impactDescription,
        mitigationPlan: projectDelays.mitigationPlan,
        status: projectDelays.status,
        reportedByUserId: projectDelays.reportedByUserId,
        reportedByName: users.name,
        reviewedByUserId: projectDelays.reviewedByUserId,
        reviewedAt: projectDelays.reviewedAt,
        reviewNotes: projectDelays.reviewNotes,
        createdAt: projectDelays.createdAt,
      })
      .from(projectDelays)
      .leftJoin(projectTasks, eq(projectTasks.id, projectDelays.taskId))
      .innerJoin(users, eq(users.id, projectDelays.reportedByUserId))
      .where(and(eq(projectDelays.companyId, companyId), eq(projectDelays.projectId, projectId)))
      .orderBy(desc(projectDelays.createdAt));
  }

  async findDelay(companyId: string, delayId: string) {
    const [row] = await this.db
      .select({
        id: projectDelays.id,
        projectId: projectDelays.projectId,
        taskId: projectDelays.taskId,
        taskTitle: projectTasks.title,
        delayNumber: projectDelays.delayNumber,
        reasonCategory: projectDelays.reasonCategory,
        responsibleParty: projectDelays.responsibleParty,
        delayDays: projectDelays.delayDays,
        originalTargetDate: projectDelays.originalTargetDate,
        revisedTargetDate: projectDelays.revisedTargetDate,
        impactDescription: projectDelays.impactDescription,
        mitigationPlan: projectDelays.mitigationPlan,
        status: projectDelays.status,
        reportedByUserId: projectDelays.reportedByUserId,
        reportedByName: users.name,
        reviewedByUserId: projectDelays.reviewedByUserId,
        reviewedAt: projectDelays.reviewedAt,
        reviewNotes: projectDelays.reviewNotes,
        rowVersion: projectDelays.rowVersion,
        createdAt: projectDelays.createdAt,
      })
      .from(projectDelays)
      .leftJoin(projectTasks, eq(projectTasks.id, projectDelays.taskId))
      .innerJoin(users, eq(users.id, projectDelays.reportedByUserId))
      .where(and(eq(projectDelays.companyId, companyId), eq(projectDelays.id, delayId)))
      .limit(1);

    return row ?? null;
  }

  async createDelay(
    data: {
      companyId: string;
      projectId: string;
      taskId?: string | null;
      delayNumber: string;
      reasonCategory: string;
      responsibleParty: string;
      delayDays: number;
      originalTargetDate: string;
      revisedTargetDate: string;
      impactDescription: string;
      mitigationPlan: string;
      reportedByUserId: string;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(projectDelays)
      .values(data)
      .returning();
    return row!;
  }

  async reviewDelay(
    companyId: string,
    delayId: string,
    status: 'approved' | 'rejected',
    reviewedByUserId: string,
    reviewNotes: string,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectDelays)
      .set({
        status,
        reviewedByUserId,
        reviewNotes,
        reviewedAt: new Date(),
        updatedAt: new Date(),
        rowVersion: sql`${projectDelays.rowVersion} + 1`,
      })
      .where(and(eq(projectDelays.companyId, companyId), eq(projectDelays.id, delayId)))
      .returning();
    return row ?? null;
  }

  // --- Variations ---

  async listVariations(companyId: string, projectId: string) {
    return this.db
      .select({
        id: projectVariations.id,
        projectId: projectVariations.projectId,
        variationNumber: projectVariations.variationNumber,
        title: projectVariations.title,
        description: projectVariations.description,
        reasonCategory: projectVariations.reasonCategory,
        scopeDeltaSummary: projectVariations.scopeDeltaSummary,
        scheduleImpactDays: projectVariations.scheduleImpactDays,
        costImpactAmount: projectVariations.costImpactAmount,
        status: projectVariations.status,
        initiatorUserId: projectVariations.initiatorUserId,
        initiatorName: users.name,
        designReviewNotes: projectVariations.designReviewNotes,
        designReviewedAt: projectVariations.designReviewedAt,
        customerEvidenceSnapshot: projectVariations.customerEvidenceSnapshot,
        customerApprovedAt: projectVariations.customerApprovedAt,
        revisedBoqRevisionId: projectVariations.revisedBoqRevisionId,
        revisedDesignRevisionId: projectVariations.revisedDesignRevisionId,
        createdAt: projectVariations.createdAt,
      })
      .from(projectVariations)
      .innerJoin(users, eq(users.id, projectVariations.initiatorUserId))
      .where(and(eq(projectVariations.companyId, companyId), eq(projectVariations.projectId, projectId)))
      .orderBy(desc(projectVariations.createdAt));
  }

  async findVariation(companyId: string, variationId: string) {
    const [row] = await this.db
      .select({
        id: projectVariations.id,
        projectId: projectVariations.projectId,
        variationNumber: projectVariations.variationNumber,
        title: projectVariations.title,
        description: projectVariations.description,
        reasonCategory: projectVariations.reasonCategory,
        scopeDeltaSummary: projectVariations.scopeDeltaSummary,
        scheduleImpactDays: projectVariations.scheduleImpactDays,
        costImpactAmount: projectVariations.costImpactAmount,
        status: projectVariations.status,
        initiatorUserId: projectVariations.initiatorUserId,
        initiatorName: users.name,
        designReviewNotes: projectVariations.designReviewNotes,
        designReviewedByUserId: projectVariations.designReviewedByUserId,
        designReviewedAt: projectVariations.designReviewedAt,
        customerEvidenceSnapshot: projectVariations.customerEvidenceSnapshot,
        customerApprovedAt: projectVariations.customerApprovedAt,
        revisedBoqRevisionId: projectVariations.revisedBoqRevisionId,
        revisedDesignRevisionId: projectVariations.revisedDesignRevisionId,
        rowVersion: projectVariations.rowVersion,
        createdAt: projectVariations.createdAt,
      })
      .from(projectVariations)
      .innerJoin(users, eq(users.id, projectVariations.initiatorUserId))
      .where(and(eq(projectVariations.companyId, companyId), eq(projectVariations.id, variationId)))
      .limit(1);

    return row ?? null;
  }

  async createVariation(
    data: {
      companyId: string;
      projectId: string;
      variationNumber: string;
      title: string;
      description: string;
      reasonCategory: string;
      scopeDeltaSummary: string;
      scheduleImpactDays: number;
      costImpactAmount: string;
      initiatorUserId: string;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(projectVariations)
      .values(data)
      .returning();
    return row!;
  }

  async reviewVariationInternal(
    companyId: string,
    variationId: string,
    data: {
      status: 'approved_internal' | 'rejected';
      designReviewNotes: string;
      designReviewedByUserId: string;
      revisedBoqRevisionId?: string | null;
      revisedDesignRevisionId?: string | null;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectVariations)
      .set({
        ...data,
        designReviewedAt: new Date(),
        updatedAt: new Date(),
        rowVersion: sql`${projectVariations.rowVersion} + 1`,
      })
      .where(and(eq(projectVariations.companyId, companyId), eq(projectVariations.id, variationId)))
      .returning();
    return row ?? null;
  }

  async recordVariationCustomerApproval(
    companyId: string,
    variationId: string,
    data: {
      customerEvidenceSnapshot: string;
      customerApprovedAt: Date;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectVariations)
      .set({
        status: 'customer_approved',
        customerEvidenceSnapshot: data.customerEvidenceSnapshot,
        customerApprovedAt: data.customerApprovedAt,
        updatedAt: new Date(),
        rowVersion: sql`${projectVariations.rowVersion} + 1`,
      })
      .where(and(eq(projectVariations.companyId, companyId), eq(projectVariations.id, variationId)))
      .returning();
    return row ?? null;
  }

  // --- Expenses ---

  async listExpenses(companyId: string, projectId: string) {
    return this.db
      .select({
        id: projectExpenses.id,
        projectId: projectExpenses.projectId,
        expenseNumber: projectExpenses.expenseNumber,
        category: projectExpenses.category,
        amount: projectExpenses.amount,
        expenseDate: projectExpenses.expenseDate,
        description: projectExpenses.description,
        receiptFileUrl: projectExpenses.receiptFileUrl,
        status: projectExpenses.status,
        submittedByUserId: projectExpenses.submittedByUserId,
        submittedByName: users.name,
        approvedByUserId: projectExpenses.approvedByUserId,
        approvedAt: projectExpenses.approvedAt,
        reviewNotes: projectExpenses.reviewNotes,
        createdAt: projectExpenses.createdAt,
      })
      .from(projectExpenses)
      .innerJoin(users, eq(users.id, projectExpenses.submittedByUserId))
      .where(and(eq(projectExpenses.companyId, companyId), eq(projectExpenses.projectId, projectId)))
      .orderBy(desc(projectExpenses.expenseDate), desc(projectExpenses.createdAt));
  }

  async findExpense(companyId: string, expenseId: string) {
    const [row] = await this.db
      .select()
      .from(projectExpenses)
      .where(and(eq(projectExpenses.companyId, companyId), eq(projectExpenses.id, expenseId)))
      .limit(1);
    return row ?? null;
  }

  async createExpense(
    data: {
      companyId: string;
      projectId: string;
      expenseNumber: string;
      category: string;
      amount: string;
      expenseDate: string;
      description: string;
      receiptFileUrl?: string | null;
      submittedByUserId: string;
    },
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(projectExpenses)
      .values(data)
      .returning();
    return row!;
  }

  async reviewExpense(
    companyId: string,
    expenseId: string,
    status: 'approved' | 'rejected',
    approvedByUserId: string,
    reviewNotes?: string | null,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectExpenses)
      .set({
        status,
        approvedByUserId,
        approvedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
        updatedAt: new Date(),
        rowVersion: sql`${projectExpenses.rowVersion} + 1`,
      })
      .where(and(eq(projectExpenses.companyId, companyId), eq(projectExpenses.id, expenseId)))
      .returning();
    return row ?? null;
  }
}

