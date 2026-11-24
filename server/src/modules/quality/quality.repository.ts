import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { administratorScope } from "../../core/security/administrator.js";
import {
  documentCounters,
  projectHandoverRecords,
  projectMembers,
  projectPunchItems,
  projects,
  qualityChecklistTemplates,
  qualityInspections,
  qualityTestReports,
  users,
} from "../../infrastructure/database/schema/index.js";

export type TxOrDb = NodePgDatabase<Record<string, unknown>>;

export class QualityRepository {
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
      .values({
        companyId,
        documentType,
        periodKey,
        nextValue: 2,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          documentCounters.companyId,
          documentCounters.documentType,
          documentCounters.periodKey,
        ],
        set: {
          nextValue: sql`${documentCounters.nextValue} + 1`,
          updatedAt: now,
        },
      })
      .returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });

    if (!counter) {
      throw new Error(`Failed to allocate document number for ${documentType}`);
    }

    const seq = String(counter.allocated).padStart(5, "0");
    return `${prefix}-${year}-${seq}`;
  }

  async checkProjectAccess(
    companyId: string,
    userId: string,
    projectId: string,
  ): Promise<boolean> {
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

  async updateProjectStatus(
    companyId: string,
    projectId: string,
    status: "started" | "on_hold" | "completed" | "cancelled",
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projects)
      .set({
        status,
        rowVersion: sql`${projects.rowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.companyId, companyId), eq(projects.id, projectId)))
      .returning();
    return row ?? null;
  }

  // ==========================================
  // Checklist Templates
  // ==========================================

  async listTemplates(companyId: string, category?: string) {
    const conditions = [eq(qualityChecklistTemplates.companyId, companyId)];
    if (category) {
      conditions.push(eq(qualityChecklistTemplates.category, category));
    }

    return this.db
      .select()
      .from(qualityChecklistTemplates)
      .where(and(...conditions))
      .orderBy(
        asc(qualityChecklistTemplates.category),
        asc(qualityChecklistTemplates.title),
      );
  }

  async findTemplateById(companyId: string, templateId: string) {
    const [row] = await this.db
      .select()
      .from(qualityChecklistTemplates)
      .where(
        and(
          eq(qualityChecklistTemplates.companyId, companyId),
          eq(qualityChecklistTemplates.id, templateId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createTemplate(
    data: typeof qualityChecklistTemplates.$inferInsert,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(qualityChecklistTemplates)
      .values(data)
      .returning();
    return row;
  }

  async updateTemplate(
    companyId: string,
    templateId: string,
    data: Partial<typeof qualityChecklistTemplates.$inferInsert>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(qualityChecklistTemplates)
      .set({
        ...data,
        rowVersion: sql`${qualityChecklistTemplates.rowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(qualityChecklistTemplates.companyId, companyId),
          eq(qualityChecklistTemplates.id, templateId),
        ),
      )
      .returning();
    return row ?? null;
  }

  // ==========================================
  // Quality Inspections
  // ==========================================

  async listInspections(companyId: string, projectId: string, status?: string) {
    const conditions = [
      eq(qualityInspections.companyId, companyId),
      eq(qualityInspections.projectId, projectId),
    ];
    if (status) {
      conditions.push(eq(qualityInspections.status, status));
    }

    return this.db
      .select({
        id: qualityInspections.id,
        inspectionNumber: qualityInspections.inspectionNumber,
        projectId: qualityInspections.projectId,
        templateId: qualityInspections.templateId,
        title: qualityInspections.title,
        category: qualityInspections.category,
        inspectionDate: qualityInspections.inspectionDate,
        inspectorUserId: qualityInspections.inspectorUserId,
        inspectorName: users.name,
        witnessName: qualityInspections.witnessName,
        status: qualityInspections.status,
        results: qualityInspections.results,
        summaryRemarks: qualityInspections.summaryRemarks,
        reviewedByUserId: qualityInspections.reviewedByUserId,
        reviewedAt: qualityInspections.reviewedAt,
        createdAt: qualityInspections.createdAt,
      })
      .from(qualityInspections)
      .leftJoin(users, eq(qualityInspections.inspectorUserId, users.id))
      .where(and(...conditions))
      .orderBy(
        desc(qualityInspections.inspectionDate),
        desc(qualityInspections.createdAt),
      );
  }

  async findInspectionById(companyId: string, inspectionId: string) {
    const [row] = await this.db
      .select({
        id: qualityInspections.id,
        inspectionNumber: qualityInspections.inspectionNumber,
        companyId: qualityInspections.companyId,
        projectId: qualityInspections.projectId,
        templateId: qualityInspections.templateId,
        title: qualityInspections.title,
        category: qualityInspections.category,
        inspectionDate: qualityInspections.inspectionDate,
        inspectorUserId: qualityInspections.inspectorUserId,
        inspectorName: users.name,
        witnessName: qualityInspections.witnessName,
        status: qualityInspections.status,
        results: qualityInspections.results,
        summaryRemarks: qualityInspections.summaryRemarks,
        reviewedByUserId: qualityInspections.reviewedByUserId,
        reviewedAt: qualityInspections.reviewedAt,
        rowVersion: qualityInspections.rowVersion,
        createdAt: qualityInspections.createdAt,
      })
      .from(qualityInspections)
      .leftJoin(users, eq(qualityInspections.inspectorUserId, users.id))
      .where(
        and(
          eq(qualityInspections.companyId, companyId),
          eq(qualityInspections.id, inspectionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createInspection(
    data: typeof qualityInspections.$inferInsert,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(qualityInspections)
      .values(data)
      .returning();
    return row;
  }

  async updateInspection(
    companyId: string,
    inspectionId: string,
    data: Partial<typeof qualityInspections.$inferInsert>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(qualityInspections)
      .set({
        ...data,
        rowVersion: sql`${qualityInspections.rowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(qualityInspections.companyId, companyId),
          eq(qualityInspections.id, inspectionId),
        ),
      )
      .returning();
    return row ?? null;
  }

  // ==========================================
  // Test Reports
  // ==========================================

  async listTestReports(
    companyId: string,
    projectId: string,
    testType?: string,
  ) {
    const conditions = [
      eq(qualityTestReports.companyId, companyId),
      eq(qualityTestReports.projectId, projectId),
    ];
    if (testType) {
      conditions.push(eq(qualityTestReports.testType, testType));
    }

    return this.db
      .select({
        id: qualityTestReports.id,
        reportNumber: qualityTestReports.reportNumber,
        projectId: qualityTestReports.projectId,
        inspectionId: qualityTestReports.inspectionId,
        testType: qualityTestReports.testType,
        testDate: qualityTestReports.testDate,
        testLocation: qualityTestReports.testLocation,
        parameters: qualityTestReports.parameters,
        conductedByUserId: qualityTestReports.conductedByUserId,
        conductedByName: users.name,
        witnessedBy: qualityTestReports.witnessedBy,
        status: qualityTestReports.status,
        certificateUrl: qualityTestReports.certificateUrl,
        remarks: qualityTestReports.remarks,
        createdAt: qualityTestReports.createdAt,
      })
      .from(qualityTestReports)
      .leftJoin(users, eq(qualityTestReports.conductedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(
        desc(qualityTestReports.testDate),
        desc(qualityTestReports.createdAt),
      );
  }

  async findTestReportById(companyId: string, reportId: string) {
    const [row] = await this.db
      .select({
        id: qualityTestReports.id,
        reportNumber: qualityTestReports.reportNumber,
        companyId: qualityTestReports.companyId,
        projectId: qualityTestReports.projectId,
        inspectionId: qualityTestReports.inspectionId,
        testType: qualityTestReports.testType,
        testDate: qualityTestReports.testDate,
        testLocation: qualityTestReports.testLocation,
        parameters: qualityTestReports.parameters,
        conductedByUserId: qualityTestReports.conductedByUserId,
        conductedByName: users.name,
        witnessedBy: qualityTestReports.witnessedBy,
        status: qualityTestReports.status,
        certificateUrl: qualityTestReports.certificateUrl,
        remarks: qualityTestReports.remarks,
        rowVersion: qualityTestReports.rowVersion,
        createdAt: qualityTestReports.createdAt,
      })
      .from(qualityTestReports)
      .leftJoin(users, eq(qualityTestReports.conductedByUserId, users.id))
      .where(
        and(
          eq(qualityTestReports.companyId, companyId),
          eq(qualityTestReports.id, reportId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createTestReport(
    data: typeof qualityTestReports.$inferInsert,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(qualityTestReports)
      .values(data)
      .returning();
    return row;
  }

  async updateTestReport(
    companyId: string,
    reportId: string,
    data: Partial<typeof qualityTestReports.$inferInsert>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(qualityTestReports)
      .set({
        ...data,
        rowVersion: sql`${qualityTestReports.rowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(qualityTestReports.companyId, companyId),
          eq(qualityTestReports.id, reportId),
        ),
      )
      .returning();
    return row ?? null;
  }

  // ==========================================
  // Punch Items
  // ==========================================

  async listPunchItems(
    companyId: string,
    projectId: string,
    filters?: { severity?: string; status?: string; assignedToUserId?: string },
  ) {
    const conditions = [
      eq(projectPunchItems.companyId, companyId),
      eq(projectPunchItems.projectId, projectId),
    ];
    if (filters?.severity) {
      conditions.push(eq(projectPunchItems.severity, filters.severity));
    }
    if (filters?.status) {
      conditions.push(eq(projectPunchItems.status, filters.status));
    }
    if (filters?.assignedToUserId) {
      conditions.push(
        eq(projectPunchItems.assignedToUserId, filters.assignedToUserId),
      );
    }

    return this.db
      .select({
        id: projectPunchItems.id,
        itemNumber: projectPunchItems.itemNumber,
        projectId: projectPunchItems.projectId,
        inspectionId: projectPunchItems.inspectionId,
        title: projectPunchItems.title,
        description: projectPunchItems.description,
        location: projectPunchItems.location,
        severity: projectPunchItems.severity,
        status: projectPunchItems.status,
        assignedToUserId: projectPunchItems.assignedToUserId,
        assignedToName: users.name,
        dueDate: projectPunchItems.dueDate,
        photoUrl: projectPunchItems.photoUrl,
        rectifiedAt: projectPunchItems.rectifiedAt,
        rectificationNotes: projectPunchItems.rectificationNotes,
        rectificationPhotoUrl: projectPunchItems.rectificationPhotoUrl,
        closedByUserId: projectPunchItems.closedByUserId,
        closedAt: projectPunchItems.closedAt,
        closureRemarks: projectPunchItems.closureRemarks,
        reportedByUserId: projectPunchItems.reportedByUserId,
        createdAt: projectPunchItems.createdAt,
      })
      .from(projectPunchItems)
      .leftJoin(users, eq(projectPunchItems.assignedToUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(projectPunchItems.createdAt));
  }

  async findPunchItemById(companyId: string, itemId: string) {
    const [row] = await this.db
      .select({
        id: projectPunchItems.id,
        itemNumber: projectPunchItems.itemNumber,
        companyId: projectPunchItems.companyId,
        projectId: projectPunchItems.projectId,
        inspectionId: projectPunchItems.inspectionId,
        title: projectPunchItems.title,
        description: projectPunchItems.description,
        location: projectPunchItems.location,
        severity: projectPunchItems.severity,
        status: projectPunchItems.status,
        assignedToUserId: projectPunchItems.assignedToUserId,
        assignedToName: users.name,
        dueDate: projectPunchItems.dueDate,
        photoUrl: projectPunchItems.photoUrl,
        rectifiedAt: projectPunchItems.rectifiedAt,
        rectificationNotes: projectPunchItems.rectificationNotes,
        rectificationPhotoUrl: projectPunchItems.rectificationPhotoUrl,
        closedByUserId: projectPunchItems.closedByUserId,
        closedAt: projectPunchItems.closedAt,
        closureRemarks: projectPunchItems.closureRemarks,
        reportedByUserId: projectPunchItems.reportedByUserId,
        rowVersion: projectPunchItems.rowVersion,
        createdAt: projectPunchItems.createdAt,
      })
      .from(projectPunchItems)
      .leftJoin(users, eq(projectPunchItems.assignedToUserId, users.id))
      .where(
        and(
          eq(projectPunchItems.companyId, companyId),
          eq(projectPunchItems.id, itemId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createPunchItem(
    data: typeof projectPunchItems.$inferInsert,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .insert(projectPunchItems)
      .values(data)
      .returning();
    return row;
  }

  async updatePunchItem(
    companyId: string,
    itemId: string,
    data: Partial<typeof projectPunchItems.$inferInsert>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectPunchItems)
      .set({
        ...data,
        rowVersion: sql`${projectPunchItems.rowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectPunchItems.companyId, companyId),
          eq(projectPunchItems.id, itemId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async countUnresolvedCriticalMajorPunchItems(
    companyId: string,
    projectId: string,
    executor: TxOrDb = this.db,
  ): Promise<number> {
    const [result] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(projectPunchItems)
      .where(
        and(
          eq(projectPunchItems.companyId, companyId),
          eq(projectPunchItems.projectId, projectId),
          inArray(projectPunchItems.severity, ["critical", "major"]),
          inArray(projectPunchItems.status, ["open", "assigned", "rectified"]),
        ),
      );
    return result?.count ?? 0;
  }

  // ==========================================
  // Handover & Statutory Documents
  // ==========================================

  async getOrCreateHandoverRecord(
    companyId: string,
    projectId: string,
    executor: TxOrDb = this.db,
  ) {
    const [existing] = await executor
      .select()
      .from(projectHandoverRecords)
      .where(
        and(
          eq(projectHandoverRecords.companyId, companyId),
          eq(projectHandoverRecords.projectId, projectId),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await executor
      .insert(projectHandoverRecords)
      .values({
        companyId,
        projectId,
        status: "in_progress",
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return created;
    }

    // If another request created it concurrently
    const [retried] = await executor
      .select()
      .from(projectHandoverRecords)
      .where(
        and(
          eq(projectHandoverRecords.companyId, companyId),
          eq(projectHandoverRecords.projectId, projectId),
        ),
      )
      .limit(1);
    return retried!;
  }

  async updateHandoverRecord(
    companyId: string,
    projectId: string,
    data: Partial<typeof projectHandoverRecords.$inferInsert>,
    executor: TxOrDb = this.db,
  ) {
    const [row] = await executor
      .update(projectHandoverRecords)
      .set({
        ...data,
        rowVersion: sql`${projectHandoverRecords.rowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectHandoverRecords.companyId, companyId),
          eq(projectHandoverRecords.projectId, projectId),
        ),
      )
      .returning();
    return row ?? null;
  }
}
