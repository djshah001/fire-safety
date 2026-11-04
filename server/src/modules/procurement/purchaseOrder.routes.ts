import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  amendPoSchema,
  approvePoRevisionSchema,
  cancelPoSchema,
  createGoodsReceiptSchema,
  createPoFromRequisitionSchema,
  createPurchaseOrderSchema,
  goodsReceiptParamsSchema,
  inspectGoodsReceiptSchema,
  issuePoSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderParamsSchema,
  submitPoRevisionSchema,
} from './purchaseOrder.schemas.js';
import { purchaseOrderService } from './purchaseOrder.service.js';

export function createPurchaseOrderRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get(
    '/purchase-orders',
    requirePermission('procurement.purchase_order.read'),
    async (request, response) => {
      const query = purchaseOrderListQuerySchema.parse(request.query);
      const data = await purchaseOrderService.list(getPrincipal(request), query);
      sendData(request, response, data);
    },
  );

  router.post(
    '/purchase-orders',
    requireCsrf,
    requirePermission('procurement.purchase_order.create'),
    async (request, response) => {
      const body = createPurchaseOrderSchema.parse(request.body);
      const po = await purchaseOrderService.createDirect(
        getPrincipal(request),
        body,
        getRequestId(request),
      );
      sendData(request, response, { purchaseOrder: po }, 201);
    },
  );

  router.post(
    '/purchase-orders/from-requisition',
    requireCsrf,
    requirePermission('procurement.purchase_order.create'),
    async (request, response) => {
      const body = createPoFromRequisitionSchema.parse(request.body);
      const po = await purchaseOrderService.createFromRequisition(
        getPrincipal(request),
        body,
        getRequestId(request),
      );
      sendData(request, response, { purchaseOrder: po }, 201);
    },
  );

  router.get(
    '/purchase-orders/:poId',
    requirePermission('procurement.purchase_order.read'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const data = await purchaseOrderService.get(getPrincipal(request), poId);
      sendData(request, response, data);
    },
  );

  router.post(
    '/purchase-orders/:poId/submit',
    requireCsrf,
    requirePermission('procurement.purchase_order.create'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const { expectedVersion } = submitPoRevisionSchema.parse(request.body);
      const po = await purchaseOrderService.get(getPrincipal(request), poId);
      const result = await purchaseOrderService.submitRevision(
        getPrincipal(request),
        poId,
        po.currentRevision.id,
        expectedVersion,
        getRequestId(request),
      );
      sendData(request, response, { revision: result });
    },
  );

  router.post(
    '/purchase-orders/:poId/approve',
    requireCsrf,
    requirePermission('procurement.purchase_order.approve'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const { expectedVersion, notes } = approvePoRevisionSchema.parse(request.body);
      const po = await purchaseOrderService.get(getPrincipal(request), poId);
      const result = await purchaseOrderService.approveRevision(
        getPrincipal(request),
        poId,
        po.currentRevision.id,
        expectedVersion,
        notes,
        getRequestId(request),
      );
      sendData(request, response, { revision: result });
    },
  );

  router.post(
    '/purchase-orders/:poId/issue',
    requireCsrf,
    requirePermission('procurement.purchase_order.issue'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const { expectedVersion } = issuePoSchema.parse(request.body);
      const po = await purchaseOrderService.get(getPrincipal(request), poId);
      const result = await purchaseOrderService.issuePurchaseOrder(
        getPrincipal(request),
        poId,
        po.currentRevision.id,
        expectedVersion,
        getRequestId(request),
      );
      sendData(request, response, result);
    },
  );

  router.post(
    '/purchase-orders/:poId/amend',
    requireCsrf,
    requirePermission('procurement.purchase_order.amend'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const { expectedVersion, changeReason } = amendPoSchema.parse(request.body);
      const result = await purchaseOrderService.amendPurchaseOrder(
        getPrincipal(request),
        poId,
        expectedVersion,
        changeReason,
        getRequestId(request),
      );
      sendData(request, response, { revision: result }, 201);
    },
  );

  router.post(
    '/purchase-orders/:poId/cancel',
    requireCsrf,
    requirePermission('procurement.purchase_order.create'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const { expectedVersion, cancellationReason } = cancelPoSchema.parse(request.body);
      const result = await purchaseOrderService.cancelPurchaseOrder(
        getPrincipal(request),
        poId,
        expectedVersion,
        cancellationReason,
        getRequestId(request),
      );
      sendData(request, response, result);
    },
  );

  router.post(
    '/purchase-orders/:poId/goods-receipts',
    requireCsrf,
    requirePermission('procurement.goods_receipt.manage'),
    async (request, response) => {
      const { poId } = purchaseOrderParamsSchema.parse(request.params);
      const body = createGoodsReceiptSchema.parse(request.body);
      const result = await purchaseOrderService.createGoodsReceipt(
        getPrincipal(request),
        poId,
        body,
        getRequestId(request),
      );
      sendData(request, response, { goodsReceipt: result }, 201);
    },
  );

  router.post(
    '/goods-receipts/:grnId/inspect',
    requireCsrf,
    requirePermission('procurement.goods_receipt.inspect'),
    async (request, response) => {
      const { grnId } = goodsReceiptParamsSchema.parse(request.params);
      const body = inspectGoodsReceiptSchema.parse(request.body);
      const result = await purchaseOrderService.inspectGoodsReceipt(
        getPrincipal(request),
        grnId,
        body.expectedVersion,
        body.lines,
        getRequestId(request),
      );
      sendData(request, response, { goodsReceipt: result });
    },
  );

  return router;
}

