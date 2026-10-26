import { describe, expect, it } from 'vitest';
import { renderDemoQuotationPdf } from './quotation.pdf.js';

describe('demo quotation PDF', () => {
  it('renders a valid labelled PDF snapshot', () => {
    const output = renderDemoQuotationPdf({
      quotationNumber: 'FS-QUO-2026-000001', revisionNumber: 1, customerName: 'Demo Customer', title: 'Fire system',
      currency: 'INR', validityDays: 30, exclusions: 'Civil work excluded', deliveryTerms: 'Four weeks', paymentTerms: 'By agreement',
      subtotal: '100.00', lineDiscountTotal: '0.00', additionalDiscount: '0.00', taxLabel: null, taxAmount: '0.00', roundingAdjustment: '0.00', grandTotal: '100.00',
      lines: [{ lineNumber: 1, itemCode: 'ITEM-1', itemName: 'Detector', specification: 'Addressable detector', brandName: 'Demo Make', quantity: '1.0000', unitSymbol: 'Nos', unitRate: '100.00', discountAmount: '0.00', lineTotal: '100.00' }],
    });
    expect(output.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(output.toString('ascii')).toContain('DEMO / NOT FOR PRODUCTION');
    expect(output.toString('ascii')).toContain('FS-QUO-2026-000001');
  });
});
