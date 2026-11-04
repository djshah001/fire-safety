import { describe, expect, it } from 'vitest';
import {
  amendPoSchema,
  createGoodsReceiptSchema,
  createPurchaseOrderSchema,
  inspectGoodsReceiptSchema,
} from './purchaseOrder.schemas.js';

describe('purchaseOrder.schemas', () => {
  it('validates a complete purchase order draft payload', () => {
    const valid = createPurchaseOrderSchema.safeParse({
      projectId: 'a0000000-0000-4000-8000-000000000001',
      vendorId: 'a0000000-0000-4000-8000-000000000002',
      title: 'Supply of Fire Suppression Pipe and Valves',
      paymentTerms: '30 days net from invoice and inspection acceptance',
      deliveryTerms: 'FOR Site delivery',
      deliveryLocation: 'Surat Textile Market Project Site',
      lines: [
        {
          itemId: 'a0000000-0000-4000-8000-000000000003',
          itemCodeSnapshot: 'PIPE-MS-100',
          itemNameSnapshot: '100mm Heavy MS ERW Pipe',
          specificationSnapshot: 'IS 1239 Part 1 Heavy Grade',
          brandOffered: 'Tata Steel',
          unitId: 'a0000000-0000-4000-8000-000000000004',
          unitSymbolSnapshot: 'MTR',
          quantity: '500.0000',
          unitRate: '1250.00',
          taxPercent: '18.00',
        },
      ],
    });

    expect(valid.success).toBe(true);
  });

  it('rejects an amendment with short or empty changeReason', () => {
    const invalid = amendPoSchema.safeParse({
      expectedVersion: 1,
      changeReason: 'no',
    });

    expect(invalid.success).toBe(false);
  });

  it('validates goods receipt and requires rejection reason when items are rejected', () => {
    const validGrn = createGoodsReceiptSchema.safeParse({
      vendorChallanNumber: 'DC-2026-99',
      vendorChallanDate: '2026-11-04',
      deliveryLocation: 'Warehouse A',
      lines: [
        {
          purchaseOrderLineId: 'a0000000-0000-4000-8000-000000000001',
          deliveredQuantity: '100.0000',
        },
      ],
    });
    expect(validGrn.success).toBe(true);

    const invalidInspection = inspectGoodsReceiptSchema.safeParse({
      expectedVersion: 1,
      lines: [
        {
          goodsReceiptLineId: 'a0000000-0000-4000-8000-000000000002',
          acceptedQuantity: '80.0000',
          rejectedQuantity: '20.0000',
          // missing rejectionReason
        },
      ],
    });
    expect(invalidInspection.success).toBe(false);
  });
});
