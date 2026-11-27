import { describe, expect, it, vi } from 'vitest';
import { ProjectService } from './project.service.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';

describe('ProjectService - Team Member Management', () => {
  const companyId = 'b0000000-0000-4000-8000-000000000001';
  const projectId = 'f0000000-0000-4000-8000-000000000001';
  const pmUserId = 'a0000000-0000-4000-8000-000000000002';
  const newEngineerId = 'a0000000-0000-4000-8000-000000000003';
  const viewerUserId = 'a0000000-0000-4000-8000-000000000004';

  const pmPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-pm',
    userId: pmUserId,
    companyId,
    name: 'Project Manager User',
    email: 'pm@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'project.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
      {
        permissionCode: 'project.member.manage',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  const viewerPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-viewer',
    userId: viewerUserId,
    companyId,
    name: 'Team Viewer User',
    email: 'viewer@firesafety.test',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'project.read',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  it('rejects team member management if user has neither permission nor PM role', async () => {
    const service = new ProjectService({} as any);
    // Mock private methods/db
    (service as any).database = {
      transaction: vi.fn(),
    };
    (service as any).assertMemberManageAccess = vi.fn().mockRejectedValue(new Error('Only the Project Manager or authorized administrators can manage project team members.'));

    await expect(
      service.getEligibleMembers(viewerPrincipal, projectId),
    ).rejects.toThrow('Only the Project Manager or authorized administrators can manage project team members.');
  });

  it('rejects removing the only Project Manager from a project', async () => {
    const service = new ProjectService({} as any);
    (service as any).assert = vi.fn();
    (service as any).assertMemberManageAccess = vi.fn().mockResolvedValue(undefined);
    (service as any).database = { transaction: vi.fn() };

    // Mock repository
    const mockRepo = {
      find: vi.fn().mockResolvedValue({ id: projectId, projectNumber: 'FS-PRJ-2026-000001', title: 'Alpha Towers' }),
      findMember: vi.fn().mockResolvedValue({ userId: pmUserId, role: 'project_manager' }),
      countProjectManagers: vi.fn().mockResolvedValue(1),
      removeMember: vi.fn(),
    };
    vi.spyOn(await import('./project.repository.js'), 'createProjectRepository').mockReturnValue(mockRepo as any);

    await expect(
      service.removeMember(pmPrincipal, projectId, pmUserId, 'req-1'),
    ).rejects.toThrow('Cannot remove the sole Project Manager. Assign another Project Manager first.');
  });

  it('allows Project Manager to add a valid eligible member', async () => {
    const service = new ProjectService({} as any);
    (service as any).assert = vi.fn();
    (service as any).assertMemberManageAccess = vi.fn().mockResolvedValue(undefined);
    (service as any).get = vi.fn().mockResolvedValue({ project: { id: projectId }, members: [] });
    (service as any).database = {
      transaction: vi.fn(async (cb: any) => cb({} as any)),
    };

    const mockRepo = {
      find: vi.fn().mockResolvedValue({ id: projectId, projectNumber: 'FS-PRJ-2026-000001', title: 'Alpha Towers' }),
      addMember: vi.fn().mockResolvedValue({ projectId, userId: newEngineerId, role: 'member' }),
    };
    vi.spyOn(await import('./project.repository.js'), 'createProjectRepository').mockReturnValue(mockRepo as any);
    vi.spyOn(await import('../crm/crm.repository.js'), 'createCrmRepository').mockReturnValue({
      findEligibleUser: vi.fn().mockResolvedValue({ id: newEngineerId, name: 'Engineer One' }),
    } as any);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      createMany: vi.fn().mockResolvedValue([]),
    } as any);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as any);

    const res = await service.addMember(pmPrincipal, projectId, { userId: newEngineerId, role: 'member' }, 'req-2');
    expect(res).toBeDefined();
    expect(mockRepo.addMember).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        projectId,
        userId: newEngineerId,
        role: 'member',
      }),
    );
  });
});

describe('ProjectService - Strict Quotation Acceptance Gate', () => {
  const companyId = 'b0000000-0000-4000-8000-000000000001';
  const starterId = 'a0000000-0000-4000-8000-000000000010';
  const pmId = 'a0000000-0000-4000-8000-000000000011';
  const jobId = 'c0000000-0000-4000-8000-000000000001';
  const oppId = 'd0000000-0000-4000-8000-000000000001';
  const customerId = 'e0000000-0000-4000-8000-000000000001';
  const siteId = 'e1000000-0000-4000-8000-000000000001';
  const designRevId = 'f1000000-0000-4000-8000-000000000001';
  const decisionId = 'f2000000-0000-4000-8000-000000000001';
  const quoteRevId = 'f3000000-0000-4000-8000-000000000001';
  const quoteDecisionId = 'f4000000-0000-4000-8000-000000000001';

  const starterPrincipal: AuthenticatedPrincipal = {
    sessionId: 'session-start',
    userId: starterId,
    companyId,
    name: 'Project Starter',
    email: 'starter@firesafety.test',
    mustChangePassword: false,
    grants: [
      { permissionCode: 'project.start', scopeKind: 'company', scopeId: null, source: 'role' },
      { permissionCode: 'project.read', scopeKind: 'company', scopeId: null, source: 'role' },
    ],
  };

  it('blocks project start with 409 Conflict when no accepted quotation exists', async () => {
    const service = new ProjectService({} as never);
    vi.spyOn(await import('../engineering/engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({ id: jobId, opportunityId: oppId }),
    } as never);
    vi.spyOn(await import('./project.repository.js'), 'createProjectRepository').mockReturnValue({
      startContext: vi.fn().mockResolvedValue({
        designJobId: jobId,
        opportunityId: oppId,
        customerId,
        siteId,
        siteName: 'Plant 1',
        siteStatus: 'active',
        siteCustomerId: customerId,
        customerName: 'Acme Corp',
        title: 'Hydrant Job',
        commercialState: 'quoted',
        timezone: 'Asia/Kolkata',
      }),
      acceptedQuotation: vi.fn().mockResolvedValue(undefined),
    } as never);

    await expect(
      service.start(
        starterPrincipal,
        jobId,
        {
          title: 'Project Alpha',
          designRevisionId: designRevId,
          projectManagerUserId: pmId,
          memberUserIds: [],
          startDate: '2026-11-01',
          targetCompletionDate: '2026-12-01',
          startReason: 'Starting project',
          idempotencyKey: 'key-no-quote',
        },
        'req-no-quote',
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { missingRequirements: ['accepted_quotation'] },
    });
  });

  it('attaches both design and commercial baselines when an accepted quotation exists', async () => {
    const service = new ProjectService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);
    vi.spyOn(await import('../engineering/engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({ id: jobId, opportunityId: oppId }),
    } as never);
    const attachCommercialBaseline = vi.fn().mockResolvedValue({});
    const createDesignBaseline = vi.fn().mockResolvedValue({});
    const mockRepo = {
      startContext: vi.fn().mockResolvedValue({
        designJobId: jobId,
        opportunityId: oppId,
        customerId,
        siteId,
        siteName: 'Plant 1',
        siteStatus: 'active',
        siteCustomerId: customerId,
        customerName: 'Acme Corp',
        title: 'Hydrant Job',
        commercialState: 'awarded',
        timezone: 'Asia/Kolkata',
      }),
      acceptedQuotation: vi.fn().mockResolvedValue({
        revisionId: quoteRevId,
        revisionNumber: 1,
        title: 'Q1',
        currency: 'INR',
        grandTotal: '150000.00',
        decisionId: quoteDecisionId,
        evidenceReference: 'PO-1234',
        customerOrderReference: 'PO-1234',
        recordedAt: new Date('2026-11-20T10:00:00Z'),
        recordedByUserId: starterId,
      }),
      listApprovedDesigns: vi.fn().mockResolvedValue([
        { id: designRevId, revisionNumber: 1, title: 'R1', decisionId, evidenceReference: 'Client email' },
      ]),
      listApprovedBoqs: vi.fn().mockResolvedValue([]),
      reserveIdempotency: vi.fn().mockResolvedValue({ id: 'idem-1' }),
      findByOpportunity: vi.fn().mockResolvedValue(undefined),
      allocateNumber: vi.fn().mockResolvedValue('FS-PRJ-2026-000009'),
      create: vi.fn().mockResolvedValue({ id: 'prj-9', projectNumber: 'FS-PRJ-2026-000009', title: 'Project Alpha' }),
      createMembers: vi.fn().mockResolvedValue([]),
      createDesignBaseline,
      attachCommercialBaseline,
      completeIdempotency: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue({ id: 'prj-9', projectNumber: 'FS-PRJ-2026-000009', title: 'Project Alpha' }),
      detailParts: vi.fn().mockResolvedValue({ members: [], designBaseline: null, commercialBaseline: null }),
    };
    vi.spyOn(await import('./project.repository.js'), 'createProjectRepository').mockReturnValue(mockRepo as never);
    vi.spyOn(await import('../crm/crm.repository.js'), 'createCrmRepository').mockReturnValue({
      findEligibleUser: vi.fn().mockResolvedValue({ id: pmId, name: 'PM', email: 'pm@test' }),
    } as never);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      createMany: vi.fn().mockResolvedValue([]),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    const res = await service.start(
      starterPrincipal,
      jobId,
      {
        title: 'Project Alpha',
        designRevisionId: designRevId,
        projectManagerUserId: pmId,
        memberUserIds: [],
        startDate: '2026-11-01',
        targetCompletionDate: '2026-12-01',
        startReason: 'Accepted PO received',
        idempotencyKey: 'key-with-quote',
      },
      'req-with-quote',
    );
    expect(res.project.id).toBe('prj-9');
    expect(createDesignBaseline).toHaveBeenCalledTimes(1);
    expect(attachCommercialBaseline).toHaveBeenCalledWith(
      expect.objectContaining({
        quotationRevisionId: quoteRevId,
        quotationCustomerDecisionId: quoteDecisionId,
      }),
    );
  });
});
