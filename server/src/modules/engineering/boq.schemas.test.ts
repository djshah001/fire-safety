import { describe, expect, it } from 'vitest';
import { boqMarkupInputSchema, boqQuantityInputSchema, boqReviewSchema, boqTemplateInputSchema } from './boq.schemas.js';
import { calculateQuotedLine } from './boq.calculation.js';

const id = '00000000-0000-4000-8000-000000000001';

describe('BOQ and estimate validation', () => {
  it('preserves exact positive quantity strings', () => {
    expect(boqQuantityInputSchema.parse({ quantity: '12.5000', expectedBoqVersion: 1, expectedLineVersion: 1 }).quantity).toBe('12.5000');
    expect(() => boqQuantityInputSchema.parse({ quantity: '0', expectedBoqVersion: 1, expectedLineVersion: 1 })).toThrow();
  });

  it('bounds markup while leaving catalogue rates outside the edit payload', () => {
    expect(boqMarkupInputSchema.parse({ markupPercent: '20.1250', expectedBoqVersion: 1, expectedLineVersion: 1 }).markupPercent).toBe('20.1250');
    expect(() => boqMarkupInputSchema.parse({ markupPercent: '1000.0001', expectedBoqVersion: 1, expectedLineVersion: 1 })).toThrow();
  });

  it('calculates the workbook fixture without applying markup to miscellaneous cost', () => {
    expect(calculateQuotedLine({ quantity: '24', supplyRate: '1045', labourRate: '320', miscellaneousRate: '25', markupPercent: '20' })).toEqual({
      markupAmount: '273.0000', quotedUnitRate: '1663.0000', lineAmount: '39912.00',
    });
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
