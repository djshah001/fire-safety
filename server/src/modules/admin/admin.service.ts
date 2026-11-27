import { isAdministrator } from '../../core/security/administrator.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { hashPassword } from '../../core/security/password.js';
import { systemAdminPermissionCodes, type PermissionCode } from '../../core/security/permissions.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createAdminRepository } from './admin.repository.js';

export class AdminService {
  constructor(private readonly database: Database = db) {}

  async listUsers(principal: AuthenticatedPrincipal, input: {
    status?: 'active' | 'disabled'; search?: string; page: number; pageSize: number;
    sort: 'name' | 'email' | 'status' | 'lastLoginAt'; direction: 'asc' | 'desc';
  }) {
    const result = await createAdminRepository(this.database).listUsers({
      companyId: principal.companyId,
      status: input.status,
      search: input.search,
      sort: input.sort,
      direction: input.direction,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
    const assignments = await createAdminRepository(this.database)
      .listUserRoles(principal.companyId, result.items.map((user) => user.id));
    return {
      ...result,
      items: result.items.map((user) => ({
        ...user,
        roles: assignments.filter((assignment) => assignment.userId === user.id).map((assignment) => ({
          id: assignment.roleId,
          code: assignment.code,
          name: assignment.name,
        })),
      })),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async listRoles(principal: AuthenticatedPrincipal, includeInactive = false) {
    const repository = createAdminRepository(this.database);
    const [roleRows, mappings] = await Promise.all([
      repository.listRoles(principal.companyId, includeInactive),
      repository.listRolePermissions(principal.companyId),
    ]);
    return roleRows.map((role) => ({
      ...role,
      permissionCodes: mappings.filter((mapping) => mapping.roleId === role.id)
        .map((mapping) => mapping.permissionCode),
    }));
  }

  listPermissions() {
    return createAdminRepository(this.database).listPermissions();
  }

  private async assertPermissions(repository: ReturnType<typeof createAdminRepository>, permissionCodes: string[]) {
    const uniqueCodes = [...new Set(permissionCodes)];
    const matching = await repository.findPermissions(uniqueCodes);
    if (matching.length !== uniqueCodes.length) {
      throw new ConflictError('One or more permissions are unknown or unavailable.');
    }
    return uniqueCodes as PermissionCode[];
  }

  async createRole(principal: AuthenticatedPrincipal, input: {
    code: string; name: string; description?: string; permissionCodes: string[];
  }, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const permissionCodes = await this.assertPermissions(repository, input.permissionCodes);
      const role = await repository.createRole({
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        description: input.description,
        isSystem: false,
      });
      await repository.replaceRolePermissions(role!.id, permissionCodes);
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.role_created',
        targetType: 'role',
        targetId: role!.id,
        requestId,
        metadata: { code: input.code, permissionCodes },
      });
      return { ...role!, permissionCodes };
    });
  }

  async updateRole(principal: AuthenticatedPrincipal, roleId: string, input: {
    expectedVersion: number; name: string; description?: string; permissionCodes: string[]; reason: string;
  }, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const current = await repository.findRole(principal.companyId, roleId);
      if (!current || !current.isActive) throw new ConflictError('The role is unavailable or inactive.');
      if (current.isSystem) throw new ForbiddenError('System role names cannot be changed. Edit only their permissions.');
      const permissionCodes = await this.assertPermissions(repository, input.permissionCodes);
      const now = new Date();
      const role = await repository.updateCustomRole({
        companyId: principal.companyId,
        roleId,
        expectedVersion: input.expectedVersion,
        name: input.name,
        description: input.description,
        now,
      });
      if (!role) throw new ConflictError('The role changed before this update. Refresh and try again.');
      await repository.replaceRolePermissions(roleId, permissionCodes);
      const affected = await repository.listCurrentRoleUserIds(principal.companyId, roleId, now);
      const affectedUserIds = [...new Set(affected.map((assignment) => assignment.userId))];
      await repository.invalidateUsers(principal.companyId, affectedUserIds, now);
      const authRepository = createAuthRepository(transaction);
      await Promise.all(affectedUserIds.map((userId) => authRepository.revokeUserSessions(
        userId, now, 'role_changed',
      )));
      await authRepository.appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.role_updated',
        targetType: 'role',
        targetId: roleId,
        requestId,
        metadata: { permissionCodes, reason: input.reason, affectedUserCount: affectedUserIds.length },
      });
      return { ...role, permissionCodes };
    });
  }

  async updateRolePermissions(principal: AuthenticatedPrincipal, roleId: string, input: {
    expectedVersion: number; permissionCodes: string[]; reason: string;
  }, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const current = await repository.findRole(principal.companyId, roleId);
      if (!current || !current.isActive) throw new ConflictError('The role is unavailable or inactive.');
      const permissionCodes = await this.assertPermissions(repository, input.permissionCodes);
      if (current.code === 'system_admin') {
        const missing = systemAdminPermissionCodes.filter((code) => !permissionCodes.includes(code));
        if (missing.length > 0) {
          throw new ConflictError('The system administrator role must retain its core administration permissions.');
        }
      }
      const now = new Date();
      const role = await repository.updateRolePermissionVersion(
        principal.companyId, roleId, input.expectedVersion, now,
      );
      if (!role) throw new ConflictError('The role changed before this update. Refresh and try again.');
      await repository.replaceRolePermissions(roleId, permissionCodes);
      const affected = await repository.listCurrentRoleUserIds(principal.companyId, roleId, now);
      const affectedUserIds = [...new Set(affected.map((assignment) => assignment.userId))];
      await repository.invalidateUsers(principal.companyId, affectedUserIds, now);
      const authRepository = createAuthRepository(transaction);
      await Promise.all(affectedUserIds.map((userId) => authRepository.revokeUserSessions(
        userId, now, 'role_permissions_changed',
      )));
      await authRepository.appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.role_permissions_updated',
        targetType: 'role',
        targetId: roleId,
        requestId,
        metadata: { permissionCodes, reason: input.reason, affectedUserCount: affectedUserIds.length },
      });
      return { ...role, permissionCodes };
    });
  }

  async deactivateRole(
    principal: AuthenticatedPrincipal, roleId: string, expectedVersion: number, reason: string, requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const current = await repository.findRole(principal.companyId, roleId);
      if (!current || !current.isActive) throw new ConflictError('The role is unavailable or already inactive.');
      if (current.isSystem) throw new ForbiddenError('System roles cannot be deactivated.');
      if (await repository.countCurrentRoleAssignments(principal.companyId, roleId, new Date()) > 0) {
        throw new ConflictError('Reassign employees before deactivating this role.');
      }
      const role = await repository.deactivateCustomRole(
        principal.companyId, roleId, expectedVersion, new Date(),
      );
      if (!role) throw new ConflictError('The role changed before this update. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.role_deactivated',
        targetType: 'role',
        targetId: roleId,
        requestId,
        metadata: { reason },
      });
      return role;
    });
  }

  async replaceUserRoles(principal: AuthenticatedPrincipal, userId: string, input: {
    rowVersion: number; roleIds: string[]; reason: string;
  }, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const uniqueRoleIds = [...new Set(input.roleIds)];
      const matchingRoles = await repository.findRoles(principal.companyId, uniqueRoleIds);
      if (matchingRoles.length !== uniqueRoleIds.length) {
        throw new ConflictError('One or more roles are inactive or do not belong to this company.');
      }
      const currentAssignments = await repository.listUserRoles(principal.companyId, [userId]);
      if (!isAdministrator(principal) && principal.userId === userId) {
        const removedOwnRole = currentAssignments.some((assignment) => !uniqueRoleIds.includes(assignment.roleId));
        if (removedOwnRole) {
          throw new ForbiddenError('You may add a role to your own account, but another administrator must remove one.');
        }
      }
      const now = new Date();
      const user = await repository.bumpUserAccessVersion(
        principal.companyId, userId, input.rowVersion, now,
      );
      if (!user) throw new ConflictError('The employee changed before this update. Refresh and try again.');
      await repository.replaceCompanyRoles(principal.companyId, userId, uniqueRoleIds, now);
      const authRepository = createAuthRepository(transaction);
      await authRepository.revokeUserSessions(userId, now, 'role_assignments_changed');
      await authRepository.appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.user_roles_updated',
        targetType: 'user',
        targetId: userId,
        requestId,
        metadata: { roleIds: uniqueRoleIds, reason: input.reason },
      });
      return user;
    });
  }

  async createUser(principal: AuthenticatedPrincipal, input: {
    employeeCode?: string; name: string; email: string; temporaryPassword: string; roleIds: string[];
  }, requestId: string) {
    const passwordHash = await hashPassword(input.temporaryPassword);
    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const matchingRoles = await repository.findRoles(principal.companyId, input.roleIds);
      if (matchingRoles.length !== new Set(input.roleIds).size) {
        throw new ConflictError('One or more roles are inactive or do not belong to this company.');
      }
      const user = await repository.createUser({
        companyId: principal.companyId,
        employeeCode: input.employeeCode,
        name: input.name,
        email: input.email,
        emailNormalized: input.email,
        passwordHash,
        mustChangePassword: true,
      });
      await repository.assignCompanyRoles(principal.companyId, user!.id, input.roleIds);
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.user_created',
        targetType: 'user',
        targetId: user!.id,
        requestId,
        metadata: { roleIds: input.roleIds },
      });
      return user!;
    });
  }

  async disableUser(principal: AuthenticatedPrincipal, userId: string, rowVersion: number, reason: string, requestId: string) {
    if (!isAdministrator(principal) && principal.userId === userId) throw new ForbiddenError('You cannot disable your own account.');
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const user = await createAdminRepository(transaction)
        .disableUser(principal.companyId, userId, rowVersion, reason, now);
      if (!user) throw new ConflictError('The employee was changed by another request. Refresh and try again.');
      const authRepository = createAuthRepository(transaction);
      await authRepository.revokeUserSessions(userId, now, 'account_disabled');
      await authRepository.appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.user_disabled',
        targetType: 'user',
        targetId: userId,
        requestId,
        metadata: { reason },
      });
      return user;
    });
  }

  async enableUser(principal: AuthenticatedPrincipal, userId: string, rowVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const user = await createAdminRepository(transaction)
        .enableUser(principal.companyId, userId, rowVersion, now);
      if (!user) throw new ConflictError('The employee was changed by another request. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.user_enabled',
        targetType: 'user',
        targetId: userId,
        requestId,
        metadata: { reason },
      });
      return user;
    });
  }

  async resetUserPassword(principal: AuthenticatedPrincipal, userId: string, input: {
    rowVersion: number; temporaryPassword: string; reason: string;
  }, requestId: string) {
    const passwordHash = await hashPassword(input.temporaryPassword);
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const user = await createAdminRepository(transaction).setTemporaryPassword(
        principal.companyId, userId, input.rowVersion, passwordHash, now,
      );
      if (!user) throw new ConflictError('The employee was changed by another request. Refresh and try again.');
      const authRepository = createAuthRepository(transaction);
      await authRepository.revokeUserSessions(userId, now, 'admin_password_reset');
      await authRepository.appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.password_reset_by_admin',
        targetType: 'user',
        targetId: userId,
        requestId,
        metadata: { reason: input.reason },
      });
      return user;
    });
  }

  async getEmployeeWorkload(principal: AuthenticatedPrincipal, employeeId: string) {
    const repository = createAdminRepository(this.database);
    const employee = await repository.findUser(principal.companyId, employeeId);
    if (!employee) throw new NotFoundError('Employee not found.');
    const workload = await repository.getEmployeeWorkload(principal.companyId, employeeId);
    return {
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        status: employee.status,
        rowVersion: employee.rowVersion,
        isOnLeave: employee.isOnLeave,
        leaveStartDate: employee.leaveStartDate,
        leaveEndDate: employee.leaveEndDate,
        coveringEmployeeId: employee.coveringEmployeeId,
        leaveReason: employee.leaveReason,
      },
      workload,
    };
  }

  async leaveHandover(
    principal: AuthenticatedPrincipal,
    employeeId: string,
    input: {
      rowVersion: number;
      leaveStartDate: string;
      leaveEndDate?: string;
      coveringEmployeeId: string;
      leaveReason: string;
      reassignLeads: boolean;
      reassignReminders: boolean;
      reassignDesignHeadJobs: boolean;
      reassignDesignEngineerJobs: boolean;
      reassignBoqReviews: boolean;
      leadIds?: string[];
      reminderIds?: string[];
      designHeadJobIds?: string[];
      designEngineerJobIds?: string[];
      boqReviewIds?: string[];
    },
    requestId: string,
  ) {
    if (input.coveringEmployeeId === employeeId) {
      throw new AppError('VALIDATION_ERROR', 'Choose a different employee to cover this handover.', 422);
    }

    return this.database.transaction(async (transaction) => {
      const repository = createAdminRepository(transaction);
      const [employee, covering] = await Promise.all([
        repository.findUser(principal.companyId, employeeId),
        repository.findUser(principal.companyId, input.coveringEmployeeId),
      ]);
      if (!employee || employee.status !== 'active') {
        throw new NotFoundError('Active employee not found.');
      }
      if (!covering || covering.status !== 'active') {
        throw new AppError('VALIDATION_ERROR', 'Covering employee must be an active user.', 422);
      }
      if (covering.isOnLeave) {
        throw new ConflictError(`${covering.name} is currently marked On Leave. Choose an available covering employee.`);
      }

      const now = new Date();
      const [coveringIsAdmin, canDesignHead, canDesignEngineer] = await Promise.all([
        repository.userHasPermission(principal.companyId, covering.id, 'system.access.all', now),
        repository.userHasPermission(principal.companyId, covering.id, 'engineering.design.review', now),
        repository.userHasPermission(principal.companyId, covering.id, 'engineering.design.write', now),
      ]);

      const updatedEmployee = await repository.markUserOnLeave({
        companyId: principal.companyId,
        userId: employeeId,
        rowVersion: input.rowVersion,
        leaveStartDate: input.leaveStartDate,
        leaveEndDate: input.leaveEndDate,
        coveringEmployeeId: covering.id,
        leaveReason: input.leaveReason,
        now,
      });
      if (!updatedEmployee) {
        throw new ConflictError('The employee changed before leave handover completed. Refresh and try again.');
      }

      const workload = await repository.getEmployeeWorkload(principal.companyId, employeeId);
      const filterByIds = <T extends { id: string }>(items: T[], enabled: boolean, selectedIds?: string[]) => {
        if (!enabled) return [];
        if (!selectedIds) return items;
        const set = new Set(selectedIds);
        return items.filter((item) => set.has(item.id));
      };

      const selectedLeads = filterByIds(workload.leads, input.reassignLeads, input.leadIds);
      const selectedReminders = filterByIds(workload.reminders, input.reassignReminders, input.reminderIds);
      const selectedHeadJobs = filterByIds(workload.designHeadJobs, input.reassignDesignHeadJobs, input.designHeadJobIds);
      const selectedEngineerJobs = filterByIds(workload.designEngineerJobs, input.reassignDesignEngineerJobs, input.designEngineerJobIds);
      const selectedBoqs = filterByIds(workload.boqReviews, input.reassignBoqReviews, input.boqReviewIds);

      if (selectedHeadJobs.length > 0 && !canDesignHead) {
        throw new ConflictError(`${covering.name} lacks design review permission to take over Design Head tasks.`);
      }
      if (selectedEngineerJobs.length > 0 && !canDesignEngineer) {
        throw new ConflictError(`${covering.name} lacks engineering design write permission to take over Design Engineer tasks.`);
      }

      const logEntries: Array<{
        companyId: string;
        fromUserId: string;
        toUserId: string;
        entityType: 'lead' | 'reminder' | 'design_job_head' | 'design_job_engineer' | 'boq_review';
        entityId: string;
        reason: string;
        reassignedByUserId: string;
      }> = [];

      for (const lead of selectedLeads) {
        await repository.reassignLeadOwner(principal.companyId, lead.id, covering.id, now, principal.userId);
        logEntries.push({
          companyId: principal.companyId,
          fromUserId: employeeId,
          toUserId: covering.id,
          entityType: 'lead',
          entityId: lead.id,
          reason: input.leaveReason,
          reassignedByUserId: principal.userId,
        });
      }

      for (const reminder of selectedReminders) {
        await repository.reassignReminder(
          principal.companyId, reminder.id, reminder.ruleId, reminder.leadId, covering.id, now,
        );
        logEntries.push({
          companyId: principal.companyId,
          fromUserId: employeeId,
          toUserId: covering.id,
          entityType: 'reminder',
          entityId: reminder.id,
          reason: input.leaveReason,
          reassignedByUserId: principal.userId,
        });
      }

      for (const job of selectedHeadJobs) {
        if (!coveringIsAdmin && job.designerUserId === covering.id) {
          throw new ConflictError(
            `Cannot assign ${covering.name} as Design Head on "${job.title}" because they are already its Design Engineer (self-approval is not allowed for non-administrators).`,
          );
        }
        await repository.reassignDesignHead(principal.companyId, job.id, covering.id, now, principal.userId);
        logEntries.push({
          companyId: principal.companyId,
          fromUserId: employeeId,
          toUserId: covering.id,
          entityType: 'design_job_head',
          entityId: job.id,
          reason: input.leaveReason,
          reassignedByUserId: principal.userId,
        });
      }

      for (const job of selectedEngineerJobs) {
        if (!coveringIsAdmin && job.designHeadUserId === covering.id) {
          throw new ConflictError(
            `Cannot assign ${covering.name} as Design Engineer on "${job.title}" because they are already its Design Head (self-approval is not allowed for non-administrators).`,
          );
        }
        await repository.reassignDesignEngineer(principal.companyId, job.id, covering.id, now, principal.userId);
        logEntries.push({
          companyId: principal.companyId,
          fromUserId: employeeId,
          toUserId: covering.id,
          entityType: 'design_job_engineer',
          entityId: job.id,
          reason: input.leaveReason,
          reassignedByUserId: principal.userId,
        });
      }

      for (const boq of selectedBoqs) {
        const transferCosting =
          boq.costingUserId === employeeId && ['submitted', 'costing'].includes(boq.status);
        const transferPurchaseHead =
          boq.purchaseHeadUserId === employeeId && ['submitted', 'costing', 'purchase_review'].includes(boq.status);
        const transferAdminApprover =
          boq.adminApproverUserId === employeeId && ['submitted', 'costing', 'purchase_review', 'admin_review'].includes(boq.status);
        if (!transferCosting && !transferPurchaseHead && !transferAdminApprover) continue;

        if (!coveringIsAdmin && (transferPurchaseHead || transferAdminApprover)) {
          const isContributor =
            boq.createdByUserId === covering.id ||
            boq.submittedByUserId === covering.id ||
            await repository.hasBoqContributor(principal.companyId, boq.id, covering.id);
          if (isContributor) {
            throw new ConflictError(
              `Cannot transfer BOQ review on "${boq.jobTitle}" R${boq.revisionNumber} to ${covering.name} because they prepared or contributed to it (self-approval is not allowed for non-administrators).`,
            );
          }
        }
        await repository.reassignBoqRole(
          principal.companyId,
          boq.id,
          employeeId,
          covering.id,
          { costing: transferCosting, purchaseHead: transferPurchaseHead, adminApprover: transferAdminApprover },
          now,
        );
        logEntries.push({
          companyId: principal.companyId,
          fromUserId: employeeId,
          toUserId: covering.id,
          entityType: 'boq_review',
          entityId: boq.id,
          reason: input.leaveReason,
          reassignedByUserId: principal.userId,
        });
      }

      await repository.insertReassignmentLogs(logEntries);

      const summary = {
        leads: selectedLeads.length,
        reminders: selectedReminders.length,
        designHeadJobs: selectedHeadJobs.length,
        designEngineerJobs: selectedEngineerJobs.length,
        boqReviews: logEntries.filter((entry) => entry.entityType === 'boq_review').length,
      };

      if (logEntries.length > 0) {
        await createNotificationRepository(transaction).create({
          companyId: principal.companyId,
          recipientUserId: covering.id,
          type: 'identity.leave_handover_assigned',
          severity: 'info',
          title: 'Leave handover tasks assigned to you',
          message: `Covering for ${employee.name} (${input.leaveStartDate}${input.leaveEndDate ? ` to ${input.leaveEndDate}` : ''}): ${logEntries.length} item(s) reassigned.`,
          link: '/crm/leads',
          targetType: 'user',
          targetId: employeeId,
          dedupKey: `leave-handover:${employeeId}:${updatedEmployee.rowVersion}`,
        });
      }

      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.employee_leave_handover',
        targetType: 'user',
        targetId: employeeId,
        requestId,
        metadata: {
          coveringEmployeeId: covering.id,
          leaveStartDate: input.leaveStartDate,
          leaveEndDate: input.leaveEndDate ?? null,
          leaveReason: input.leaveReason,
          reassignedCounts: summary,
        },
      });

      return { user: updatedEmployee, reassigned: summary };
    });
  }

  async returnFromLeave(
    principal: AuthenticatedPrincipal,
    employeeId: string,
    input: { rowVersion: number; notes?: string },
    requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const user = await createAdminRepository(transaction).returnUserFromLeave(
        principal.companyId,
        employeeId,
        input.rowVersion,
        now,
      );
      if (!user) throw new ConflictError('The employee changed before returning from leave. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'identity.employee_returned_from_leave',
        targetType: 'user',
        targetId: employeeId,
        requestId,
        metadata: { notes: input.notes ?? null },
      });
      return user;
    });
  }
}

export const adminService = new AdminService();
