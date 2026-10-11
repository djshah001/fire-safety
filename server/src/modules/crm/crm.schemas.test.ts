import { describe, expect, it } from 'vitest';
import { activityInputSchema, bulkLeadAssignmentSchema, bulkReminderInputSchema, customerListQuerySchema, leadListQuerySchema, reminderInputSchema } from './crm.schemas.js';

describe('CRM request validation', () => {
  it('accepts only allowlisted server-side sort fields and bounded page sizes', () => {
    expect(customerListQuerySchema.parse({ sort: 'name', direction: 'desc', pageSize: '100' }))
      .toMatchObject({ sort: 'name', direction: 'desc', pageSize: 100 });
    expect(() => leadListQuerySchema.parse({ sort: 'ownerUserId' })).toThrow();
    expect(() => customerListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it('rejects invalid reminder timezones and reminders due too soon', () => {
    const dueAt = new Date(Date.now() + 10 * 60_000).toISOString();
    expect(() => reminderInputSchema.parse({ title: 'Call customer', timezone: 'Not/A_Zone', dueAt }))
      .toThrow();
    expect(() => reminderInputSchema.parse({
      title: 'Call customer',
      timezone: 'Asia/Kolkata',
      dueAt: new Date(Date.now() + 10_000).toISOString(),
    })).toThrow();
  });

  it('rejects activities materially in the future', () => {
    expect(() => activityInputSchema.parse({
      type: 'call',
      summary: 'Discussed the site survey.',
      occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    })).toThrow();
  });

  it('bounds bulk actions and rejects duplicate lead targets', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const assigneeUserId = '00000000-0000-4000-8000-000000000002';
    expect(() => bulkLeadAssignmentSchema.parse({
      targets: [{ id, expectedVersion: 1 }, { id, expectedVersion: 1 }],
      assigneeUserId,
    })).toThrow();
    expect(() => bulkReminderInputSchema.parse({
      targets: Array.from({ length: 101 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        expectedVersion: 1,
      })),
      title: 'Follow up',
      timezone: 'Asia/Kolkata',
      dueAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      recurrence: 'none',
    })).toThrow();
  });
});
