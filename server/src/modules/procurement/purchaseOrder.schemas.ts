import { Decimal } from 'decimal.js';
import { z } from 'zod';

const uuid = z.string().uuid();
const version = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date (YYYY-MM-DD).');
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,14}(?:\.\d{1,4})?$/, 'Enter a positive quantity with at most four decimal places.')
  .refine((value) => new Decimal(value).gt(0), 'Quantity must be greater than zero.');
const money = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places.');
const taxPercent = z
  .string()
  .trim()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/, 'Enter a tax percentage between 0 and 100.')
  .refine((v) => {
    const d = new Decimal(v);
    return d.gte(0) && d.lte(100);
  }, 'Tax percentage must be between 0 and 100.');

export const purchaseOrderListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z
    .enum([
      'draft',
      'pending_approval',
      'approved',
      'issued',
      'partially_delivered',
      'delivered',
      'closed',
      'cancelled',
    ])
    .optional(),
  vendorId: uuid.optional(),
  projectId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z
    .enum(['poNumber', 'title', 'status', 'grandTotal', 'deliveryDueDate', 'createdAt', 'updatedAt'])
    .default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const purchaseOrderParamsSchema = z.object({
  poId: uuid,
});

export const purchaseOrderRevisionParamsSchema = z.object({
  poId: uuid,
  revisionId: uuid,
});

export const createPoLineSchema = z.object({
  itemId: uuid,
  itemCodeSnapshot: z.string().trim().min(1).max(50),
  itemNameSnapshot: z.string().trim().min(1).max(160),
  specificationSnapshot: z.string().trim().min(1).max(2_000),
  brandOffered: z.string().trim().min(1).max(160),
  modelSnapshot: z.string().trim().max(160).optional(),
  unitId: uuid,
  unitSymbolSnapshot: z.string().trim().min(1).max(20),
  quantity,
  unitRate: money,
  taxPercent: taxPercent.default('0.00'),
  requisitionLineId: uuid.optional(),
});

export const createPurchaseOrderSchema = z.object({
  projectId: uuid,
  vendorId: uuid,
  requisitionId: uuid.optional(),
  title: z.string().trim().min(2).max(200),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Enter a 3-letter currency code (e.g. INR).').default('INR'),
  paymentTerms: z.string().trim().min(2).max(1_000),
  deliveryTerms: z.string().trim().min(2).max(1_000),
  deliveryLocation: z.string().trim().min(3).max(500),
  deliveryDueDate: date.optional(),
  billingAddress: z.string().trim().max(500).optional(),
  shippingAddress: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2_000).optional(),
  lines: z.array(createPoLineSchema).min(1).max(200),
});

export const createPoFromRequisitionSchema = z.object({
  requisitionId: uuid,
  title: z.string().trim().min(2).max(200).optional(),
  paymentTerms: z.string().trim().max(1_000).optional(),
  deliveryTerms: z.string().trim().max(1_000).optional(),
  deliveryLocation: z.string().trim().max(500).optional(),
  deliveryDueDate: date.optional(),
  billingAddress: z.string().trim().max(500).optional(),
  shippingAddress: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const submitPoRevisionSchema = z.object({
  expectedVersion: version,
});

export const approvePoRevisionSchema = z.object({
  expectedVersion: version,
  notes: z.string().trim().max(2_000).optional(),
});

export const issuePoSchema = z.object({
  expectedVersion: version,
});

export const amendPoSchema = z.object({
  expectedVersion: version,
  changeReason: z.string().trim().min(5, 'State a clear amendment reason of at least 5 characters.').max(2_000),
});

export const cancelPoSchema = z.object({
  expectedVersion: version,
  cancellationReason: z.string().trim().min(5).max(2_000),
});

export const createGoodsReceiptLineSchema = z.object({
  purchaseOrderLineId: uuid,
  deliveredQuantity: quantity,
  acceptedQuantity: z
    .string()
    .trim()
    .regex(/^\d{1,14}(?:\.\d{1,4})?$/)
    .optional(),
  rejectedQuantity: z
    .string()
    .trim()
    .regex(/^\d{1,14}(?:\.\d{1,4})?$/)
    .optional(),
  rejectionReason: z.string().trim().max(2_000).optional(),
  inspectionNotes: z.string().trim().max(2_000).optional(),
});

export const createGoodsReceiptSchema = z.object({
  vendorChallanNumber: z.string().trim().min(1, 'Challan / delivery reference is required.').max(100),
  vendorChallanDate: date,
  deliveryLocation: z.string().trim().min(3).max(500),
  vehicleNumber: z.string().trim().max(50).optional(),
  transporterName: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2_000).optional(),
  lines: z.array(createGoodsReceiptLineSchema).min(1).max(200),
});

export const goodsReceiptParamsSchema = z.object({
  grnId: uuid,
});

export const inspectGoodsReceiptSchema = z.object({
  expectedVersion: version,
  lines: z
    .array(
      z.object({
        goodsReceiptLineId: uuid,
        acceptedQuantity: quantity,
        rejectedQuantity: z
          .string()
          .trim()
          .regex(/^\d{1,14}(?:\.\d{1,4})?$/)
          .default('0.0000'),
        rejectionReason: z.string().trim().max(2_000).optional(),
        inspectionNotes: z.string().trim().max(2_000).optional(),
      }).superRefine((val, ctx) => {
        if (new Decimal(val.rejectedQuantity).gt(0) && !val.rejectionReason) {
          ctx.addIssue({
            code: 'custom',
            path: ['rejectionReason'],
            message: 'A rejection reason is mandatory when items are rejected.',
          });
        }
      }),
    )
    .min(1),
});

