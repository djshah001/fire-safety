import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  permissions,
  rolePermissions,
  roles,
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
  };
}
