import type { Request } from 'express';
import { env } from '../../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../../core/errors/appError.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { hashPassword, verifyPassword } from '../../core/security/password.js';
import { createOpaqueToken, hashToken } from '../../core/security/tokens.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from './auth.repository.js';
import type { AuthenticatedPrincipal } from './auth.types.js';

const genericLoginError = 'Email or password is incorrect.';

function expiresAfterMilliseconds(milliseconds: number, now = new Date()) {
  return new Date(now.getTime() + milliseconds);
}

export class AuthService {
  constructor(private readonly database: Database = db) {}

  async login(input: { email: string; password: string; userAgent?: string; ipAddress?: string }, requestId: string) {
    const repository = createAuthRepository(this.database);
    const user = await repository.findUserByEmail(input.email);
    if (!user || user.status !== 'active' || !await verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedError(genericLoginError);
    }

    const now = new Date();
    const token = createOpaqueToken();
    const csrfToken = createOpaqueToken(32);
    await this.database.transaction(async (transaction) => {
      const transactionalRepository = createAuthRepository(transaction);
      await transactionalRepository.createSession({
        userId: user.id,
        tokenHash: hashToken(token),
        accessVersion: user.accessVersion,
        expiresAt: expiresAfterMilliseconds(env.SESSION_TTL_HOURS * 60 * 60 * 1_000, now),
        userAgent: input.userAgent?.slice(0, 500),
        ipAddress: input.ipAddress?.slice(0, 64),
      });
      await transactionalRepository.updateLastLogin(user.id, now);
      await transactionalRepository.appendAuditEvent({
        companyId: user.companyId,
        actorUserId: user.id,
        action: 'auth.login',
        targetType: 'user',
        targetId: user.id,
        requestId,
      });
    });

    const principal = await this.authenticateToken(token);
    return { token, csrfToken, principal };
  }

  async authenticateToken(token: string): Promise<AuthenticatedPrincipal> {
    const repository = createAuthRepository(this.database);
    const now = new Date();
    const session = await repository.findSession(hashToken(token), now);
    if (
      !session ||
      session.status !== 'active' ||
      session.sessionAccessVersion !== session.userAccessVersion
    ) {
      if (session) await repository.revokeSession(session.sessionId, now, 'access_invalidated');
      throw new UnauthorizedError('Your session is no longer valid.');
    }

    const grants = await repository.listPermissionGrants(session.userId, session.companyId, now);
    await repository.touchSession(session.sessionId, now);
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      companyId: session.companyId,
      name: session.name,
      email: session.email,
      mustChangePassword: session.mustChangePassword,
      grants,
    };
  }

  async logout(principal: AuthenticatedPrincipal, requestId: string) {
    await this.database.transaction(async (transaction) => {
      const repository = createAuthRepository(transaction);
      await repository.revokeSession(principal.sessionId, new Date(), 'user_logout');
      await repository.appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'auth.logout',
        targetType: 'auth_session',
        targetId: principal.sessionId,
        requestId,
      });
    });
  }

  async requestPasswordReset(email: string, requestId: string) {
    const repository = createAuthRepository(this.database);
    const user = await repository.findUserByEmail(email);
    if (!user || user.status !== 'active') return;

    const now = new Date();
    const rawToken = createOpaqueToken();
    await this.database.transaction(async (transaction) => {
      const transactionalRepository = createAuthRepository(transaction);
      const reset = await transactionalRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: expiresAfterMilliseconds(env.PASSWORD_RESET_TTL_MINUTES * 60 * 1_000, now),
      });
      await transactionalRepository.enqueueOutboxJob({
        companyId: user.companyId,
        type: 'identity.password_reset_requested',
        dedupKey: reset!.id,
        payload: { userId: user.id, email: user.email, token: rawToken },
      });
      await transactionalRepository.appendAuditEvent({
        companyId: user.companyId,
        actorUserId: null,
        action: 'auth.password_reset_requested',
        targetType: 'user',
        targetId: user.id,
        requestId,
      });
    });
  }

  async confirmPasswordReset(token: string, password: string, requestId: string) {
    const tokenHash = hashToken(token);
    const current = await createAuthRepository(this.database).findUsablePasswordResetToken(tokenHash, new Date());
    if (!current || current.user.status !== 'active') {
      throw new UnauthorizedError('This password reset link is invalid or has expired.');
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      const repository = createAuthRepository(transaction);
      const usable = await repository.findUsablePasswordResetToken(tokenHash, now);
      if (!usable || usable.user.status !== 'active') {
        throw new UnauthorizedError('This password reset link is invalid or has expired.');
      }
      const consumed = await repository.consumePasswordResetToken(usable.token.id, now);
      if (!consumed) {
        throw new UnauthorizedError('This password reset link is invalid or has expired.');
      }
      await repository.changePassword(usable.user.id, passwordHash, now);
      await repository.revokeUserSessions(usable.user.id, now, 'password_reset');
      await repository.appendAuditEvent({
        companyId: usable.user.companyId,
        actorUserId: usable.user.id,
        action: 'auth.password_reset_completed',
        targetType: 'user',
        targetId: usable.user.id,
        requestId,
      });
    });
  }

  async changePassword(principal: AuthenticatedPrincipal, currentPassword: string, password: string, requestId: string) {
    const user = await createAuthRepository(this.database).findUserById(principal.userId);
    if (!user || user.status !== 'active' || !await verifyPassword(currentPassword, user.passwordHash)) {
      throw new ForbiddenError('The current password is incorrect.');
    }
    const passwordHash = await hashPassword(password);
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      const repository = createAuthRepository(transaction);
      await repository.changePassword(user.id, passwordHash, now);
      await repository.revokeUserSessions(user.id, now, 'password_changed');
      await repository.appendAuditEvent({
        companyId: user.companyId,
        actorUserId: user.id,
        action: 'auth.password_changed',
        targetType: 'user',
        targetId: user.id,
        requestId,
      });
    });
  }
}

export const authService = new AuthService();

export function requestMetadata(request: Request) {
  return {
    requestId: getRequestId(request),
    userAgent: request.get('user-agent'),
    ipAddress: request.ip,
  };
}
