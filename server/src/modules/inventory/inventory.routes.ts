import { Router } from 'express';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import { db } from '../../infrastructure/database/db.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

export const inventoryRepository = new InventoryRepository(db as any);
export const inventoryService = new InventoryService(inventoryRepository);

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

  return router;
}
