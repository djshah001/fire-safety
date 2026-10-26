import { describe, expect, it } from 'vitest';
import { activityInputSchema, authorizeDesignInputSchema, bulkLeadAssignmentSchema, bulkReminderInputSchema, customerInputSchema, customerListQuerySchema, leadListQuerySchema, reminderInputSchema } from './crm.schemas.js';

describe('CRM request validation', () => {
  it('normalizes and validates optional Indian customer tax identifiers', () => {
    const customer = customerInputSchema.parse({
      displayName: 'Example Industries', customerType: 'business', gstin: '24abcde1234f1z5', pan: 'abcde1234f',
      contacts: [{ name: 'Anita Shah', email: 'anita@example.test', isPrimary: true }],
    });
    expect(customer).toMatchObject({ gstin: '24ABCDE1234F1Z5', pan: 'ABCDE1234F' });
    expect(() => customerInputSchema.parse({ displayName: 'Example Industries', gstin: 'invalid', contacts: [{ name: 'Anita Shah', email: 'anita@example.test' }] })).toThrow();
  });
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

  it('requires a design head while leaving engineer assignment to that head', () => {
    const designHeadUserId = '00000000-0000-4000-8000-000000000001';
    expect(authorizeDesignInputSchema.parse({
      expectedVersion: 1,
      title: 'Warehouse design',
      designHeadUserId,
      surveyRequested: false,
      authorizationNotes: 'Prepare a preliminary layout.',
    })).toMatchObject({ designHeadUserId });
    expect(() => authorizeDesignInputSchema.parse({
      expectedVersion: 1,
      title: 'Warehouse design',
      surveyRequested: false,
      authorizationNotes: 'Prepare a preliminary layout.',
    })).toThrow();
  });
});
