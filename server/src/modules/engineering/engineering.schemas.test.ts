import { describe, expect, it } from 'vitest';
import { createRevisionSchema, customerDecisionSchema, designJobListQuerySchema, reviewRevisionSchema, useDesignBufferSchema } from './engineering.schemas.js';

describe('engineering input validation', () => {
  it('bounds server pagination and allowlists sorting', () => {
    expect(designJobListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20, sort: 'updatedAt', direction: 'desc' });
    expect(() => designJobListQuerySchema.parse({ pageSize: 500 })).toThrow();
    expect(() => designJobListQuerySchema.parse({ sort: 'designerUserId' })).toThrow();
  });

  it('requires a meaningful revision title and change summary', () => {
    expect(createRevisionSchema.parse({ title: ' R1 ', changeSummary: ' Initial layout ', expectedJobVersion: 1 }))
      .toMatchObject({ title: 'R1', changeSummary: 'Initial layout' });
    expect(() => createRevisionSchema.parse({ title: 'R', changeSummary: 'x', expectedJobVersion: 1 })).toThrow();
  });

  it('requires a reason when a design head returns a revision', () => {
    expect(() => reviewRevisionSchema.parse({ decision: 'returned', expectedVersion: 1 })).toThrow();
    expect(reviewRevisionSchema.parse({ decision: 'approved', expectedVersion: 1 })).toMatchObject({ decision: 'approved' });
  });

  it('requires traceable evidence for the exact customer decision', () => {
    expect(() => customerDecisionSchema.parse({ decision: 'approved', evidenceReference: ' ', expectedVersion: 1 })).toThrow();
    expect(customerDecisionSchema.parse({ decision: 'changes_requested', evidenceReference: 'Email dated 2026-10-11', expectedVersion: 2 }))
      .toMatchObject({ decision: 'changes_requested', evidenceReference: 'Email dated 2026-10-11' });
  });

  it('requires a reason and optimistic version for a deadline buffer', () => {
    expect(useDesignBufferSchema.parse({ reason: 'Waiting for revised floor plan', expectedVersion: 2 }))
      .toEqual({ reason: 'Waiting for revised floor plan', expectedVersion: 2 });
    expect(() => useDesignBufferSchema.parse({ reason: ' ', expectedVersion: 2 })).toThrow();
    expect(() => useDesignBufferSchema.parse({ reason: 'Valid reason', expectedVersion: 0 })).toThrow();
  });
});
