import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { AdminService } from './admin.service.js';

describe('AdminService - Employee Leave & Task Handover', () => {
  const companyId = 'b0000000-0000-4000-8000-000000000001';
  const adminId = 'a0000000-0000-4000-8000-000000000001';
  const leavingId = 'a0000000-0000-4000-8000-000000000041';
  const coveringId = 'a0000000-0000-4000-8000-000000000042';

  const adminPrincipal: AuthenticatedPrincipal = {
    sessionId: 's-admin',
    userId: adminId,
    companyId,
    name: 'Admin User',
    email: 'admin@test',
    mustChangePassword: false,
    grants: [
      { permissionCode: 'system.access.all', scopeKind: 'company', scopeId: null, source: 'role' },
      { permissionCode: 'identity.users.manage', scopeKind: 'company', scopeId: null, source: 'role' },
    ],
  };

  it('blocks non-admin self-approval conflict when covering employee is already Design Engineer on a handed-over Design Head job', async () => {
    const service = new AdminService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);

    vi.spyOn(await import('./admin.repository.js'), 'createAdminRepository').mockReturnValue({
      findUser: vi.fn().mockImplementation(async (_cid: string, uid: string) => ({
        id: uid,
        name: uid === leavingId ? 'Leaving Head' : 'Covering Engineer',
        status: 'active',
        isOnLeave: false,
        rowVersion: 1,
      })),
      userHasPermission: vi.fn().mockImplementation(async (_cid: string, _uid: string, perm: string) => {
        if (perm === 'system.access.all') return false;
        return true;
      }),
      markUserOnLeave: vi.fn().mockResolvedValue({ id: leavingId, rowVersion: 2 }),
      getEmployeeWorkload: vi.fn().mockResolvedValue({
        leads: [],
        reminders: [],
        designHeadJobs: [
          {
            id: 'job-conflict',
            title: 'Tower Design',
            status: 'draft',
            designerUserId: coveringId,
            designHeadUserId: leavingId,
          },
        ],
        designEngineerJobs: [],
        boqReviews: [],
      }),
    } as never);

    await expect(
      service.leaveHandover(
        adminPrincipal,
        leavingId,
        {
          rowVersion: 1,
          leaveStartDate: '2026-11-27',
          coveringEmployeeId: coveringId,
          leaveReason: 'Annual leave',
          reassignLeads: true,
          reassignReminders: true,
          reassignDesignHeadJobs: true,
          reassignDesignEngineerJobs: true,
          reassignBoqReviews: true,
        },
        'req-self-conflict',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reassigns leads, reminders, design jobs (preserving clock), and BOQ reviews atomically with audit and reassignment logs', async () => {
    const reassignLeadOwner = vi.fn().mockResolvedValue(undefined);
    const reassignReminder = vi.fn().mockResolvedValue(undefined);
    const reassignDesignEngineer = vi.fn().mockResolvedValue(undefined);
    const reassignBoqRole = vi.fn().mockResolvedValue(undefined);
    const insertReassignmentLogs = vi.fn().mockResolvedValue(undefined);
    const notifyCreate = vi.fn().mockResolvedValue({});

    const service = new AdminService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);

    vi.spyOn(await import('./admin.repository.js'), 'createAdminRepository').mockReturnValue({
      findUser: vi.fn().mockImplementation(async (_cid: string, uid: string) => ({
        id: uid,
        name: uid === leavingId ? 'Leaving Staff' : 'Covering Staff',
        status: 'active',
        isOnLeave: false,
        rowVersion: 1,
      })),
      userHasPermission: vi.fn().mockResolvedValue(true),
      markUserOnLeave: vi.fn().mockResolvedValue({ id: leavingId, isOnLeave: true, rowVersion: 2 }),
      getEmployeeWorkload: vi.fn().mockResolvedValue({
        leads: [{ id: 'lead-1', leadNumber: 'FS-LD-01', inquiryName: 'Mall', stage: 'qualified', rowVersion: 1 }],
        reminders: [{ id: 'rem-1', ruleId: 'rule-1', leadId: 'lead-1', leadNumber: 'FS-LD-01', title: 'Call', dueAt: new Date() }],
        designHeadJobs: [],
        designEngineerJobs: [
          { id: 'job-1', title: 'Mall CAD', status: 'draft', designerUserId: leavingId, designHeadUserId: adminId },
        ],
        boqReviews: [
          {
            id: 'boq-1',
            designJobId: 'job-1',
            jobTitle: 'Mall CAD',
            revisionNumber: 1,
            title: 'BOQ R1',
            status: 'purchase_review',
            createdByUserId: leavingId,
            submittedByUserId: leavingId,
            costingUserId: null,
            purchaseHeadUserId: leavingId,
            adminApproverUserId: adminId,
          },
        ],
      }),
      reassignLeadOwner,
      reassignReminder,
      reassignDesignEngineer,
      hasBoqContributor: vi.fn().mockResolvedValue(false),
      reassignBoqRole,
      insertReassignmentLogs,
    } as never);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      create: notifyCreate,
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    const result = await service.leaveHandover(
      adminPrincipal,
      leavingId,
      {
        rowVersion: 1,
        leaveStartDate: '2026-11-27',
        leaveEndDate: '2026-12-02',
        coveringEmployeeId: coveringId,
        leaveReason: 'Planned medical leave',
        reassignLeads: true,
        reassignReminders: true,
        reassignDesignHeadJobs: true,
        reassignDesignEngineerJobs: true,
        reassignBoqReviews: true,
      },
      'req-handover-ok',
    );

    expect(result.reassigned).toEqual({
      leads: 1,
      reminders: 1,
      designHeadJobs: 0,
      designEngineerJobs: 1,
      boqReviews: 1,
    });
    expect(reassignLeadOwner).toHaveBeenCalledTimes(1);
    expect(reassignReminder).toHaveBeenCalledTimes(1);
    expect(reassignDesignEngineer).toHaveBeenCalledWith(companyId, 'job-1', coveringId, expect.any(Date), adminId);
    expect(reassignBoqRole).toHaveBeenCalledTimes(1);
    expect(insertReassignmentLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'lead', entityId: 'lead-1', toUserId: coveringId }),
        expect.objectContaining({ entityType: 'reminder', entityId: 'rem-1', toUserId: coveringId }),
        expect.objectContaining({ entityType: 'design_job_engineer', entityId: 'job-1', toUserId: coveringId }),
        expect.objectContaining({ entityType: 'boq_review', entityId: 'boq-1', toUserId: coveringId }),
      ]),
    );
    expect(notifyCreate).toHaveBeenCalledTimes(1);
  });
});
