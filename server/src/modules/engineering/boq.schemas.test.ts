import { describe, expect, it } from 'vitest';
import {
  boqAddLinesSchema,
  boqApplyTemplateSchema,
  boqBatchQuantitiesSchema,
  boqBulkDeleteLinesSchema,
  boqBulkMarkupSchema,
  boqBulkUpdateLinesSchema,
  boqMarkupInputSchema,
  boqQuantityInputSchema,
  boqReorderLinesSchema,
  boqReviewSchema,
  boqTemplateInputSchema,
} from './boq.schemas.js';
import { calculateQuotedLine } from './boq.calculation.js';

const id = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';

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
      adminApproverUserId: id2,
      items: [{ itemId: id, section: 'Detection' }],
    })).toThrow();
  });

  it('validates batch inline quantities, reorder, template switch, line add, and bulk schemas', () => {
    expect(boqBatchQuantitiesSchema.parse({ expectedVersion: 1, updates: [{ lineId: id, quantity: '0' }, { lineId: id2, quantity: '14.25' }] }).updates).toHaveLength(2);
    expect(() => boqBatchQuantitiesSchema.parse({ expectedVersion: 1, updates: [{ lineId: id, quantity: '1' }, { lineId: id, quantity: '2' }] })).toThrow();
    expect(() => boqReorderLinesSchema.parse({ expectedVersion: 1, orderedLineIds: [id, id] })).toThrow();
    expect(boqApplyTemplateSchema.parse({ expectedVersion: 1, templateId: id, mode: 'replace' }).mode).toBe('replace');
    expect(boqAddLinesSchema.parse({ expectedVersion: 1, itemId: id, section: 'Pump room', quantity: '3' })).toMatchObject({ itemId: id });
    expect(boqBulkDeleteLinesSchema.parse({ expectedVersion: 1, lineIds: [id, id2] }).lineIds).toHaveLength(2);
    expect(() => boqBulkUpdateLinesSchema.parse({ expectedVersion: 1, lineIds: [id], patch: {} })).toThrow();
    expect(boqBulkMarkupSchema.parse({ expectedVersion: 1, sectionName: 'Pump room', markupPercent: '18.5' }).markupPercent).toBe('18.5');
  });
});
