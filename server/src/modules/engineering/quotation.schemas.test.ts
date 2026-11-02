import { describe, expect, it } from 'vitest';
import { paymentPlanSchema, quotationDocumentDetailsSchema, quotationHeaderSchema, quotationLineSchema, quotationReviewSchema } from './quotation.schemas.js';

describe('quotation schemas', () => {
  it('bounds letterhead/contact fields and refuses client-provided asset paths', () => {
    expect(quotationDocumentDetailsSchema.parse({ expectedVersion: 1, details: { senderTagline: ' Fire safety ', recipientContact: ' Customer contact ', recipientPhone: '123' } }).details)
      .toEqual({ senderTagline: 'Fire safety', recipientContact: 'Customer contact', recipientPhone: '123' });
    expect(() => quotationDocumentDetailsSchema.parse({ expectedVersion: 1, details: { senderTagline: 'x'.repeat(201) } })).toThrow();
    expect(() => quotationDocumentDetailsSchema.parse({ expectedVersion: 1, details: { logoPath: '/private/file' } })).toThrow();
  });
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

  it('requires selection of an approved offering and rejects client prices', () => {
    const input = { expectedRevisionVersion: 1, expectedLineVersion: 1 };
    expect(() => quotationLineSchema.parse(input)).toThrow();
    expect(quotationLineSchema.parse({ ...input, offeringId: '00000000-0000-4000-8000-000000000001' }).offeringId).toBeTruthy();
    expect(() => quotationLineSchema.parse({ ...input, offeringId: '00000000-0000-4000-8000-000000000001', unitRate: '100.00' })).toThrow();
  });
});
