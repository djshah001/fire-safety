import { describe, expect, it } from 'vitest';
import {
  createPriceInquirySchema,
  inviteVendorSchema,
  submitPriceResponseSchema,
} from './priceInquiry.schemas.js';

describe('priceInquiry schemas', () => {
  it('validates creation of price inquiry with items', () => {
    const valid = {
      title: 'Smoke detectors and fire alarm cables',
      description: 'Requirement for Block A project',
      items: [
        {
          itemName: 'Optical Smoke Detector',
          itemCode: 'DET-SMK-01',
          unit: 'NOS',
          quantity: '50',
          specification: 'Addressable standard EN54',
        },
      ],
      responseDueDate: '2026-11-20',
    };

    const parsed = createPriceInquirySchema.parse(valid);
    expect(parsed.title).toBe('Smoke detectors and fire alarm cables');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.itemName).toBe('Optical Smoke Detector');
  });

  it('rejects inquiry creation with zero items', () => {
    const invalid = {
      title: 'Empty inquiry',
      items: [],
    };
    expect(() => createPriceInquirySchema.parse(invalid)).toThrow();
  });

  it('validates vendor invitation payload', () => {
    const valid = {
      vendorId: '11111111-1111-4111-8111-111111111111',
      whatsappNumber: '+919876543210',
      sendMsg91: true,
      expiryDays: 14,
    };
    const parsed = inviteVendorSchema.parse(valid);
    expect(parsed.vendorId).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed.sendMsg91).toBe(true);
    expect(parsed.expiryDays).toBe(14);
  });

  it('validates public vendor price response submission', () => {
    const valid = {
      responses: [
        {
          itemRef: {
            itemName: 'Fire alarm cable 2 core 1.5 sqmm',
            quantity: '100',
            unit: 'MTR',
          },
          unitRate: '45.50',
          currency: 'INR',
          leadTimeDays: 7,
          notes: 'Finolex brand, armored',
          moq: '50',
          validUntil: '2026-12-31',
        },
      ],
      saveToPriceList: true,
    };

    const parsed = submitPriceResponseSchema.parse(valid);
    expect(parsed.responses).toHaveLength(1);
    expect(parsed.responses[0]?.unitRate).toBe('45.50');
    expect(parsed.saveToPriceList).toBe(true);
  });
});

