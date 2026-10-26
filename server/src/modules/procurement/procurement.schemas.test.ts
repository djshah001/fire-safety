import { describe, expect, it } from 'vitest';
import { createRequisitionSchema, createRfqSchema, createVendorOfferSchema, requisitionListQuerySchema, selectVendorOfferSchema, substitutionDecisionSchema, substitutionReviewListQuerySchema } from './procurement.schemas.js';

const id = '10000000-0000-4000-8000-000000000001';
const id2 = '10000000-0000-4000-8000-000000000002';

describe('procurement input validation', () => {
  it('bounds and allowlists the requisition directory query', () => {
    expect(requisitionListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20, sort: 'updatedAt', direction: 'desc' });
    expect(() => requisitionListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => requisitionListQuerySchema.parse({ sort: 'buyerUserId' })).toThrow();
  });

  it('requires unique positive approved-BOQ demand lines', () => {
    const base = { projectId: id, boqRevisionId: id2, title: 'Detector demand', purchaseManagerUserId: id2, requiredBy: '2026-11-15', deliveryLocation: 'Project site', lines: [{ boqLineId: id, quantity: '2.5000' }] };
    expect(createRequisitionSchema.parse(base).lines[0]?.quantity).toBe('2.5000');
    expect(() => createRequisitionSchema.parse({ ...base, lines: [{ boqLineId: id, quantity: '1' }, { boqLineId: id, quantity: '2' }] })).toThrow();
    expect(() => createRequisitionSchema.parse({ ...base, lines: [{ boqLineId: id, quantity: '0' }] })).toThrow();
  });

  it('requires unique RFQ vendors', () => {
    expect(() => createRfqSchema.parse({ vendorIds: [id, id], responseDueDate: '2026-11-01', commercialTerms: 'Quote delivered pricing', expectedVersion: 1 })).toThrow();
  });

  it('requires complete technical deviation details and unique offer lines', () => {
    const line = { rfqLineId: id, unitRate: '123.45', brandOffered: 'Demo Make', specificationOffered: 'Matching specification', equivalence: 'deviation' as const };
    const base = { vendorId: id2, vendorReference: 'Q-001', currency: 'inr', taxBasis: 'GST excluded', freightAmount: '0', paymentTerms: '30 days', warranty: 'One year', lines: [line] };
    expect(() => createVendorOfferSchema.parse(base)).toThrow();
    expect(createVendorOfferSchema.parse({ ...base, lines: [{ ...line, deviationNotes: 'Alternative enclosure rating' }] }).currency).toBe('INR');
  });

  it('requires a reason and optimistic version for supplier selection', () => {
    expect(selectVendorOfferSchema.parse({ offerId: id, selectionReason: 'Better lead time', expectedVersion: '2' }).expectedVersion).toBe(2);
    expect(() => selectVendorOfferSchema.parse({ offerId: id, selectionReason: ' ', expectedVersion: 1 })).toThrow();
  });

  it('allowlists technical review queues and requires a decision reason', () => {
    expect(substitutionReviewListQuerySchema.parse({ status: 'pending' })).toMatchObject({ status: 'pending', page: 1, pageSize: 20 });
    expect(() => substitutionReviewListQuerySchema.parse({ status: 'all' })).toThrow();
    expect(substitutionDecisionSchema.parse({ decision: 'approved', reason: 'Compatible with the approved system.' }).decision).toBe('approved');
    expect(() => substitutionDecisionSchema.parse({ decision: 'rejected', reason: ' ' })).toThrow();
  });
});
