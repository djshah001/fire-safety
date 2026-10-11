import { describe, expect, it } from 'vitest';
import { boqLineInputSchema, boqReviewSchema, estimateLineInputSchema } from './boq.schemas.js';

const id = '00000000-0000-4000-8000-000000000001';

describe('BOQ and estimate validation', () => {
  it('preserves exact positive quantity strings', () => {
    expect(boqLineInputSchema.parse({ itemId: id, section: 'Hydrant', specification: '80 mm pipe', quantity: '12.5000', expectedBoqVersion: 1 }).quantity).toBe('12.5000');
    expect(() => boqLineInputSchema.parse({ itemId: id, section: 'Hydrant', specification: 'Pipe', quantity: '0', expectedBoqVersion: 1 })).toThrow();
  });

  it('bounds money to two decimal places', () => {
    expect(estimateLineInputSchema.parse({ category: 'labour', description: 'Installation', quantity: '2', unitRate: '1250.50', expectedBoqVersion: 1 }).unitRate).toBe('1250.50');
    expect(() => estimateLineInputSchema.parse({ category: 'labour', description: 'Installation', quantity: '2', unitRate: '1.999', expectedBoqVersion: 1 })).toThrow();
  });

  it('requires a reason for a returned BOQ', () => {
    expect(() => boqReviewSchema.parse({ decision: 'returned', expectedVersion: 1 })).toThrow();
  });
});
