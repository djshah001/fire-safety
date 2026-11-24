import { describe, expect, it, vi } from 'vitest';
import { QualityService } from './quality.service.js';
import type { QualityRepository } from './quality.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';

describe('QualityService', () => {
  const companyId = 'b0000000-0000-4000-8000-000000000001';
  const projectId = 'f0000000-0000-4000-8000-000000000001';
  const adminUserId = 'a0000000-0000-4000-8000-000000000001';
  const engineerUserId = 'a0000000-0000-4000-8000-000000000002';
  const managerUserId = 'a0000000-0000-4000-8000-000000000003';

  const adminPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-admin',
    userId: adminUserId,
    companyId,
    name: 'Admin User',
    email: 'admin@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'system.access.all',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  const engineerPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-engineer',
    userId: engineerUserId,
    companyId,
    name: 'Site Quality Engineer',
    email: 'engineer@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'project.quality.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.quality.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.punch_item.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  const managerPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-manager',
    userId: managerUserId,
    companyId,
    name: 'Project Manager',
    email: 'manager@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'project.quality.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.quality.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.quality.review',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.punch_item.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.punch_item.close',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.handover.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.handover.certify',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.closure.execute',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  function createMockRepo(overrides: Partial<QualityRepository> = {}): QualityRepository {
    return {
      withTransaction: vi.fn(async (cb: any) => cb({} as any)),
      checkProjectAccess: vi.fn(async () => true),
      allocateDocumentNumber: vi.fn(async (_c, _t, prefix) => `${prefix}-2026-00001`),
      getProject: vi.fn(async () => ({
        id: projectId,
        projectNumber: 'PRJ-2026-00001',
        title: 'Alpha Towers',
        status: 'started',
        startDate: '2026-01-01',
        targetCompletionDate: '2026-12-31',
        rowVersion: 1,
      })),
      updateProjectStatus: vi.fn(async () => ({ id: projectId, status: 'completed' })),
      listTemplates: vi.fn(async () => []),
      findTemplateById: vi.fn(async () => null),
      createTemplate: vi.fn(async (d) => ({ id: 'tpl-1', ...d })),
      updateTemplate: vi.fn(async (_c, _id, d) => ({ id: 'tpl-1', ...d })),
      listInspections: vi.fn(async () => []),
      findInspectionById: vi.fn(async () => null),
      createInspection: vi.fn(async (d) => ({ id: 'ins-1', ...d })),
      updateInspection: vi.fn(async (_c, _id, d) => ({ id: 'ins-1', ...d })),
      listTestReports: vi.fn(async () => []),
      findTestReportById: vi.fn(async () => null),
      createTestReport: vi.fn(async (d) => ({ id: 'tr-1', ...d })),
      updateTestReport: vi.fn(async (_c, _id, d) => ({ id: 'tr-1', ...d })),
      listPunchItems: vi.fn(async () => []),
      findPunchItemById: vi.fn(async () => null),
      createPunchItem: vi.fn(async (d) => ({ id: 'pch-1', ...d })),
      updatePunchItem: vi.fn(async (_c, _id, d) => ({ id: 'pch-1', ...d })),
      countUnresolvedCriticalMajorPunchItems: vi.fn(async () => 0),
      getOrCreateHandoverRecord: vi.fn(async () => ({
        id: 'hnd-1',
        companyId,
        projectId,
        status: 'in_progress',
        clearanceCertificateNumber: null,
        clearanceCertificateIssuer: null,
        clearanceCertificateDate: null,
        clearanceCertificateFileUrl: null,
        clearanceCertificateStatus: 'pending',
        nocNumber: null,
        nocIssuer: null,
        nocDate: null,
        nocExpiryDate: null,
        nocFileUrl: null,
        nocStatus: 'pending',
        completionDocumentNumber: null,
        completionSignatoryName: null,
        completionDate: null,
        completionDocumentFileUrl: null,
        completionDocumentStatus: 'pending',
        operationalCompletionDate: null,
        completedByUserId: null,
        completionNotes: null,
        commercialClosureDate: null,
        commercialClosureNotes: null,
        rowVersion: 1,
      })),
      updateHandoverRecord: vi.fn(async (_c, _pid, d) => ({ id: 'hnd-1', ...d })),
      ...overrides,
    } as unknown as QualityRepository;
  }

  describe('Handover & Operational Completion Gates (Invariant 10)', () => {
    it('blocks operational completion if clearance certificate is not accepted', async () => {
      const repo = createMockRepo({
        getOrCreateHandoverRecord: vi.fn(async () => ({
          id: 'hnd-1',
          companyId,
          projectId,
          status: 'ready_for_inspection',
          clearanceCertificateNumber: null,
          clearanceCertificateIssuer: null,
          clearanceCertificateDate: null,
          clearanceCertificateFileUrl: null,
          clearanceCertificateStatus: 'pending',
          nocNumber: 'NOC-999',
          nocIssuer: 'Fire Dept',
          nocDate: '2026-11-01',
          nocFileUrl: 'https://storage.local/noc.pdf',
          nocStatus: 'accepted',
          completionDocumentNumber: 'COMP-111',
          completionSignatoryName: 'Client Rep',
          completionDate: '2026-11-02',
          completionDocumentFileUrl: 'https://storage.local/comp.pdf',
          completionDocumentStatus: 'accepted',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.certifyOperationalCompletion(managerPrincipal, projectId, {
          completionNotes: 'All work finished',
        }),
      ).rejects.toThrow('Fire Department Clearance Certificate must be uploaded and accepted');
    });

    it('blocks operational completion if Fire Department NOC is missing', async () => {
      const repo = createMockRepo({
        getOrCreateHandoverRecord: vi.fn(async () => ({
          id: 'hnd-1',
          companyId,
          projectId,
          status: 'ready_for_inspection',
          clearanceCertificateNumber: 'CLR-100',
          clearanceCertificateIssuer: 'CFO Office',
          clearanceCertificateDate: '2026-11-01',
          clearanceCertificateFileUrl: 'https://storage.local/clearance.pdf',
          clearanceCertificateStatus: 'accepted',
          nocNumber: null,
          nocFileUrl: null,
          nocStatus: 'pending',
          completionDocumentNumber: 'COMP-111',
          completionSignatoryName: 'Client Rep',
          completionDate: '2026-11-02',
          completionDocumentFileUrl: 'https://storage.local/comp.pdf',
          completionDocumentStatus: 'accepted',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.certifyOperationalCompletion(managerPrincipal, projectId, {}),
      ).rejects.toThrow('Fire Department No Objection Certificate (NOC) must be uploaded and accepted');
    });

    it('blocks operational completion if practical completion document is missing', async () => {
      const repo = createMockRepo({
        getOrCreateHandoverRecord: vi.fn(async () => ({
          id: 'hnd-1',
          companyId,
          projectId,
          status: 'ready_for_inspection',
          clearanceCertificateNumber: 'CLR-100',
          clearanceCertificateIssuer: 'CFO Office',
          clearanceCertificateDate: '2026-11-01',
          clearanceCertificateFileUrl: 'https://storage.local/clearance.pdf',
          clearanceCertificateStatus: 'accepted',
          nocNumber: 'NOC-999',
          nocIssuer: 'Fire Dept',
          nocDate: '2026-11-01',
          nocFileUrl: 'https://storage.local/noc.pdf',
          nocStatus: 'accepted',
          completionDocumentNumber: null,
          completionDocumentFileUrl: null,
          completionDocumentStatus: 'pending',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.certifyOperationalCompletion(managerPrincipal, projectId, {}),
      ).rejects.toThrow('Practical Completion Document signed by client must be uploaded and accepted');
    });

    it('blocks operational completion if unresolved critical or major punch items remain', async () => {
      const repo = createMockRepo({
        getOrCreateHandoverRecord: vi.fn(async () => ({
          id: 'hnd-1',
          companyId,
          projectId,
          status: 'ready_for_inspection',
          clearanceCertificateNumber: 'CLR-100',
          clearanceCertificateIssuer: 'CFO Office',
          clearanceCertificateDate: '2026-11-01',
          clearanceCertificateFileUrl: 'https://storage.local/clearance.pdf',
          clearanceCertificateStatus: 'accepted',
          nocNumber: 'NOC-999',
          nocIssuer: 'Fire Dept',
          nocDate: '2026-11-01',
          nocFileUrl: 'https://storage.local/noc.pdf',
          nocStatus: 'accepted',
          completionDocumentNumber: 'COMP-111',
          completionSignatoryName: 'Client Rep',
          completionDate: '2026-11-02',
          completionDocumentFileUrl: 'https://storage.local/comp.pdf',
          completionDocumentStatus: 'accepted',
        }) as any),
        countUnresolvedCriticalMajorPunchItems: vi.fn(async () => 2),
      });

      const service = new QualityService(repo);
      await expect(
        service.certifyOperationalCompletion(managerPrincipal, projectId, {}),
      ).rejects.toThrow('2 critical or major punch item(s) remain unresolved');
    });

    it('successfully grants operational completion and completes project when all statutory evidence is accepted and punch items resolved', async () => {
      const repo = createMockRepo({
        getOrCreateHandoverRecord: vi.fn(async () => ({
          id: 'hnd-1',
          companyId,
          projectId,
          status: 'ready_for_inspection',
          clearanceCertificateNumber: 'CLR-100',
          clearanceCertificateIssuer: 'CFO Office',
          clearanceCertificateDate: '2026-11-01',
          clearanceCertificateFileUrl: 'https://storage.local/clearance.pdf',
          clearanceCertificateStatus: 'accepted',
          nocNumber: 'NOC-999',
          nocIssuer: 'Fire Dept',
          nocDate: '2026-11-01',
          nocFileUrl: 'https://storage.local/noc.pdf',
          nocStatus: 'accepted',
          completionDocumentNumber: 'COMP-111',
          completionSignatoryName: 'Client Rep',
          completionDate: '2026-11-02',
          completionDocumentFileUrl: 'https://storage.local/comp.pdf',
          completionDocumentStatus: 'accepted',
        }) as any),
        countUnresolvedCriticalMajorPunchItems: vi.fn(async () => 0),
      });

      const service = new QualityService(repo);
      const result = await service.certifyOperationalCompletion(managerPrincipal, projectId, {
        completionNotes: 'All mandatory certificates verified and site snagging clear.',
      });

      expect(result).toBeDefined();
      expect(repo.updateHandoverRecord).toHaveBeenCalledWith(
        companyId,
        projectId,
        expect.objectContaining({
          status: 'operationally_complete',
          completedByUserId: managerUserId,
          completionNotes: 'All mandatory certificates verified and site snagging clear.',
        }),
        expect.anything(),
      );
      expect(repo.updateProjectStatus).toHaveBeenCalledWith(
        companyId,
        projectId,
        'completed',
        expect.anything(),
      );
    });

    it('enforces commercial closure is independent and requires prior operational completion', async () => {
      const repo = createMockRepo({
        getOrCreateHandoverRecord: vi.fn(async () => ({
          id: 'hnd-1',
          companyId,
          projectId,
          status: 'in_progress',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.executeCommercialClosure(managerPrincipal, projectId, {
          commercialClosureNotes: 'Settled',
        }),
      ).rejects.toThrow('Project must be operationally complete first');
    });

    it('rejects operational completion certification from unauthorized users', async () => {
      const repo = createMockRepo();
      const service = new QualityService(repo);
      await expect(
        service.certifyOperationalCompletion(engineerPrincipal, projectId, {}),
      ).rejects.toThrow('Forbidden: missing required permission project.handover.certify');
    });
  });

  describe('Independent Approval / Anti-Self-Approval Invariants', () => {
    it('prevents non-admin inspector from reviewing their own inspection', async () => {
      const repo = createMockRepo({
        findInspectionById: vi.fn(async () => ({
          id: 'ins-1',
          companyId,
          projectId,
          inspectorUserId: managerUserId, // manager was also inspector
          status: 'in_progress',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.reviewInspection(managerPrincipal, projectId, 'ins-1', {
          status: 'passed',
        }),
      ).rejects.toThrow('An inspector cannot review or sign off their own inspection');
    });

    it('allows administrator to override and review their own inspection', async () => {
      const repo = createMockRepo({
        findInspectionById: vi.fn(async () => ({
          id: 'ins-1',
          companyId,
          projectId,
          inspectorUserId: adminUserId,
          status: 'in_progress',
        }) as any),
      });

      const service = new QualityService(repo);
      const res = await service.reviewInspection(adminPrincipal, projectId, 'ins-1', {
        status: 'passed',
      });
      expect(res).toBeDefined();
    });

    it('prevents non-admin engineer from verifying their own test report', async () => {
      const repo = createMockRepo({
        findTestReportById: vi.fn(async () => ({
          id: 'tr-1',
          companyId,
          projectId,
          conductedByUserId: managerUserId,
          status: 'draft',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.updateTestReport(managerPrincipal, projectId, 'tr-1', {
          status: 'verified',
        }),
      ).rejects.toThrow('The engineer who conducted the test cannot verify it');
    });

    it('prevents non-admin author from closing their own punch item', async () => {
      const repo = createMockRepo({
        findPunchItemById: vi.fn(async () => ({
          id: 'pch-1',
          companyId,
          projectId,
          reportedByUserId: managerUserId,
          assignedToUserId: engineerUserId,
          status: 'rectified',
        }) as any),
      });

      const service = new QualityService(repo);
      await expect(
        service.closePunchItem(managerPrincipal, projectId, 'pch-1', {
          status: 'verified_closed',
          closureRemarks: 'Looks good',
        }),
      ).rejects.toThrow('The author or assigned engineer cannot close this punch item');
    });
  });
});
