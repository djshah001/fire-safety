import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { createPrivateUpload, ensureUploadRoot, removePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { db } from '../../infrastructure/database/db.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

export const inventoryRepository = new InventoryRepository(db as any);
export const inventoryService = new InventoryService(inventoryRepository);

const podUpload = createPrivateUpload({
  allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png']),
  maxFileBytes: 20 * 1024 * 1024,
  maxFiles: 1,
});

export function createInventoryRouter() {
  const router = Router();
  router.use(requireAuthentication);

  // Warehouses
  router.get('/warehouses', requirePermission('inventory.warehouse.read'), async (req, res, next) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const data = await inventoryService.listWarehouses(getPrincipal(req), { includeInactive });
      sendData(req, res, { warehouses: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/warehouses', requireCsrf, requirePermission('inventory.warehouse.manage'), async (req, res, next) => {
    try {
      const warehouse = await inventoryService.createWarehouse(getPrincipal(req), req.body);
      sendData(req, res, { warehouse }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.put('/warehouses/:id', requireCsrf, requirePermission('inventory.warehouse.manage'), async (req, res, next) => {
    try {
      const warehouse = await inventoryService.updateWarehouse(getPrincipal(req), req.params.id as string, req.body);
      sendData(req, res, { warehouse });
    } catch (err) {
      next(err);
    }
  });

  // Stock balances
  router.get('/balances', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const { warehouseId, search, categoryId, limit, offset } = req.query;
      const data = await inventoryService.listStockBalances(getPrincipal(req), {
        warehouseId: warehouseId as string | undefined,
        search: search as string | undefined,
        categoryId: categoryId as string | undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      sendData(req, res, { balances: data });
    } catch (err) {
      next(err);
    }
  });

  // Stock ledger entries
  router.get('/ledger', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const { warehouseId, itemId, sourceType, limit, offset } = req.query;
      const data = await inventoryService.listStockLedger(getPrincipal(req), {
        warehouseId: warehouseId as string | undefined,
        itemId: itemId as string | undefined,
        sourceType: sourceType as string | undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      sendData(req, res, { entries: data });
    } catch (err) {
      next(err);
    }
  });

  // Post GRN line into warehouse stock
  router.post('/post-grn', requireCsrf, requirePermission('inventory.receipt.post'), async (req, res, next) => {
    try {
      const result = await inventoryService.postGoodsReceiptToInventory(getPrincipal(req), req.body);
      sendData(req, res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  // Stock Transfers
  router.get('/transfers', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const { status } = req.query;
      const data = await inventoryService.listStockTransfers(getPrincipal(req), {
        status: status as string | undefined,
      });
      sendData(req, res, { transfers: data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/transfers/:id', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const data = await inventoryService.getStockTransfer(getPrincipal(req), req.params.id as string);
      sendData(req, res, { transfer: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/transfers', requireCsrf, requirePermission('inventory.transfer.create'), async (req, res, next) => {
    try {
      const transfer = await inventoryService.createStockTransfer(getPrincipal(req), req.body);
      sendData(req, res, { transfer }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/transfers/:id/dispatch',
    requireCsrf,
    requirePermission('inventory.transfer.dispatch'),
    async (req, res, next) => {
      try {
        const transfer = await inventoryService.dispatchStockTransfer(getPrincipal(req), req.params.id as string);
        sendData(req, res, { transfer });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/transfers/:id/receive',
    requireCsrf,
    requirePermission('inventory.transfer.receive'),
    async (req, res, next) => {
      try {
        const transfer = await inventoryService.receiveStockTransfer(getPrincipal(req), req.params.id as string, req.body);
        sendData(req, res, { transfer });
      } catch (err) {
        next(err);
      }
    }
  );

  // Stock Reservations
  router.get('/reservations', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const { projectId, status } = req.query;
      const data = await inventoryService.listStockReservations(getPrincipal(req), {
        projectId: projectId as string | undefined,
        status: status as string | undefined,
      });
      sendData(req, res, { reservations: data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/reservations',
    requireCsrf,
    requirePermission('inventory.reservation.manage'),
    async (req, res, next) => {
      try {
        const reservation = await inventoryService.createStockReservation(getPrincipal(req), req.body);
        sendData(req, res, { reservation }, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/reservations/:id/release',
    requireCsrf,
    requirePermission('inventory.reservation.manage'),
    async (req, res, next) => {
      try {
        const reservation = await inventoryService.releaseStockReservation(getPrincipal(req), req.params.id as string);
        sendData(req, res, { reservation });
      } catch (err) {
        next(err);
      }
    }
  );

  // Stock Documents (site issue, site return, adjustments, opening balances)
  router.get('/documents', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const { documentType } = req.query;
      const data = await inventoryService.listStockDocuments(getPrincipal(req), {
        documentType: documentType as string | undefined,
      });
      sendData(req, res, { documents: data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents', requireCsrf, async (req, res, next) => {
    try {
      const document = await inventoryService.createAndPostStockDocument(getPrincipal(req), req.body);
      sendData(req, res, { document }, 201);
    } catch (err) {
      next(err);
    }
  });

  // Thresholds and replenishment requests
  router.get('/thresholds', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const data = await inventoryService.listThresholds(getPrincipal(req), req.query.warehouseId as string | undefined);
      sendData(req, res, { thresholds: data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/thresholds', requireCsrf, requirePermission('inventory.threshold.manage'), async (req, res, next) => {
    try {
      const threshold = await inventoryService.upsertThreshold(getPrincipal(req), req.body, getRequestId(req));
      sendData(req, res, { threshold });
    } catch (err) {
      next(err);
    }
  });

  router.get('/replenishment-requests', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const requests = await inventoryService.listReplenishmentRequests(getPrincipal(req), {
        warehouseId: req.query.warehouseId as string | undefined,
        status: req.query.status as string | undefined,
      });
      sendData(req, res, { requests });
    } catch (err) {
      next(err);
    }
  });

  router.post('/replenishment-requests', requireCsrf, requirePermission('inventory.replenishment.request'), async (req, res, next) => {
    try {
      const request = await inventoryService.createReplenishmentRequest(getPrincipal(req), req.body, getRequestId(req));
      sendData(req, res, { request }, 201);
    } catch (err) {
      next(err);
    }
  });

  // MIR and Delivery Challans (store/POD workflows)
  router.get('/material-issue-requests', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const requests = await inventoryService.listMirRequests(getPrincipal(req), {
        warehouseId: req.query.warehouseId as string | undefined,
        projectId: req.query.projectId as string | undefined,
        status: req.query.status as string | undefined,
      });
      sendData(req, res, { requests });
    } catch (err) {
      next(err);
    }
  });

  router.post('/material-issue-requests', requireCsrf, requirePermission('inventory.request.create'), async (req, res, next) => {
    try {
      const request = await inventoryService.createMir(getPrincipal(req), req.body, getRequestId(req));
      sendData(req, res, { request }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/material-issue-requests/:mirId/dispatch', requireCsrf, requirePermission('inventory.dispatch.execute'), async (req, res, next) => {
    try {
      const challan = await inventoryService.dispatchMir(getPrincipal(req), req.params.mirId as string, req.body, getRequestId(req));
      sendData(req, res, { challan }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/delivery-challans', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const challans = await inventoryService.listDeliveryChallans(getPrincipal(req), {
        projectId: req.query.projectId as string | undefined,
        status: req.query.status as string | undefined,
      });
      sendData(req, res, { challans });
    } catch (err) {
      next(err);
    }
  });

  router.get('/delivery-challans/:dcId/pdf', async (req, res, next) => {
    try {
      const file = await inventoryService.getDeliveryChallanPdfFile(getPrincipal(req), req.params.dcId as string);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
      res.sendFile(file.filePath);
    } catch (err) {
      next(err);
    }
  });

  router.get('/delivery-challans/:dcId/pod-photo', async (req, res, next) => {
    try {
      const file = await inventoryService.getDeliveryChallanPodPhotoFile(getPrincipal(req), req.params.dcId as string);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
      res.sendFile(file.filePath);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/delivery-challans/:dcId/verify-pod',
    requireCsrf,
    requirePermission('inventory.pod.verify'),
    async (req, res, next) => {
      try {
        await ensureUploadRoot();
        next();
      } catch (err) {
        next(err);
      }
    },
    podUpload.single('photo'),
    async (req, res, next) => {
      const uploadedFile = req.file;
      try {
        let uploadedPhoto: { storageName: string; checksumSha256: string } | undefined;
        if (uploadedFile) {
          const bytes = await readFile(uploadedFile.path);
          uploadedPhoto = {
            storageName: uploadedFile.filename,
            checksumSha256: createHash('sha256').update(bytes).digest('hex'),
          };
        }
        const rawBody = (req.body ?? {}) as Record<string, unknown>;
        const parsedLines =
          typeof rawBody.lines === 'string' ? JSON.parse(rawBody.lines) : rawBody.lines;
        const payload = {
          rowVersion: rawBody.rowVersion !== undefined ? Number(rawBody.rowVersion) : undefined,
          verificationNotes: rawBody.verificationNotes,
          lines: parsedLines,
        };
        const challan = await inventoryService.verifyPod(
          getPrincipal(req),
          req.params.dcId as string,
          payload,
          uploadedPhoto,
          getRequestId(req)
        );
        sendData(req, res, { challan });
      } catch (err) {
        if (uploadedFile) {
          await removePrivateFile(uploadedFile.filename).catch(() => undefined);
        }
        next(err);
      }
    }
  );

  router.post('/delivery-challans/:dcId/resolve-discrepancy', requireCsrf, requirePermission('inventory.discrepancy.resolve'), async (req, res, next) => {
    try {
      const challan = await inventoryService.resolveDiscrepancy(getPrincipal(req), req.params.dcId as string, req.body, getRequestId(req));
      sendData(req, res, { challan });
    } catch (err) {
      next(err);
    }
  });

  router.get('/site-returns', requirePermission('inventory.stock.read'), async (req, res, next) => {
    try {
      const returns = await inventoryService.listSiteReturns(getPrincipal(req), {
        projectId: req.query.projectId as string | undefined,
        status: req.query.status as string | undefined,
      });
      sendData(req, res, { returns });
    } catch (err) {
      next(err);
    }
  });

  router.post('/site-returns', requireCsrf, async (req, res, next) => {
    try {
      const siteReturn = await inventoryService.createSiteReturn(getPrincipal(req), req.body, getRequestId(req));
      sendData(req, res, { siteReturn }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/site-returns/:id/accept', requireCsrf, requirePermission('inventory.dispatch.execute'), async (req, res, next) => {
    try {
      const siteReturn = await inventoryService.acceptSiteReturn(getPrincipal(req), req.params.id as string, getRequestId(req));
      sendData(req, res, { siteReturn });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
