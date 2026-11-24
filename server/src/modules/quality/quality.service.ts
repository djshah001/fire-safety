import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { hasPermission } from '../auth/auth.middleware.js';
import { isAdministrator } from '../../core/security/administrator.js';
import { QualityRepository } from './quality.repository.js';
import {
  certifyOperationalCompletionSchema,
  closePunchItemSchema,
  createChecklistTemplateSchema,
  createInspectionSchema,
  createPunchItemSchema,
  createTestReportSchema,
  executeCommercialClosureSchema,
  executeInspectionSchema,
  rectifyPunchItemSchema,
  reviewInspectionSchema,
  updateChecklistTemplateSchema,
  updateClearanceCertificateSchema,
  updateCompletionDocumentSchema,
  updateNocCertificateSchema,
  updatePunchItemSchema,
  updateTestReportSchema,
} from './quality.schemas.js';

export class QualityService {
  constructor(private readonly repo: QualityRepository) {}

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

  // ==========================================
  // Checklist Templates
  // ==========================================

  async listTemplates(principal: AuthenticatedPrincipal, category?: string) {
    this.assertPermission(principal, 'project.quality.read');
    return this.repo.listTemplates(principal.companyId, category);
  }

  async getTemplate(principal: AuthenticatedPrincipal, templateId: string) {
    this.assertPermission(principal, 'project.quality.read');
    const template = await this.repo.findTemplateById(principal.companyId, templateId);
    if (!template) {
      const err: any = new Error('Checklist template not found.');
      err.statusCode = 404;
      throw err;
    }
    return template;
  }

  async createTemplate(principal: AuthenticatedPrincipal, payload: unknown) {
    this.assertPermission(principal, 'project.quality.manage');
    const parsed = createChecklistTemplateSchema.parse(payload);

    return this.repo.createTemplate({
      companyId: principal.companyId,
      code: parsed.code,
      title: parsed.title,
      category: parsed.category,
      description: parsed.description ?? null,
      items: parsed.items,
      isActive: true,
    });
  }

  async updateTemplate(principal: AuthenticatedPrincipal, templateId: string, payload: unknown) {
    this.assertPermission(principal, 'project.quality.manage');
    const parsed = updateChecklistTemplateSchema.parse(payload);

    const existing = await this.repo.findTemplateById(principal.companyId, templateId);
    if (!existing) {
      const err: any = new Error('Checklist template not found.');
      err.statusCode = 404;
      throw err;
    }

    return this.repo.updateTemplate(principal.companyId, templateId, {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.category !== undefined ? { category: parsed.category } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.items !== undefined ? { items: parsed.items } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
    });
  }

  // ==========================================
  // Quality Inspections
  // ==========================================

  async listInspections(principal: AuthenticatedPrincipal, projectId: string, status?: string) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listInspections(principal.companyId, projectId, status);
  }

  async getInspection(principal: AuthenticatedPrincipal, projectId: string, inspectionId: string) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);

    const inspection = await this.repo.findInspectionById(principal.companyId, inspectionId);
    if (!inspection || inspection.projectId !== projectId) {
      const err: any = new Error('Inspection not found.');
      err.statusCode = 404;
      throw err;
    }
    return inspection;
  }

  async createInspection(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.quality.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createInspectionSchema.parse(payload);

    let initialResults: any[] = [];
    if (parsed.templateId) {
      const template = await this.repo.findTemplateById(principal.companyId, parsed.templateId);
      if (template && Array.isArray(template.items)) {
        initialResults = (template.items as any[]).map((item) => ({
          itemKey: item.itemKey,
          title: item.title,
          status: 'na',
          remarks: null,
          photoUrl: null,
        }));
      }
    }

    const inspectionNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'quality_inspection',
      'INS',
    );

    return this.repo.createInspection({
      companyId: principal.companyId,
      projectId,
      templateId: parsed.templateId ?? null,
      inspectionNumber,
      title: parsed.title,
      category: parsed.category,
      inspectionDate: parsed.inspectionDate,
      inspectorUserId: parsed.inspectorUserId ?? principal.userId,
      witnessName: parsed.witnessName ?? null,
      status: 'scheduled',
      results: initialResults,
      summaryRemarks: null,
    });
  }

  async executeInspection(
    principal: AuthenticatedPrincipal,
    projectId: string,
    inspectionId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.quality.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = executeInspectionSchema.parse(payload);

    const inspection = await this.repo.findInspectionById(principal.companyId, inspectionId);
    if (!inspection || inspection.projectId !== projectId) {
      const err: any = new Error('Inspection not found.');
      err.statusCode = 404;
      throw err;
    }

    return this.repo.updateInspection(principal.companyId, inspectionId, {
      results: parsed.results,
      summaryRemarks: parsed.summaryRemarks ?? null,
      witnessName: parsed.witnessName ?? inspection.witnessName,
      status: parsed.status,
    });
  }

  async reviewInspection(
    principal: AuthenticatedPrincipal,
    projectId: string,
    inspectionId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.quality.review');
    await this.assertProjectAccess(principal, projectId);
    const parsed = reviewInspectionSchema.parse(payload);

    const inspection = await this.repo.findInspectionById(principal.companyId, inspectionId);
    if (!inspection || inspection.projectId !== projectId) {
      const err: any = new Error('Inspection not found.');
      err.statusCode = 404;
      throw err;
    }

    // Independent review invariant: Inspector cannot review their own inspection unless administrator
    if (inspection.inspectorUserId === principal.userId && !isAdministrator(principal)) {
      const err: any = new Error(
        'Forbidden: independent review required. An inspector cannot review or sign off their own inspection.',
      );
      err.statusCode = 403;
      throw err;
    }

    return this.repo.updateInspection(principal.companyId, inspectionId, {
      status: parsed.status,
      summaryRemarks: parsed.summaryRemarks ?? inspection.summaryRemarks,
      reviewedByUserId: principal.userId,
      reviewedAt: new Date(),
    });
  }

  // ==========================================
  // Test Reports
  // ==========================================

  async listTestReports(principal: AuthenticatedPrincipal, projectId: string, testType?: string) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listTestReports(principal.companyId, projectId, testType);
  }

  async getTestReport(principal: AuthenticatedPrincipal, projectId: string, reportId: string) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);

    const report = await this.repo.findTestReportById(principal.companyId, reportId);
    if (!report || report.projectId !== projectId) {
      const err: any = new Error('Test report not found.');
      err.statusCode = 404;
      throw err;
    }
    return report;
  }

  async createTestReport(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.quality.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createTestReportSchema.parse(payload);

    const reportNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'test_report',
      'TR',
    );

    return this.repo.createTestReport({
      companyId: principal.companyId,
      projectId,
      inspectionId: parsed.inspectionId ?? null,
      reportNumber,
      testType: parsed.testType,
      testDate: parsed.testDate,
      testLocation: parsed.testLocation,
      parameters: parsed.parameters,
      conductedByUserId: principal.userId,
      witnessedBy: parsed.witnessedBy ?? null,
      status: parsed.status,
      certificateUrl: parsed.certificateUrl ?? null,
      remarks: parsed.remarks ?? null,
    });
  }

  async updateTestReport(
    principal: AuthenticatedPrincipal,
    projectId: string,
    reportId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.quality.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updateTestReportSchema.parse(payload);

    const report = await this.repo.findTestReportById(principal.companyId, reportId);
    if (!report || report.projectId !== projectId) {
      const err: any = new Error('Test report not found.');
      err.statusCode = 404;
      throw err;
    }

    // Invariant: Non-admin who conducted the test cannot verify it
    if (
      parsed.status === 'verified' &&
      report.conductedByUserId === principal.userId &&
      !isAdministrator(principal)
    ) {
      const err: any = new Error(
        'Forbidden: independent verification required. The engineer who conducted the test cannot verify it.',
      );
      err.statusCode = 403;
      throw err;
    }

    return this.repo.updateTestReport(principal.companyId, reportId, {
      ...(parsed.testLocation !== undefined ? { testLocation: parsed.testLocation } : {}),
      ...(parsed.parameters !== undefined ? { parameters: parsed.parameters } : {}),
      ...(parsed.witnessedBy !== undefined ? { witnessedBy: parsed.witnessedBy } : {}),
      ...(parsed.certificateUrl !== undefined ? { certificateUrl: parsed.certificateUrl } : {}),
      ...(parsed.remarks !== undefined ? { remarks: parsed.remarks } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    });
  }

  // ==========================================
  // Punch Items
  // ==========================================

  async listPunchItems(
    principal: AuthenticatedPrincipal,
    projectId: string,
    filters?: { severity?: string; status?: string; assignedToUserId?: string },
  ) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);
    return this.repo.listPunchItems(principal.companyId, projectId, filters);
  }

  async getPunchItem(principal: AuthenticatedPrincipal, projectId: string, itemId: string) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);

    const punchItem = await this.repo.findPunchItemById(principal.companyId, itemId);
    if (!punchItem || punchItem.projectId !== projectId) {
      const err: any = new Error('Punch item not found.');
      err.statusCode = 404;
      throw err;
    }
    return punchItem;
  }

  async createPunchItem(principal: AuthenticatedPrincipal, projectId: string, payload: unknown) {
    this.assertPermission(principal, 'project.punch_item.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = createPunchItemSchema.parse(payload);

    const itemNumber = await this.repo.allocateDocumentNumber(
      principal.companyId,
      'punch_item',
      'PCH',
    );

    return this.repo.createPunchItem({
      companyId: principal.companyId,
      projectId,
      inspectionId: parsed.inspectionId ?? null,
      itemNumber,
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
      severity: parsed.severity,
      status: parsed.assignedToUserId ? 'assigned' : 'open',
      assignedToUserId: parsed.assignedToUserId ?? null,
      dueDate: parsed.dueDate ?? null,
      photoUrl: parsed.photoUrl ?? null,
      reportedByUserId: principal.userId,
    });
  }

  async updatePunchItem(
    principal: AuthenticatedPrincipal,
    projectId: string,
    itemId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.punch_item.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updatePunchItemSchema.parse(payload);

    const existing = await this.repo.findPunchItemById(principal.companyId, itemId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Punch item not found.');
      err.statusCode = 404;
      throw err;
    }

    return this.repo.updatePunchItem(principal.companyId, itemId, {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.location !== undefined ? { location: parsed.location } : {}),
      ...(parsed.severity !== undefined ? { severity: parsed.severity } : {}),
      ...(parsed.assignedToUserId !== undefined
        ? {
            assignedToUserId: parsed.assignedToUserId,
            status: parsed.assignedToUserId ? 'assigned' : existing.status,
          }
        : {}),
      ...(parsed.dueDate !== undefined ? { dueDate: parsed.dueDate } : {}),
      ...(parsed.photoUrl !== undefined ? { photoUrl: parsed.photoUrl } : {}),
    });
  }

  async rectifyPunchItem(
    principal: AuthenticatedPrincipal,
    projectId: string,
    itemId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.punch_item.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = rectifyPunchItemSchema.parse(payload);

    const existing = await this.repo.findPunchItemById(principal.companyId, itemId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Punch item not found.');
      err.statusCode = 404;
      throw err;
    }

    return this.repo.updatePunchItem(principal.companyId, itemId, {
      status: 'rectified',
      rectifiedAt: new Date(),
      rectificationNotes: parsed.rectificationNotes,
      rectificationPhotoUrl: parsed.rectificationPhotoUrl ?? existing.rectificationPhotoUrl,
    });
  }

  async closePunchItem(
    principal: AuthenticatedPrincipal,
    projectId: string,
    itemId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.punch_item.close');
    await this.assertProjectAccess(principal, projectId);
    const parsed = closePunchItemSchema.parse(payload);

    const existing = await this.repo.findPunchItemById(principal.companyId, itemId);
    if (!existing || existing.projectId !== projectId) {
      const err: any = new Error('Punch item not found.');
      err.statusCode = 404;
      throw err;
    }

    // Invariant: Non-administrator cannot verify and close their own punch item or one they rectified
    if (
      (existing.reportedByUserId === principal.userId ||
        existing.assignedToUserId === principal.userId) &&
      !isAdministrator(principal)
    ) {
      const err: any = new Error(
        'Forbidden: independent verification required. The author or assigned engineer cannot close this punch item.',
      );
      err.statusCode = 403;
      throw err;
    }

    return this.repo.updatePunchItem(principal.companyId, itemId, {
      status: parsed.status,
      closedByUserId: parsed.status === 'verified_closed' ? principal.userId : null,
      closedAt: parsed.status === 'verified_closed' ? new Date() : null,
      closureRemarks: parsed.closureRemarks,
    });
  }

  // ==========================================
  // Handover & Statutory Documents
  // ==========================================

  async getHandoverRecord(principal: AuthenticatedPrincipal, projectId: string) {
    this.assertPermission(principal, 'project.quality.read');
    await this.assertProjectAccess(principal, projectId);

    const record = await this.repo.getOrCreateHandoverRecord(principal.companyId, projectId);
    const unresolvedCriticalMajorCount =
      await this.repo.countUnresolvedCriticalMajorPunchItems(principal.companyId, projectId);

    return {
      ...record,
      unresolvedCriticalMajorCount,
      isReadyForOperationalCompletion:
        record.clearanceCertificateStatus === 'accepted' &&
        Boolean(record.clearanceCertificateNumber) &&
        Boolean(record.clearanceCertificateFileUrl) &&
        record.nocStatus === 'accepted' &&
        Boolean(record.nocNumber) &&
        Boolean(record.nocFileUrl) &&
        record.completionDocumentStatus === 'accepted' &&
        Boolean(record.completionDocumentNumber) &&
        Boolean(record.completionDocumentFileUrl) &&
        unresolvedCriticalMajorCount === 0,
    };
  }

  async updateClearanceCertificate(
    principal: AuthenticatedPrincipal,
    projectId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.handover.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updateClearanceCertificateSchema.parse(payload);

    await this.repo.getOrCreateHandoverRecord(principal.companyId, projectId);

    return this.repo.updateHandoverRecord(principal.companyId, projectId, {
      clearanceCertificateNumber: parsed.clearanceCertificateNumber,
      clearanceCertificateIssuer: parsed.clearanceCertificateIssuer,
      clearanceCertificateDate: parsed.clearanceCertificateDate,
      clearanceCertificateFileUrl: parsed.clearanceCertificateFileUrl,
      clearanceCertificateStatus: parsed.clearanceCertificateStatus,
    });
  }

  async updateNocCertificate(
    principal: AuthenticatedPrincipal,
    projectId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.handover.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updateNocCertificateSchema.parse(payload);

    await this.repo.getOrCreateHandoverRecord(principal.companyId, projectId);

    return this.repo.updateHandoverRecord(principal.companyId, projectId, {
      nocNumber: parsed.nocNumber,
      nocIssuer: parsed.nocIssuer,
      nocDate: parsed.nocDate,
      nocExpiryDate: parsed.nocExpiryDate ?? null,
      nocFileUrl: parsed.nocFileUrl,
      nocStatus: parsed.nocStatus,
    });
  }

  async updateCompletionDocument(
    principal: AuthenticatedPrincipal,
    projectId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.handover.manage');
    await this.assertProjectAccess(principal, projectId);
    const parsed = updateCompletionDocumentSchema.parse(payload);

    await this.repo.getOrCreateHandoverRecord(principal.companyId, projectId);

    return this.repo.updateHandoverRecord(principal.companyId, projectId, {
      completionDocumentNumber: parsed.completionDocumentNumber,
      completionSignatoryName: parsed.completionSignatoryName,
      completionDate: parsed.completionDate,
      completionDocumentFileUrl: parsed.completionDocumentFileUrl,
      completionDocumentStatus: parsed.completionDocumentStatus,
    });
  }

  // ==========================================
  // Operational Completion & Commercial Closure Gates
  // ==========================================

  async certifyOperationalCompletion(
    principal: AuthenticatedPrincipal,
    projectId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.handover.certify');
    await this.assertProjectAccess(principal, projectId);
    const parsed = certifyOperationalCompletionSchema.parse(payload);

    const handover = await this.repo.getOrCreateHandoverRecord(principal.companyId, projectId);

    // Business Invariant 10: Mandatory Accepted Statutory Evidence
    // 1. Fire Department Clearance Certificate
    if (
      handover.clearanceCertificateStatus !== 'accepted' ||
      !handover.clearanceCertificateNumber ||
      !handover.clearanceCertificateFileUrl
    ) {
      const err: any = new Error(
        'Operational completion blocked: Fire Department Clearance Certificate must be uploaded and accepted.',
      );
      err.statusCode = 400;
      throw err;
    }

    // 2. Fire Department NOC
    if (
      handover.nocStatus !== 'accepted' ||
      !handover.nocNumber ||
      !handover.nocFileUrl
    ) {
      const err: any = new Error(
        'Operational completion blocked: Fire Department No Objection Certificate (NOC) must be uploaded and accepted.',
      );
      err.statusCode = 400;
      throw err;
    }

    // 3. Practical Completion Document
    if (
      handover.completionDocumentStatus !== 'accepted' ||
      !handover.completionDocumentNumber ||
      !handover.completionDocumentFileUrl
    ) {
      const err: any = new Error(
        'Operational completion blocked: Practical Completion Document signed by client must be uploaded and accepted.',
      );
      err.statusCode = 400;
      throw err;
    }

    // 4. Punch List Quality Gate: Zero critical or major punch items
    const unresolvedSnags = await this.repo.countUnresolvedCriticalMajorPunchItems(
      principal.companyId,
      projectId,
    );
    if (unresolvedSnags > 0) {
      const err: any = new Error(
        `Operational completion blocked: ${unresolvedSnags} critical or major punch item(s) remain unresolved.`,
      );
      err.statusCode = 400;
      throw err;
    }

    return this.repo.withTransaction(async (tx) => {
      const updatedHandover = await this.repo.updateHandoverRecord(
        principal.companyId,
        projectId,
        {
          status: 'operationally_complete',
          operationalCompletionDate: new Date(),
          completedByUserId: principal.userId,
          completionNotes: parsed.completionNotes ?? null,
        },
        tx,
      );

      // Transition project status to completed
      await this.repo.updateProjectStatus(principal.companyId, projectId, 'completed', tx);

      return updatedHandover;
    });
  }

  async executeCommercialClosure(
    principal: AuthenticatedPrincipal,
    projectId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, 'project.closure.execute');
    await this.assertProjectAccess(principal, projectId);
    const parsed = executeCommercialClosureSchema.parse(payload);

    const handover = await this.repo.getOrCreateHandoverRecord(principal.companyId, projectId);

    if (handover.status !== 'operationally_complete' && handover.status !== 'closed') {
      const err: any = new Error(
        'Commercial closure blocked: Project must be operationally complete first.',
      );
      err.statusCode = 400;
      throw err;
    }

    return this.repo.updateHandoverRecord(principal.companyId, projectId, {
      status: 'closed',
      commercialClosureDate: new Date(),
      commercialClosureNotes: parsed.commercialClosureNotes ?? null,
    });
  }
}
