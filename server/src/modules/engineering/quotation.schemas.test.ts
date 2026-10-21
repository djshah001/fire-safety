import { describe, expect, it } from 'vitest';
import { paymentPlanSchema, quotationHeaderSchema, quotationReviewSchema } from './quotation.schemas.js';

describe('quotation schemas', () => {
  it('requires payment percentages to reconcile exactly', () => {
    expect(paymentPlanSchema.parse({ cashPercentage: '30.25', nonCashPercentage: '69.75', expectedVersion: 1 })).toMatchObject({ cashPercentage: '30.25' });
    expect(() => paymentPlanSchema.parse({ cashPercentage: '30', nonCashPercentage: '60', expectedVersion: 1 })).toThrow();
  });

  it('requires a label for a non-zero explicit tax amount', () => {
    const base = { title: 'Demo quote', validityDays: 30, exclusions: 'As listed', deliveryTerms: 'By agreement', paymentTerms: 'By agreement', additionalDiscount: '0', roundingAdjustment: '0', expectedVersion: 1 };
    expect(() => quotationHeaderSchema.parse({ ...base, taxAmount: '12.50' })).toThrow();
    expect(quotationHeaderSchema.parse({ ...base, taxAmount: '12.50', taxLabel: 'Demo tax input' }).taxLabel).toBe('Demo tax input');
  });

  it('requires a reason when returning a quotation', () => {
    expect(() => quotationReviewSchema.parse({ decision: 'returned', expectedVersion: 1 })).toThrow();
  });
});
