import { describe, expect, it } from 'vitest';
import { boqQuantityInputSchema, boqReviewSchema, boqTemplateInputSchema, estimateLineInputSchema } from './boq.schemas.js';

const id = '00000000-0000-4000-8000-000000000001';

describe('BOQ and estimate validation', () => {
  it('preserves exact positive quantity strings', () => {
    expect(boqQuantityInputSchema.parse({ quantity: '12.5000', expectedBoqVersion: 1, expectedLineVersion: 1 }).quantity).toBe('12.5000');
    expect(() => boqQuantityInputSchema.parse({ quantity: '0', expectedBoqVersion: 1, expectedLineVersion: 1 })).toThrow();
  });

  it('bounds money to two decimal places', () => {
    expect(estimateLineInputSchema.parse({ category: 'labour', description: 'Installation', quantity: '2', unitRate: '1250.50', expectedBoqVersion: 1 }).unitRate).toBe('1250.50');
    expect(() => estimateLineInputSchema.parse({ category: 'labour', description: 'Installation', quantity: '2', unitRate: '1.999', expectedBoqVersion: 1 })).toThrow();
  });

  it('requires a reason for a returned BOQ', () => {
    expect(() => boqReviewSchema.parse({ decision: 'returned', expectedVersion: 1 })).toThrow();
  });

  it('requires independent BOQ workflow assignees', () => {
    expect(() => boqTemplateInputSchema.parse({
      sectorId: id,
      name: 'Industrial template',
      costingUserId: id,
      purchaseHeadUserId: id,
      adminApproverUserId: '00000000-0000-4000-8000-000000000002',
      items: [{ itemId: id, section: 'Detection' }],
    })).toThrow();
  });
});
