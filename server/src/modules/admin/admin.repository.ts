import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  boqRevisionContributors,
  boqRevisions,
  designJobs,
  leadMembers,
  leads,
  opportunities,
  opportunityMembers,
  permissions,
  reminderOccurrences,
  reminderRules,
  rolePermissions,
  roles,
  taskReassignmentLogs,
  userRoleAssignments,
  users,
} from '../../infrastructure/database/schema/index.js';

export function createAdminRepository(executor: DatabaseExecutor) {
  return {
    async listUsers(input: {
      companyId: string;
      status?: 'active' | 'disabled';
      search?: string;
      limit: number;
      offset: number;
      sort: 'name' | 'email' | 'status' | 'lastLoginAt';
      direction: 'asc' | 'desc';
    }) {
      const searchCondition = input.search
        ? or(ilike(users.name, `%${input.search}%`), ilike(users.email, `%${input.search}%`))
        : undefined;
      const where = and(
        eq(users.companyId, input.companyId),
        input.status ? eq(users.status, input.status) : undefined,
        searchCondition,
      );
      const sortColumn = { name: users.name, email: users.email, status: users.status, lastLoginAt: users.lastLoginAt }[input.sort];
      const order = input.direction === 'asc' ? asc : desc;
      const [items, totals] = await Promise.all([
        executor.select({
          id: users.id,
          employeeCode: users.employeeCode,
          name: users.name,
          email: users.email,
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          rowVersion: users.rowVersion,
          lastLoginAt: users.lastLoginAt,
          disabledAt: users.disabledAt,
          disabledReason: users.disabledReason,
          isOnLeave: users.isOnLeave,
          leaveStartDate: users.leaveStartDate,
          leaveEndDate: users.leaveEndDate,
          coveringEmployeeId: users.coveringEmployeeId,
          leaveReason: users.leaveReason,
          createdAt: users.createdAt,
        }).from(users).where(where).orderBy(order(sortColumn), order(users.id)).limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(users).where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },

    async findRoles(companyId: string, roleIds: string[]) {
      if (roleIds.length === 0) return [];
      return executor.select({ id: roles.id, code: roles.code }).from(roles)
        .where(and(eq(roles.companyId, companyId), eq(roles.isActive, true), inArray(roles.id, roleIds)));
    },

    async listRoles(companyId: string, includeInactive = false) {
      return executor.select({
        id: roles.id,
        code: roles.code,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        isActive: roles.isActive,
        rowVersion: roles.rowVersion,
      }).from(roles).where(and(
        eq(roles.companyId, companyId),
        includeInactive ? undefined : eq(roles.isActive, true),
      ))
        .orderBy(asc(roles.name));
    },

    async listPermissions() {
      return executor.select({ code: permissions.code, description: permissions.description })
        .from(permissions).orderBy(asc(permissions.code));
    },

    async listRolePermissions(companyId: string) {
      return executor.select({ roleId: roles.id, permissionCode: rolePermissions.permissionCode })
        .from(roles).innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(eq(roles.companyId, companyId));
    },

    async listUserRoles(companyId: string, userIds: string[], now = new Date()) {
      if (userIds.length === 0) return [];
      return executor.select({
        userId: userRoleAssignments.userId,
        roleId: roles.id,
        code: roles.code,
        name: roles.name,
      }).from(userRoleAssignments)
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
        .where(and(
          eq(userRoleAssignments.companyId, companyId),
          inArray(userRoleAssignments.userId, userIds),
          isNull(userRoleAssignments.branchId),
          lte(userRoleAssignments.validFrom, now),
          or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
        )).orderBy(asc(roles.name));
    },

    async findRole(companyId: string, roleId: string) {
      const [role] = await executor.select().from(roles).where(and(
        eq(roles.companyId, companyId), eq(roles.id, roleId),
      )).limit(1);
      return role;
    },

    async findPermissions(permissionCodes: string[]) {
      if (permissionCodes.length === 0) return [];
      return executor.select({ code: permissions.code }).from(permissions)
        .where(inArray(permissions.code, permissionCodes));
    },

    async createRole(input: typeof roles.$inferInsert) {
      const [role] = await executor.insert(roles).values(input).returning();
      return role;
    },

    async replaceRolePermissions(roleId: string, permissionCodes: string[]) {
      await executor.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permissionCodes.length > 0) {
        await executor.insert(rolePermissions).values(permissionCodes.map((permissionCode) => ({
          roleId, permissionCode,
        })));
      }
    },

    async updateCustomRole(input: {
      companyId: string; roleId: string; expectedVersion: number; name: string;
      description?: string; now: Date;
    }) {
      const [role] = await executor.update(roles).set({
        name: input.name,
        description: input.description ?? null,
        rowVersion: sql`${roles.rowVersion} + 1`,
        updatedAt: input.now,
      }).where(and(
        eq(roles.companyId, input.companyId),
        eq(roles.id, input.roleId),
        eq(roles.rowVersion, input.expectedVersion),
        eq(roles.isSystem, false),
        eq(roles.isActive, true),
      )).returning();
      return role;
    },

    async updateRolePermissionVersion(companyId: string, roleId: string, expectedVersion: number, now: Date) {
      const [role] = await executor.update(roles).set({
        rowVersion: sql`${roles.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(roles.companyId, companyId),
        eq(roles.id, roleId),
        eq(roles.rowVersion, expectedVersion),
        eq(roles.isActive, true),
      )).returning();
      return role;
    },

    async countCurrentRoleAssignments(companyId: string, roleId: string, now: Date) {
      const [result] = await executor.select({ count: count() }).from(userRoleAssignments).where(and(
        eq(userRoleAssignments.companyId, companyId),
        eq(userRoleAssignments.roleId, roleId),
        lte(userRoleAssignments.validFrom, now),
        or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
      ));
      return result?.count ?? 0;
    },

    async listCurrentRoleUserIds(companyId: string, roleId: string, now: Date) {
      return executor.select({ userId: userRoleAssignments.userId }).from(userRoleAssignments).where(and(
        eq(userRoleAssignments.companyId, companyId),
        eq(userRoleAssignments.roleId, roleId),
        lte(userRoleAssignments.validFrom, now),
        or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
      ));
    },

    async invalidateUsers(companyId: string, userIds: string[], now: Date) {
      if (userIds.length === 0) return;
      await executor.update(users).set({
        accessVersion: sql`${users.accessVersion} + 1`,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(users.companyId, companyId), inArray(users.id, userIds)));
    },

    async deactivateCustomRole(companyId: string, roleId: string, expectedVersion: number, now: Date) {
      const [role] = await executor.update(roles).set({
        isActive: false,
        rowVersion: sql`${roles.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(roles.companyId, companyId),
        eq(roles.id, roleId),
        eq(roles.rowVersion, expectedVersion),
        eq(roles.isSystem, false),
        eq(roles.isActive, true),
      )).returning();
      return role;
    },

    async createUser(input: typeof users.$inferInsert) {
      const [user] = await executor.insert(users).values(input).returning();
      return user;
    },

    async assignCompanyRoles(companyId: string, userId: string, roleIds: string[]) {
      await executor.insert(userRoleAssignments).values(roleIds.map((roleId) => ({
        companyId,
        userId,
        roleId,
      })));
    },

    async replaceCompanyRoles(companyId: string, userId: string, roleIds: string[], now: Date) {
      const existing = await executor.select({
        id: userRoleAssignments.id,
        roleId: userRoleAssignments.roleId,
        validFrom: userRoleAssignments.validFrom,
      })
        .from(userRoleAssignments).where(and(
          eq(userRoleAssignments.companyId, companyId),
          eq(userRoleAssignments.userId, userId),
          isNull(userRoleAssignments.branchId),
        ));
      const selected = new Set(roleIds);
      const existingIds = new Set(existing.map((assignment) => assignment.roleId));
      if (existing.length > 0) {
        for (const assignment of existing) {
          const remainsSelected = selected.has(assignment.roleId);
          await executor.update(userRoleAssignments).set(remainsSelected ? {
            validFrom: now,
            validUntil: null,
          } : {
            validUntil: now > assignment.validFrom ? now : new Date(assignment.validFrom.getTime() + 1),
          }).where(eq(userRoleAssignments.id, assignment.id));
        }
      }
      const additions = roleIds.filter((roleId) => !existingIds.has(roleId));
      if (additions.length > 0) {
        await executor.insert(userRoleAssignments).values(additions.map((roleId) => ({
          companyId, userId, roleId, validFrom: now,
        })));
      }
    },

    async bumpUserAccessVersion(companyId: string, userId: string, expectedVersion: number, now: Date) {
      const [user] = await executor.update(users).set({
        accessVersion: sql`${users.accessVersion} + 1`,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(users.companyId, companyId), eq(users.id, userId), eq(users.rowVersion, expectedVersion),
      )).returning();
      return user;
    },

    async disableUser(companyId: string, userId: string, rowVersion: number, reason: string, now: Date) {
      const [user] = await executor.update(users).set({
        status: 'disabled',
        disabledAt: now,
        disabledReason: reason,
        accessVersion: sql`${users.accessVersion} + 1`,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(users.companyId, companyId), eq(users.id, userId), eq(users.rowVersion, rowVersion)))
        .returning();
      return user;
    },

    async enableUser(companyId: string, userId: string, rowVersion: number, now: Date) {
      const [user] = await executor.update(users).set({
        status: 'active',
        disabledAt: null,
        disabledReason: null,
        accessVersion: sql`${users.accessVersion} + 1`,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(users.companyId, companyId), eq(users.id, userId), eq(users.rowVersion, rowVersion)))
        .returning();
      return user;
    },

    async setTemporaryPassword(
      companyId: string,
      userId: string,
      rowVersion: number,
      passwordHash: string,
      now: Date,
    ) {
      const [user] = await executor.update(users).set({
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: now,
        accessVersion: sql`${users.accessVersion} + 1`,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(users.companyId, companyId), eq(users.id, userId), eq(users.rowVersion, rowVersion)))
        .returning();
      return user;
    },

    async findUser(companyId: string, userId: string) {
      const [user] = await executor.select().from(users).where(and(
        eq(users.companyId, companyId),
        eq(users.id, userId),
      )).limit(1);
      return user;
    },

    async userHasPermission(companyId: string, userId: string, permissionCode: string, now = new Date()) {
      const [row] = await executor.select({ permissionCode: rolePermissions.permissionCode })
        .from(userRoleAssignments)
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(and(
          eq(userRoleAssignments.companyId, companyId),
          eq(userRoleAssignments.userId, userId),
          eq(roles.companyId, companyId),
          eq(roles.isActive, true),
          inArray(rolePermissions.permissionCode, [permissionCode, 'system.access.all']),
          lte(userRoleAssignments.validFrom, now),
          or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
        )).limit(1);
      return Boolean(row);
    },

    async getEmployeeWorkload(companyId: string, userId: string) {
      const [activeLeads, pendingReminders, designHeadJobs, designEngineerJobs, pendingBoqs] = await Promise.all([
        executor.select({
          id: leads.id,
          leadNumber: leads.leadNumber,
          inquiryName: leads.inquiryName,
          stage: leads.stage,
          rowVersion: leads.rowVersion,
        }).from(leads).where(and(
          eq(leads.companyId, companyId),
          eq(leads.ownerUserId, userId),
          notInArray(leads.stage, ['won', 'lost']),
        )).orderBy(asc(leads.createdAt)),

        executor.select({
          id: reminderOccurrences.id,
          ruleId: reminderOccurrences.ruleId,
          leadId: reminderOccurrences.leadId,
          leadNumber: leads.leadNumber,
          title: reminderRules.title,
          dueAt: reminderOccurrences.dueAt,
        }).from(reminderOccurrences)
          .innerJoin(reminderRules, eq(reminderRules.id, reminderOccurrences.ruleId))
          .innerJoin(leads, eq(leads.id, reminderOccurrences.leadId))
          .where(and(
            eq(reminderOccurrences.companyId, companyId),
            eq(reminderOccurrences.assigneeUserId, userId),
            eq(reminderOccurrences.status, 'pending'),
          )).orderBy(asc(reminderOccurrences.dueAt)),

        executor.select({
          id: designJobs.id,
          leadId: designJobs.leadId,
          opportunityId: designJobs.opportunityId,
          title: designJobs.title,
          status: designJobs.status,
          designerUserId: designJobs.designerUserId,
          designHeadUserId: designJobs.designHeadUserId,
          rowVersion: designJobs.rowVersion,
        }).from(designJobs).where(and(
          eq(designJobs.companyId, companyId),
          eq(designJobs.designHeadUserId, userId),
          notInArray(designJobs.status, ['cancelled', 'abandoned', 'customer_approved']),
        )).orderBy(asc(designJobs.createdAt)),

        executor.select({
          id: designJobs.id,
          leadId: designJobs.leadId,
          opportunityId: designJobs.opportunityId,
          title: designJobs.title,
          status: designJobs.status,
          designerUserId: designJobs.designerUserId,
          designHeadUserId: designJobs.designHeadUserId,
          rowVersion: designJobs.rowVersion,
        }).from(designJobs).where(and(
          eq(designJobs.companyId, companyId),
          eq(designJobs.designerUserId, userId),
          notInArray(designJobs.status, ['cancelled', 'abandoned', 'customer_approved']),
        )).orderBy(asc(designJobs.createdAt)),

        executor.select({
          id: boqRevisions.id,
          designJobId: boqRevisions.designJobId,
          jobTitle: designJobs.title,
          revisionNumber: boqRevisions.revisionNumber,
          title: boqRevisions.title,
          status: boqRevisions.status,
          createdByUserId: boqRevisions.createdByUserId,
          submittedByUserId: boqRevisions.submittedByUserId,
          costingUserId: boqRevisions.costingUserId,
          purchaseHeadUserId: boqRevisions.purchaseHeadUserId,
          adminApproverUserId: boqRevisions.adminApproverUserId,
          rowVersion: boqRevisions.rowVersion,
        }).from(boqRevisions)
          .innerJoin(designJobs, eq(designJobs.id, boqRevisions.designJobId))
          .where(and(
            eq(boqRevisions.companyId, companyId),
            inArray(boqRevisions.status, ['submitted', 'costing', 'purchase_review', 'admin_review']),
            or(
              eq(boqRevisions.costingUserId, userId),
              eq(boqRevisions.purchaseHeadUserId, userId),
              eq(boqRevisions.adminApproverUserId, userId),
            ),
          )).orderBy(asc(boqRevisions.updatedAt)),
      ]);

      return {
        leads: activeLeads,
        reminders: pendingReminders,
        designHeadJobs,
        designEngineerJobs,
        boqReviews: pendingBoqs,
      };
    },

    async markUserOnLeave(input: {
      companyId: string;
      userId: string;
      rowVersion: number;
      leaveStartDate: string;
      leaveEndDate?: string;
      coveringEmployeeId: string;
      leaveReason: string;
      now: Date;
    }) {
      const [user] = await executor.update(users).set({
        isOnLeave: true,
        leaveStartDate: input.leaveStartDate,
        leaveEndDate: input.leaveEndDate ?? null,
        coveringEmployeeId: input.coveringEmployeeId,
        leaveReason: input.leaveReason,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: input.now,
      }).where(and(
        eq(users.companyId, input.companyId),
        eq(users.id, input.userId),
        eq(users.status, 'active'),
        eq(users.rowVersion, input.rowVersion),
      )).returning();
      return user;
    },

    async returnUserFromLeave(companyId: string, userId: string, rowVersion: number, now: Date) {
      const [user] = await executor.update(users).set({
        isOnLeave: false,
        leaveStartDate: null,
        leaveEndDate: null,
        coveringEmployeeId: null,
        leaveReason: null,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(users.companyId, companyId),
        eq(users.id, userId),
        eq(users.rowVersion, rowVersion),
      )).returning();
      return user;
    },

    async reassignLeadOwner(companyId: string, leadId: string, toUserId: string, now: Date, updatedByUserId?: string) {
      await executor.update(leads).set({
        ownerUserId: toUserId,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${leads.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(leads.companyId, companyId), eq(leads.id, leadId)));

      await executor.delete(leadMembers).where(and(
        eq(leadMembers.companyId, companyId),
        eq(leadMembers.leadId, leadId),
        eq(leadMembers.role, 'owner'),
      ));
      await executor.insert(leadMembers).values({
        companyId,
        leadId,
        userId: toUserId,
        role: 'owner',
      }).onConflictDoUpdate({
        target: [leadMembers.leadId, leadMembers.userId],
        set: { role: 'owner' },
      });

      const [opp] = await executor.select({ id: opportunities.id }).from(opportunities).where(and(
        eq(opportunities.companyId, companyId),
        eq(opportunities.leadId, leadId),
      )).limit(1);
      if (opp) {
        await executor.insert(opportunityMembers).values({
          companyId,
          opportunityId: opp.id,
          userId: toUserId,
          role: 'owner',
        }).onConflictDoUpdate({
          target: [opportunityMembers.opportunityId, opportunityMembers.userId],
          set: { role: 'owner' },
        });
      }
    },

    async reassignReminder(companyId: string, occurrenceId: string, ruleId: string, leadId: string, toUserId: string, now: Date) {
      await executor.update(reminderOccurrences).set({
        assigneeUserId: toUserId,
        rowVersion: sql`${reminderOccurrences.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(reminderOccurrences.companyId, companyId),
        eq(reminderOccurrences.id, occurrenceId),
        eq(reminderOccurrences.status, 'pending'),
      ));
      await executor.update(reminderRules).set({
        assigneeUserId: toUserId,
        updatedAt: now,
      }).where(and(
        eq(reminderRules.companyId, companyId),
        eq(reminderRules.id, ruleId),
        eq(reminderRules.status, 'active'),
      ));
      await executor.insert(leadMembers).values({
        companyId,
        leadId,
        userId: toUserId,
        role: 'collaborator',
      }).onConflictDoNothing();
    },

    async reassignDesignHead(companyId: string, jobId: string, toUserId: string, now: Date, updatedByUserId?: string) {
      await executor.update(designJobs).set({
        designHeadUserId: toUserId,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(designJobs.companyId, companyId), eq(designJobs.id, jobId)));
    },

    async reassignDesignEngineer(companyId: string, jobId: string, toUserId: string, now: Date, updatedByUserId?: string) {
      // Deliberately preserve designerAssignedAt, designDueAt, and bufferExtensionsUsed.
      await executor.update(designJobs).set({
        designerUserId: toUserId,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(eq(designJobs.companyId, companyId), eq(designJobs.id, jobId)));
    },

    async hasBoqContributor(companyId: string, boqRevisionId: string, userId: string) {
      const [row] = await executor.select({ userId: boqRevisionContributors.userId })
        .from(boqRevisionContributors)
        .where(and(
          eq(boqRevisionContributors.companyId, companyId),
          eq(boqRevisionContributors.boqRevisionId, boqRevisionId),
          eq(boqRevisionContributors.userId, userId),
        )).limit(1);
      return Boolean(row);
    },

    async reassignBoqRole(
      companyId: string,
      boqRevisionId: string,
      fromUserId: string,
      toUserId: string,
      rolesToTransfer: { costing: boolean; purchaseHead: boolean; adminApprover: boolean },
      now: Date,
    ) {
      await executor.update(boqRevisions).set({
        ...(rolesToTransfer.costing ? { costingUserId: toUserId } : {}),
        ...(rolesToTransfer.purchaseHead ? { purchaseHeadUserId: toUserId } : {}),
        ...(rolesToTransfer.adminApprover ? { adminApproverUserId: toUserId } : {}),
        rowVersion: sql`${boqRevisions.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(boqRevisions.companyId, companyId),
        eq(boqRevisions.id, boqRevisionId),
        or(
          eq(boqRevisions.costingUserId, fromUserId),
          eq(boqRevisions.purchaseHeadUserId, fromUserId),
          eq(boqRevisions.adminApproverUserId, fromUserId),
        ),
      ));
    },

    async insertReassignmentLogs(values: Array<typeof taskReassignmentLogs.$inferInsert>) {
      if (values.length === 0) return;
      await executor.insert(taskReassignmentLogs).values(values);
    },
  };
}
