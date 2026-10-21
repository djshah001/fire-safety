import { describe, expect, it } from 'vitest';
import { markNotificationReadSchema, notificationListQuerySchema } from './notification.schemas.js';

describe('notification input validation', () => {
  it('bounds pagination and allowlists read filters and sorting', () => {
    expect(notificationListQuerySchema.parse({})).toMatchObject({ status: 'all', page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' });
    expect(() => notificationListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => notificationListQuerySchema.parse({ status: 'someone-else' })).toThrow();
    expect(() => notificationListQuerySchema.parse({ sort: 'recipientUserId' })).toThrow();
  });

  it('requires a positive row version when marking read', () => {
    expect(markNotificationReadSchema.parse({ expectedVersion: 1 })).toEqual({ expectedVersion: 1 });
    expect(() => markNotificationReadSchema.parse({ expectedVersion: 0 })).toThrow();
  });
});
