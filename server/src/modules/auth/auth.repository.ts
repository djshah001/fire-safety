import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import { permissionCatalog } from '../../core/security/permissions.js';
import {
  authSessions,
  passwordResetTokens,
  permissions,
  rolePermissions,
  roles,
  scopedGrants,
  auditEvents,
  outboxJobs,
  userRoleAssignments,
  users,
} from '../../infrastructure/database/schema/index.js';

export function createAuthRepository(executor: DatabaseExecutor) {
  return {
    async findUserByEmail(emailNormalized: string) {
      const [user] = await executor.select().from(users)
        .where(eq(users.emailNormalized, emailNormalized)).limit(1);
      return user;
    },

    async findUserById(userId: string) {
      const [user] = await executor.select().from(users).where(eq(users.id, userId)).limit(1);
      return user;
    },

    async createSession(input: typeof authSessions.$inferInsert) {
      const [session] = await executor.insert(authSessions).values(input).returning();
      return session;
    },

    async findSession(tokenHash: string, now: Date) {
      const [row] = await executor.select({
        sessionId: authSessions.id,
        sessionAccessVersion: authSessions.accessVersion,
        userId: users.id,
        companyId: users.companyId,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        status: users.status,
        userAccessVersion: users.accessVersion,
        mustChangePassword: users.mustChangePassword,
      }).from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(and(
          eq(authSessions.tokenHash, tokenHash),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        )).limit(1);
      return row;
    },

    async listPermissionGrants(userId: string, companyId: string, now: Date) {
      const [administrator] = await executor.select({ id: roles.id }).from(userRoleAssignments)
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId)).where(and(
          eq(userRoleAssignments.userId, userId), eq(userRoleAssignments.companyId, companyId),
          eq(roles.companyId, companyId), eq(roles.code, 'system_admin'), eq(roles.isSystem, true),
          eq(roles.isActive, true), lte(userRoleAssignments.validFrom, now),
          or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
        )).limit(1);
      if (administrator) return Object.keys(permissionCatalog).map((permissionCode) => ({
        permissionCode, scopeKind: 'company' as const, scopeId: null, source: 'role' as const,
      }));
      const roleGrants = await executor.select({
        permissionCode: rolePermissions.permissionCode,
        branchId: userRoleAssignments.branchId,
      }).from(userRoleAssignments)
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.code, rolePermissions.permissionCode))
        .where(and(
          eq(userRoleAssignments.userId, userId),
          eq(userRoleAssignments.companyId, companyId),
          eq(roles.companyId, companyId),
          eq(roles.isActive, true),
          lte(userRoleAssignments.validFrom, now),
          or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
        ));

      const directGrants = await executor.select({
        permissionCode: scopedGrants.permissionCode,
        scopeKind: scopedGrants.scopeKind,
        scopeId: scopedGrants.scopeId,
      }).from(scopedGrants).where(and(
        eq(scopedGrants.userId, userId),
        eq(scopedGrants.companyId, companyId),
        lte(scopedGrants.validFrom, now),
        or(isNull(scopedGrants.validUntil), gt(scopedGrants.validUntil, now)),
      ));

      return [
        ...roleGrants.map((grant) => ({
          permissionCode: grant.permissionCode,
          scopeKind: grant.branchId ? 'branch' as const : 'company' as const,
          scopeId: grant.branchId,
          source: 'role' as const,
        })),
        ...directGrants.map((grant) => ({ ...grant, source: 'direct' as const })),
      ];
    },

    async updateLastLogin(userId: string, now: Date) {
      await executor.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, userId));
    },

    async touchSession(sessionId: string, now: Date) {
      await executor.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, sessionId));
    },

    async revokeSession(sessionId: string, now: Date, reason: string) {
      await executor.update(authSessions).set({ revokedAt: now, revokeReason: reason })
        .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
    },

    async revokeUserSessions(userId: string, now: Date, reason: string) {
      await executor.update(authSessions).set({ revokedAt: now, revokeReason: reason })
        .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
    },

    async createPasswordResetToken(input: typeof passwordResetTokens.$inferInsert) {
      const [token] = await executor.insert(passwordResetTokens).values(input).returning();
      return token;
    },

    async findUsablePasswordResetToken(tokenHash: string, now: Date) {
      const [row] = await executor.select({ token: passwordResetTokens, user: users })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        )).limit(1);
      return row;
    },

    async consumePasswordResetToken(tokenId: string, now: Date) {
      const [token] = await executor.update(passwordResetTokens).set({ usedAt: now })
        .where(and(
          eq(passwordResetTokens.id, tokenId),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        )).returning();
      return token;
    },

    async changePassword(userId: string, passwordHash: string, now: Date) {
      const [user] = await executor.update(users).set({
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        accessVersion: sql`${users.accessVersion} + 1`,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      }).where(eq(users.id, userId)).returning();
      return user;
    },

    async appendAuditEvent(input: typeof auditEvents.$inferInsert) {
      await executor.insert(auditEvents).values(input);
    },

    async enqueueOutboxJob(input: typeof outboxJobs.$inferInsert) {
      await executor.insert(outboxJobs).values(input);
    },
  };
}
