import { describe, expect, it } from 'vitest';
import { projectListQuerySchema, startProjectSchema } from './project.schemas.js';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('project input validation', () => {
  it('allowlists server pagination, filters, and sorting', () => {
    expect(projectListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20, sort: 'startDate', direction: 'desc' });
    expect(() => projectListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => projectListQuerySchema.parse({ sort: 'customerId' })).toThrow();
  });

  it('requires ordered dates, unique members, evidence reason, and an idempotency key', () => {
    const valid = { title: 'Warehouse fire upgrade', designRevisionId: id('1'), projectManagerUserId: id('2'), memberUserIds: [id('3')], startDate: '2026-10-21', targetCompletionDate: '2026-11-21', startReason: 'Customer-approved design authorizes site work.', idempotencyKey: id('4') };
    expect(startProjectSchema.parse(valid)).toMatchObject({ title: valid.title, startDate: valid.startDate });
    expect(() => startProjectSchema.parse({ ...valid, targetCompletionDate: '2026-10-20' })).toThrow();
    expect(() => startProjectSchema.parse({ ...valid, memberUserIds: [id('3'), id('3')] })).toThrow();
    expect(() => startProjectSchema.parse({ ...valid, startReason: 'x' })).toThrow();
  });
});
