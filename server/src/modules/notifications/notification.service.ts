import { ConflictError, ForbiddenError } from '../../core/errors/appError.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createNotificationRepository } from './notification.repository.js';

type ListInput = {
  search?: string; status: 'all' | 'unread' | 'read'; page: number; pageSize: number;
  sort: 'createdAt' | 'severity'; direction: 'asc' | 'desc';
};

export class NotificationService {
  constructor(private readonly database: Database = db) {}

  private assertAvailable(principal: AuthenticatedPrincipal) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
  }

  async list(principal: AuthenticatedPrincipal, input: ListInput) {
    this.assertAvailable(principal);
    const result = await createNotificationRepository(this.database).list(principal.companyId, principal.userId, {
      ...input, limit: input.pageSize, offset: (input.page - 1) * input.pageSize,
    });
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  summary(principal: AuthenticatedPrincipal) {
    this.assertAvailable(principal);
    return createNotificationRepository(this.database).summary(principal.companyId, principal.userId);
  }

  async markRead(principal: AuthenticatedPrincipal, notificationId: string, expectedVersion: number) {
    this.assertAvailable(principal);
    const updated = await createNotificationRepository(this.database).markRead(
      principal.companyId, principal.userId, notificationId, expectedVersion, new Date(),
    );
    if (!updated) throw new ConflictError('The notification changed or is unavailable. Refresh and try again.');
    return updated;
  }

  async markAllRead(principal: AuthenticatedPrincipal) {
    this.assertAvailable(principal);
    const updated = await createNotificationRepository(this.database).markAllRead(principal.companyId, principal.userId, new Date());
    return { updatedCount: updated.length };
  }
}

export const notificationService = new NotificationService();
