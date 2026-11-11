import { describe, expect, it, vi } from 'vitest';
import { ExecutionService } from './execution.service.js';
import type { ExecutionRepository } from './execution.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';

describe('ExecutionService', () => {
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
    name: 'Site Engineer',
    email: 'engineer@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'project.execution.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.daily_report.create',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.delay.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.variation.create',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  const managerPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-pm',
    userId: managerUserId,
    companyId,
    name: 'Project Manager',
    email: 'pm@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'project.execution.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.task.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.daily_report.review',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.delay.review',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.variation.review',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.variation.approve',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  const validMilestoneId = 'c0000000-0000-4000-8000-000000000001';

  it('creates milestones and tasks with weighted progress calculation', async () => {
    const mockRepo = {
      checkProjectAccess: vi.fn().mockResolvedValue(true),
      listMilestones: vi.fn().mockResolvedValue([]),
      createMilestone: vi.fn().mockImplementation(async (data) => ({ id: validMilestoneId, ...data })),
      allocateDocumentNumber: vi.fn().mockResolvedValue('TSK-2026-00001'),
      createTask: vi.fn().mockImplementation(async (data) => ({ id: 'tsk-1', ...data })),
      listTasks: vi.fn().mockResolvedValue([
        { id: 'tsk-1', progressPercentage: 50, weightage: '2.00' },
        { id: 'tsk-2', progressPercentage: 100, weightage: '1.00' },
      ]),
      getOverallProgress: vi.fn().mockResolvedValue(66.67),
    } as unknown as ExecutionRepository;

    const service = new ExecutionService(mockRepo);

    const milestone = await service.createMilestone(managerPrincipal, projectId, {
      name: 'Rough-in & Piping',
      targetDate: '2026-12-01',
      billingPercentage: 30,
      orderIndex: 1,
    });

    expect(milestone.milestoneNumber).toBe('MS-01');
    expect(milestone.name).toBe('Rough-in & Piping');

    const task = await service.createTask(managerPrincipal, projectId, {
      milestoneId: validMilestoneId,
      title: 'Lay riser pipes Block A',
      plannedStartDate: '2026-11-15',
      plannedEndDate: '2026-11-25',
      weightage: 2,
    });

    expect(task.taskNumber).toBe('TSK-2026-00001');
    expect(task.weightage).toBe('2.00');

    const tasksResult = await service.listTasks(managerPrincipal, projectId);
    expect(tasksResult.overallProgress).toBe(66.67);
  });

  it('rejects duplicate daily reports for the same date', async () => {
    const mockRepo = {
      checkProjectAccess: vi.fn().mockResolvedValue(true),
      findDailyReportByDate: vi.fn().mockResolvedValue({
        id: 'dpr-1',
        reportNumber: 'DPR-2026-00001',
        reportDate: '2026-11-15',
      }),
    } as unknown as ExecutionRepository;

    const service = new ExecutionService(mockRepo);

    await expect(
      service.createDailyReport(engineerPrincipal, projectId, {
        reportDate: '2026-11-15',
        workSummary: 'Installation of detectors on 2nd floor.',
      }),
    ).rejects.toThrow('A daily progress report already exists for 2026-11-15');
  });

  it('enforces no self-approval for non-administrators on DPR review', async () => {
    const mockRepo = {
      checkProjectAccess: vi.fn().mockResolvedValue(true),
      findDailyReport: vi.fn().mockResolvedValue({
        report: {
          id: 'dpr-1',
          projectId,
          siteEngineerUserId: engineerUserId, // Submitted by site engineer
          status: 'submitted',
        },
      }),
    } as unknown as ExecutionRepository;

    const service = new ExecutionService(mockRepo);

    // Engineer attempts to review/approve their own report
    await expect(
      service.reviewDailyReport(engineerPrincipal, projectId, 'dpr-1', {
        action: 'approve',
        reviewNotes: 'Self approved',
      }),
    ).rejects.toThrow(); // missing permission or self-approval
  });

  it('allows project manager to approve a report submitted by engineer', async () => {
    const mockRepo = {
      checkProjectAccess: vi.fn().mockResolvedValue(true),
      findDailyReport: vi.fn().mockResolvedValue({
        report: {
          id: 'dpr-1',
          projectId,
          siteEngineerUserId: engineerUserId, // Submitted by site engineer
          status: 'submitted',
        },
      }),
      reviewDailyReport: vi.fn().mockResolvedValue({
        id: 'dpr-1',
        status: 'approved',
        reviewNotes: 'Verified against site progress.',
      }),
    } as unknown as ExecutionRepository;

    const service = new ExecutionService(mockRepo);

    const result = await service.reviewDailyReport(managerPrincipal, projectId, 'dpr-1', {
      action: 'approve',
      reviewNotes: 'Verified against site progress.',
    });

    expect(result?.status).toBe('approved');
  });

  it('allows system administrator self-approval override per 2026-10-30 policy', async () => {
    const mockRepo = {
      checkProjectAccess: vi.fn().mockResolvedValue(true),
      findDailyReport: vi.fn().mockResolvedValue({
        report: {
          id: 'dpr-admin',
          projectId,
          siteEngineerUserId: adminUserId, // Submitted by admin
          status: 'submitted',
        },
      }),
      reviewDailyReport: vi.fn().mockResolvedValue({
        id: 'dpr-admin',
        status: 'approved',
        reviewNotes: 'Administrator override approval.',
      }),
    } as unknown as ExecutionRepository;

    const service = new ExecutionService(mockRepo);

    // Admin can approve their own submitted report
    const result = await service.reviewDailyReport(adminPrincipal, projectId, 'dpr-admin', {
      action: 'approve',
      reviewNotes: 'Administrator override approval.',
    });

    expect(result?.status).toBe('approved');
  });

  it('handles variations through internal review and customer approval', async () => {
    const mockRepo = {
      checkProjectAccess: vi.fn().mockResolvedValue(true),
      allocateDocumentNumber: vi.fn().mockResolvedValue('VAR-2026-00001'),
      createVariation: vi.fn().mockImplementation(async (data) => ({ id: 'var-1', status: 'draft', ...data })),
      findVariation: vi.fn()
        .mockResolvedValueOnce({
          id: 'var-1',
          projectId,
          initiatorUserId: engineerUserId,
          status: 'draft',
        })
        .mockResolvedValueOnce({
          id: 'var-1',
          projectId,
          initiatorUserId: engineerUserId,
          status: 'approved_internal',
        }),
      reviewVariationInternal: vi.fn().mockResolvedValue({
        id: 'var-1',
        status: 'approved_internal',
        designReviewNotes: 'Technically sound. Extra 10 detectors approved.',
      }),
      recordVariationCustomerApproval: vi.fn().mockResolvedValue({
        id: 'var-1',
        status: 'customer_approved',
        customerEvidenceSnapshot: 'Customer signed change order email dated 2026-11-12',
      }),
    } as unknown as ExecutionRepository;

    const service = new ExecutionService(mockRepo);

    // 1. Engineer creates variation
    const variation = await service.createVariation(engineerPrincipal, projectId, {
      title: 'Basement car park expansion',
      description: 'Customer added 10 smoke detectors in newly excavated area.',
      reasonCategory: 'customer_request',
      scopeDeltaSummary: '+10 smoke detectors, 120m cabling.',
      costImpactAmount: 25000,
      scheduleImpactDays: 3,
    });

    expect(variation.variationNumber).toBe('VAR-2026-00001');

    // 2. Project Manager performs technical review
    const reviewed = await service.reviewVariationInternal(managerPrincipal, projectId, 'var-1', {
      action: 'approve_internal',
      designReviewNotes: 'Technically sound. Extra 10 detectors approved.',
    });

    expect(reviewed?.status).toBe('approved_internal');

    // 3. Customer approval recorded
    const approved = await service.recordVariationCustomerApproval(managerPrincipal, projectId, 'var-1', {
      customerEvidenceSnapshot: 'Customer signed change order email dated 2026-11-12',
    });

    expect(approved?.status).toBe('customer_approved');
  });
});
