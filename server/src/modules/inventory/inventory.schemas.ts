import { z } from 'zod';
import { Decimal } from 'decimal.js';

export const createWarehouseSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  warehouseType: z.enum(['central_warehouse', 'regional_depot', 'project_site_store']),
  projectId: z.string().uuid().optional().nullable(),
  addressLine1: z.string().trim().min(3).max(255),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20).optional().nullable(),
  inChargeUserId: z.string().uuid().optional().nullable(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial().extend({
  isActive: z.number().int().min(0).max(1).optional(),
});

export const createStockLocationSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(120),
});

export const postGrnToStockSchema = z.object({
  warehouseId: z.string().uuid(),
  goodsReceiptLineId: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
});

export const createStockTransferSchema = z.object({
  sourceWarehouseId: z.string().uuid(),
  destinationWarehouseId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  challanNumber: z.string().trim().max(100).optional().nullable(),
  vehicleNumber: z.string().trim().max(50).optional().nullable(),
  transporterName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(
    z.object({
      itemId: z.string().uuid(),
      brandOfferingId: z.string().uuid().optional().nullable(),
      dispatchedQuantity: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Must be a positive decimal quantity'),
      notes: z.string().trim().max(1000).optional(),
    })
  ).min(1, 'At least one line is required'),
});

export const receiveStockTransferSchema = z.object({
  lines: z.array(
    z.object({
      transferLineId: z.string().uuid(),
      receivedQuantity: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Must be a nonnegative decimal quantity'),
    })
  ).min(1),
  notes: z.string().trim().max(1000).optional(),
});

export const createStockReservationSchema = z.object({
  projectId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  boqLineId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid(),
  brandOfferingId: z.string().uuid().optional().nullable(),
  quantityReserved: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Must be a positive decimal quantity'),
  notes: z.string().trim().max(1000).optional(),
});

export const createStockDocumentSchema = z.object({
  documentType: z.enum(['opening_balance', 'site_issue', 'site_return', 'adjustment']),
  sourceWarehouseId: z.string().uuid().optional().nullable(),
  destinationWarehouseId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  referenceNumber: z.string().trim().max(100).optional().nullable(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  notes: z.string().trim().min(3).max(2000),
  lines: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Must be a positive decimal quantity'),
      unitRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
      notes: z.string().trim().max(1000).optional(),
    })
  ).min(1, 'At least one line is required'),
});
export const upsertThresholdSchema = z.object({
  warehouseId: z.string().uuid(),
  itemId: z.string().uuid(),
  brandOfferingId: z.string().uuid().optional().nullable(),
  minStock: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a non-negative decimal quantity'),
  maxStock: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a non-negative decimal quantity'),
}).superRefine((value, ctx) => {
  if (new Decimal(value.maxStock).lt(new Decimal(value.minStock))) {
    ctx.addIssue({ code: 'custom', path: ['maxStock'], message: 'Max stock must be greater than or equal to min stock.' });
  }
});

export const createReplenishmentRequestSchema = z.object({
  warehouseId: z.string().uuid(),
  itemId: z.string().uuid(),
  brandOfferingId: z.string().uuid().optional().nullable(),
  requestedQty: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a positive decimal quantity'),
  notes: z.string().trim().max(2000).optional(),
}).refine((value) => new Decimal(value.requestedQty).gt(0), 'Requested quantity must be greater than zero');

export const createMirSchema = z.object({
  projectId: z.string().uuid(),
  quotationRevisionId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(z.object({
    quotationLineId: z.string().uuid(),
    itemId: z.string().uuid(),
    brandOfferingId: z.string().uuid().optional().nullable(),
    unitId: z.string().uuid(),
    requestedQty: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a positive decimal quantity'),
  })).min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
});

export const dispatchMirSchema = z.object({
  lines: z.array(z.object({
    mirLineId: z.string().uuid(),
    dispatchedQty: z.string().regex(/^\d{1,14}(?:\.\d{1,4})?$/, 'Enter a positive decimal quantity')
      .refine((value) => new Decimal(value).gt(0), 'Dispatch quantity must be greater than zero.'),
  })).min(1).max(200),
  transporterName: z.string().trim().max(160).optional(),
  vehicleNumber: z.string().trim().max(50).optional(),
  receiverName: z.string().trim().max(160).optional(),
});

export const verifyPodSchema = z.object({
  rowVersion: z.number().int().positive(),
  verificationNotes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    dcLineId: z.string().uuid(),
    verifiedReceivedQty: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a non-negative decimal quantity'),
    damagedOrShortQty: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a non-negative decimal quantity'),
    lineRemarks: z.string().trim().max(1000).optional(),
  })).min(1).max(200),
});

export const resolveDiscrepancySchema = z.object({
  rowVersion: z.number().int().positive(),
  resolution: z.enum(['return_to_store', 'write_off_transit_loss', 'picking_error_restock']),
  resolutionNotes: z.string().trim().min(3).max(2000),
});

export const createSiteReturnSchema = z.object({
  projectId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    itemId: z.string().uuid(),
    brandOfferingId: z.string().uuid().optional().nullable(),
    quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Enter a positive decimal quantity'),
    conditionNotes: z.string().trim().max(1000).optional(),
  })).min(1).max(200),
});

