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
