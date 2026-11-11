import { Decimal } from 'decimal.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { hasPermission } from '../auth/auth.middleware.js';
import { InventoryRepository } from './inventory.repository.js';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  postGrnToStockSchema,
  createStockTransferSchema,
  receiveStockTransferSchema,
  createStockReservationSchema,
  createStockDocumentSchema,
} from './inventory.schemas.js';

export class InventoryService {
  constructor(private readonly repo: InventoryRepository) {}

  private assertPermission(principal: AuthenticatedPrincipal, permission: string) {
    if (
      hasPermission(principal, 'system.access.all') ||
      hasPermission(principal, permission)
    ) {
      return;
    }
    const err: any = new Error(`Forbidden: missing required permission ${permission}`);
    err.statusCode = 403;
    throw err;
  }

  async listWarehouses(principal: AuthenticatedPrincipal, params?: { includeInactive?: boolean }) {
    this.assertPermission(principal, 'inventory.warehouse.read');
    return this.repo.listWarehouses(principal.companyId, params);
  }

  async createWarehouse(principal: AuthenticatedPrincipal, payload: unknown) {
    this.assertPermission(principal, 'inventory.warehouse.manage');
    const parsed = createWarehouseSchema.parse(payload);

    const existing = await this.repo.getWarehouseByCode(principal.companyId, parsed.code);
    if (existing) {
      const err: any = new Error(`Warehouse with code "${parsed.code}" already exists.`);
      err.statusCode = 409;
      throw err;
    }

    return this.repo.createWarehouse({
      companyId: principal.companyId,
      code: parsed.code,
      name: parsed.name,
      warehouseType: parsed.warehouseType,
      projectId: parsed.projectId,
      addressLine1: parsed.addressLine1,
      city: parsed.city,
      state: parsed.state,
      postalCode: parsed.postalCode,
      inChargeUserId: parsed.inChargeUserId,
    });
  }

  async updateWarehouse(principal: AuthenticatedPrincipal, id: string, payload: unknown) {
    this.assertPermission(principal, 'inventory.warehouse.manage');
    const parsed = updateWarehouseSchema.parse(payload);

    const existing = await this.repo.getWarehouseById(principal.companyId, id);
    if (!existing) {
      const err: any = new Error('Warehouse not found');
      err.statusCode = 404;
      throw err;
    }

    return this.repo.updateWarehouse(principal.companyId, id, parsed);
  }

  async listStockBalances(
    principal: AuthenticatedPrincipal,
    params?: { warehouseId?: string; search?: string; categoryId?: string; limit?: number; offset?: number }
  ) {
    this.assertPermission(principal, 'inventory.stock.read');
    return this.repo.listStockBalances(principal.companyId, params);
  }

  async listStockLedger(
    principal: AuthenticatedPrincipal,
    params?: { warehouseId?: string; itemId?: string; sourceType?: string; limit?: number; offset?: number }
  ) {
    this.assertPermission(principal, 'inventory.stock.read');
    return this.repo.listStockLedger(principal.companyId, params);
  }

  async postGoodsReceiptToInventory(principal: AuthenticatedPrincipal, payload: unknown) {
    this.assertPermission(principal, 'inventory.receipt.post');
    const parsed = postGrnToStockSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      const grnLine = await this.repo.getGoodsReceiptLineForPosting(
        principal.companyId,
        parsed.goodsReceiptLineId,
        tx
      );

      if (!grnLine) {
        const err: any = new Error('Goods receipt line not found.');
        err.statusCode = 404;
        throw err;
      }

      const acceptedQty = new Decimal(grnLine.acceptedQuantity);
      if (acceptedQty.lte(0)) {
        const err: any = new Error(
          `Cannot post GRN line #${grnLine.lineNumber} with 0 accepted quantity. Inspected accepted quantity is ${grnLine.acceptedQuantity}.`
        );
        err.statusCode = 400;
        throw err;
      }

      // Check unique posting key (sourceType, sourceId, warehouseId, direction)
      const existingEntry = await this.repo.findLedgerEntryBySource(
        principal.companyId,
        'goods_receipt_line',
        grnLine.lineId,
        parsed.warehouseId,
        'in',
        tx
      );

      if (existingEntry) {
        const err: any = new Error(
          `GRN line #${grnLine.lineNumber} has already been posted to inventory in entry ${existingEntry.entryNumber}.`
        );
        err.statusCode = 409;
        throw err;
      }

      const warehouse = await this.repo.getWarehouseById(principal.companyId, parsed.warehouseId, tx);
      if (!warehouse) {
        const err: any = new Error('Destination warehouse not found.');
        err.statusCode = 404;
        throw err;
      }

      // Lock current balance row
      await this.repo.ensureStockBalance(principal.companyId, parsed.warehouseId, grnLine.itemId, tx);
      const balance = await this.repo.getStockBalanceForUpdate(parsed.warehouseId, grnLine.itemId, tx);
      if (!balance) {
        throw new Error('Failed to lock stock balance row.');
      }

      const currentOnHand = new Decimal(balance.quantityOnHand);
      const newOnHand = currentOnHand.plus(acceptedQty);

      const entryNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        'STOCK_LEDGER_ENTRY',
        'SLE',
        tx
      );

      const ledgerEntry = await this.repo.createStockLedgerEntry(
        {
          companyId: principal.companyId,
          entryNumber,
          postingDate: new Date(),
          sourceType: 'goods_receipt_line',
          sourceId: grnLine.lineId,
          sourceReference: `GRN ${grnLine.grnNumber} (Line #${grnLine.lineNumber})`,
          warehouseId: parsed.warehouseId,
          itemId: grnLine.itemId,
          direction: 'in',
          quantity: acceptedQty.toFixed(4),
          balanceBefore: currentOnHand.toFixed(4),
          balanceAfter: newOnHand.toFixed(4),
          unitCost: grnLine.unitRate || null,
          notes: parsed.notes || `Challan: ${grnLine.vendorChallanNumber}`,
          postedByUserId: principal.userId,
        },
        tx
      );

      const updatedBalance = await this.repo.updateStockBalanceQuantities(
        balance.id,
        newOnHand.toFixed(4),
        balance.quantityReserved,
        tx
      );

      return {
        success: true,
        ledgerEntry,
        updatedBalance,
      };
    });
  }

  async createStockTransfer(principal: AuthenticatedPrincipal, payload: unknown) {
    this.assertPermission(principal, 'inventory.transfer.create');
    const parsed = createStockTransferSchema.parse(payload);

    if (parsed.sourceWarehouseId === parsed.destinationWarehouseId) {
      const err: any = new Error('Source and destination warehouses must be different.');
      err.statusCode = 400;
      throw err;
    }

    return this.repo.withTransaction(async (tx) => {
      const sourceWh = await this.repo.getWarehouseById(principal.companyId, parsed.sourceWarehouseId, tx);
      const destWh = await this.repo.getWarehouseById(principal.companyId, parsed.destinationWarehouseId, tx);

      if (!sourceWh || !destWh) {
        const err: any = new Error('Invalid source or destination warehouse.');
        err.statusCode = 404;
        throw err;
      }

      const transferNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        'STOCK_TRANSFER',
        'TRF',
        tx
      );

      const transfer = await this.repo.createStockTransfer(
        {
          companyId: principal.companyId,
          transferNumber,
          sourceWarehouseId: parsed.sourceWarehouseId,
          destinationWarehouseId: parsed.destinationWarehouseId,
          projectId: parsed.projectId,
          challanNumber: parsed.challanNumber,
          vehicleNumber: parsed.vehicleNumber,
          transporterName: parsed.transporterName,
          notes: parsed.notes,
        },
        tx
      );

      if (!transfer) {
        throw new Error('Failed to create stock transfer');
      }

      const lines = parsed.lines.map((l, index) => ({
        companyId: principal.companyId,
        transferId: transfer.id,
        lineNumber: index + 1,
        itemId: l.itemId,
        dispatchedQuantity: new Decimal(l.dispatchedQuantity).toFixed(4),
        notes: l.notes || null,
      }));

      await this.repo.createStockTransferLines(lines, tx);

      return this.repo.getStockTransferById(principal.companyId, transfer.id, tx);
    });
  }

  async dispatchStockTransfer(principal: AuthenticatedPrincipal, transferId: string) {
    this.assertPermission(principal, 'inventory.transfer.dispatch');

    return this.repo.withTransaction(async (tx) => {
      const transfer = await this.repo.getStockTransferById(principal.companyId, transferId, tx);
      if (!transfer) {
        const err: any = new Error('Stock transfer not found');
        err.statusCode = 404;
        throw err;
      }

      if (transfer.status !== 'draft') {
        const err: any = new Error(`Cannot dispatch transfer with status "${transfer.status}". Must be draft.`);
        err.statusCode = 409;
        throw err;
      }

      // Check stock availability and deduct from source warehouse
      for (const line of transfer.lines) {
        await this.repo.ensureStockBalance(principal.companyId, transfer.sourceWarehouseId, line.itemId, tx);
        const balance = await this.repo.getStockBalanceForUpdate(transfer.sourceWarehouseId, line.itemId, tx);
        if (!balance) {
          throw new Error(`Failed to lock source balance for item ${line.itemCode}`);
        }

        const onHand = new Decimal(balance.quantityOnHand);
        const reserved = new Decimal(balance.quantityReserved);
        const available = onHand.minus(reserved);
        const dispatchQty = new Decimal(line.dispatchedQuantity);

        if (available.lt(dispatchQty)) {
          const err: any = new Error(
            `Insufficient unreserved stock for item "${line.itemName}" (${line.itemCode}) at source warehouse. Available: ${available.toFixed(4)}, Required: ${dispatchQty.toFixed(4)}`
          );
          err.statusCode = 409;
          throw err;
        }

        const newOnHand = onHand.minus(dispatchQty);

        const entryNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          'STOCK_LEDGER_ENTRY',
          'SLE',
          tx
        );

        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber,
            postingDate: new Date(),
            sourceType: 'transfer_dispatch',
            sourceId: transfer.id,
            sourceReference: `Transfer ${transfer.transferNumber} (Challan: ${transfer.challanNumber || 'N/A'})`,
            warehouseId: transfer.sourceWarehouseId,
            itemId: line.itemId,
            direction: 'out',
            quantity: dispatchQty.toFixed(4),
            balanceBefore: onHand.toFixed(4),
            balanceAfter: newOnHand.toFixed(4),
            notes: line.notes || `Dispatched to ${transfer.destinationWarehouseName}`,
            postedByUserId: principal.userId,
          },
          tx
        );

        await this.repo.updateStockBalanceQuantities(
          balance.id,
          newOnHand.toFixed(4),
          balance.quantityReserved,
          tx
        );
      }

      await this.repo.updateStockTransferStatus(
        transfer.id,
        {
          status: 'dispatched',
          dispatchedAt: new Date(),
          dispatchedByUserId: principal.userId,
        },
        tx
      );

      return this.repo.getStockTransferById(principal.companyId, transfer.id, tx);
    });
  }

  async receiveStockTransfer(principal: AuthenticatedPrincipal, transferId: string, payload: unknown) {
    this.assertPermission(principal, 'inventory.transfer.receive');
    const parsed = receiveStockTransferSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      const transfer = await this.repo.getStockTransferById(principal.companyId, transferId, tx);
      if (!transfer) {
        const err: any = new Error('Stock transfer not found');
        err.statusCode = 404;
        throw err;
      }

      if (transfer.status !== 'dispatched') {
        const err: any = new Error(`Cannot receive transfer with status "${transfer.status}". Must be dispatched.`);
        err.statusCode = 409;
        throw err;
      }

      for (const lineInput of parsed.lines) {
        const line = transfer.lines.find((l) => l.id === lineInput.transferLineId);
        if (!line) {
          const err: any = new Error(`Transfer line ${lineInput.transferLineId} not found on this transfer.`);
          err.statusCode = 404;
          throw err;
        }

        const recvQty = new Decimal(lineInput.receivedQuantity);
        const dispQty = new Decimal(line.dispatchedQuantity);

        if (recvQty.gt(dispQty)) {
          const err: any = new Error(
            `Received quantity (${recvQty.toFixed(4)}) cannot exceed dispatched quantity (${dispQty.toFixed(4)}) for item ${line.itemCode}.`
          );
          err.statusCode = 400;
          throw err;
        }

        await this.repo.updateStockTransferLineReceived(line.id, recvQty.toFixed(4), tx);

        if (recvQty.gt(0)) {
          await this.repo.ensureStockBalance(principal.companyId, transfer.destinationWarehouseId, line.itemId, tx);
          const balance = await this.repo.getStockBalanceForUpdate(transfer.destinationWarehouseId, line.itemId, tx);
          if (!balance) {
            throw new Error(`Failed to lock destination balance for item ${line.itemCode}`);
          }

          const currentOnHand = new Decimal(balance.quantityOnHand);
          const newOnHand = currentOnHand.plus(recvQty);

          const entryNumber = await this.repo.allocateDocumentNumber(
            principal.companyId,
            'STOCK_LEDGER_ENTRY',
            'SLE',
            tx
          );

          await this.repo.createStockLedgerEntry(
            {
              companyId: principal.companyId,
              entryNumber,
              postingDate: new Date(),
              sourceType: 'transfer_receipt',
              sourceId: transfer.id,
              sourceReference: `Transfer ${transfer.transferNumber} received`,
              warehouseId: transfer.destinationWarehouseId,
              itemId: line.itemId,
              direction: 'in',
              quantity: recvQty.toFixed(4),
              balanceBefore: currentOnHand.toFixed(4),
              balanceAfter: newOnHand.toFixed(4),
              notes: parsed.notes || `Received from ${transfer.sourceWarehouseName}`,
              postedByUserId: principal.userId,
            },
            tx
          );

          await this.repo.updateStockBalanceQuantities(
            balance.id,
            newOnHand.toFixed(4),
            balance.quantityReserved,
            tx
          );
        }
      }

      await this.repo.updateStockTransferStatus(
        transfer.id,
        {
          status: 'received',
          receivedAt: new Date(),
          receivedByUserId: principal.userId,
        },
        tx
      );

      return this.repo.getStockTransferById(principal.companyId, transfer.id, tx);
    });
  }

  async listStockTransfers(principal: AuthenticatedPrincipal, params?: { status?: string }) {
    this.assertPermission(principal, 'inventory.stock.read');
    return this.repo.listStockTransfers(principal.companyId, params);
  }

  async getStockTransfer(principal: AuthenticatedPrincipal, id: string) {
    this.assertPermission(principal, 'inventory.stock.read');
    const transfer = await this.repo.getStockTransferById(principal.companyId, id);
    if (!transfer) {
      const err: any = new Error('Stock transfer not found');
      err.statusCode = 404;
      throw err;
    }
    return transfer;
  }

  async createStockReservation(principal: AuthenticatedPrincipal, payload: unknown) {
    this.assertPermission(principal, 'inventory.reservation.manage');
    const parsed = createStockReservationSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      await this.repo.ensureStockBalance(principal.companyId, parsed.warehouseId, parsed.itemId, tx);
      const balance = await this.repo.getStockBalanceForUpdate(parsed.warehouseId, parsed.itemId, tx);
      if (!balance) {
        throw new Error('Failed to lock stock balance row.');
      }

      const onHand = new Decimal(balance.quantityOnHand);
      const currentReserved = new Decimal(balance.quantityReserved);
      const available = onHand.minus(currentReserved);
      const requestedQty = new Decimal(parsed.quantityReserved);

      if (available.lt(requestedQty)) {
        const err: any = new Error(
          `Insufficient available stock to reserve. Available: ${available.toFixed(4)}, Requested: ${requestedQty.toFixed(4)}`
        );
        err.statusCode = 409;
        throw err;
      }

      const newReserved = currentReserved.plus(requestedQty);
      await this.repo.updateStockBalanceQuantities(
        balance.id,
        balance.quantityOnHand,
        newReserved.toFixed(4),
        tx
      );

      const reservationNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        'STOCK_RESERVATION',
        'RES',
        tx
      );

      return this.repo.createStockReservation(
        {
          companyId: principal.companyId,
          reservationNumber,
          projectId: parsed.projectId,
          boqLineId: parsed.boqLineId,
          warehouseId: parsed.warehouseId,
          itemId: parsed.itemId,
          quantityReserved: requestedQty.toFixed(4),
          reservedByUserId: principal.userId,
          notes: parsed.notes,
        },
        tx
      );
    });
  }

  async releaseStockReservation(principal: AuthenticatedPrincipal, id: string) {
    this.assertPermission(principal, 'inventory.reservation.manage');

    return this.repo.withTransaction(async (tx) => {
      const reservation = await this.repo.getStockReservationById(principal.companyId, id, tx);
      if (!reservation) {
        const err: any = new Error('Reservation not found');
        err.statusCode = 404;
        throw err;
      }

      if (reservation.status !== 'active') {
        const err: any = new Error(`Cannot release reservation with status "${reservation.status}". Must be active.`);
        err.statusCode = 409;
        throw err;
      }

      const balance = await this.repo.getStockBalanceForUpdate(reservation.warehouseId, reservation.itemId, tx);
      if (balance) {
        const currentReserved = new Decimal(balance.quantityReserved);
        const qtyToRelease = new Decimal(reservation.quantityReserved).minus(
          new Decimal(reservation.quantityIssued)
        );
        const newReserved = qtyToRelease.gt(currentReserved)
          ? new Decimal(0)
          : currentReserved.minus(qtyToRelease);

        await this.repo.updateStockBalanceQuantities(
          balance.id,
          balance.quantityOnHand,
          newReserved.toFixed(4),
          tx
        );
      }

      return this.repo.updateStockReservationStatus(reservation.id, 'released', tx);
    });
  }

  async listStockReservations(principal: AuthenticatedPrincipal, params?: { projectId?: string; status?: string }) {
    this.assertPermission(principal, 'inventory.stock.read');
    return this.repo.listStockReservations(principal.companyId, params);
  }

  async createAndPostStockDocument(principal: AuthenticatedPrincipal, payload: unknown) {
    const parsed = createStockDocumentSchema.parse(payload);

    if (parsed.documentType === 'opening_balance' || parsed.documentType === 'adjustment') {
      this.assertPermission(principal, 'inventory.adjustment.manage');
    } else if (parsed.documentType === 'site_issue') {
      this.assertPermission(principal, 'inventory.site_issue.create');
    } else if (parsed.documentType === 'site_return') {
      this.assertPermission(principal, 'inventory.site_return.create');
    }

    return this.repo.withTransaction(async (tx) => {
      const docNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        'STOCK_DOCUMENT',
        'STK-DOC',
        tx
      );

      const targetWarehouseId =
        parsed.documentType === 'site_issue' ? parsed.sourceWarehouseId : parsed.destinationWarehouseId;

      if (!targetWarehouseId) {
        const err: any = new Error(`Warehouse is required for ${parsed.documentType}.`);
        err.statusCode = 400;
        throw err;
      }

      const linesToInsert = parsed.lines.map((l, idx) => ({
        companyId: principal.companyId,
        lineNumber: idx + 1,
        itemId: l.itemId,
        quantity: new Decimal(l.quantity).toFixed(4),
        unitRate: l.unitRate ? new Decimal(l.unitRate).toFixed(2) : null,
        notes: l.notes,
      }));

      const { header } = await this.repo.createStockDocument(
        {
          companyId: principal.companyId,
          documentNumber: docNumber,
          documentType: parsed.documentType,
          sourceWarehouseId: parsed.sourceWarehouseId,
          destinationWarehouseId: parsed.destinationWarehouseId,
          projectId: parsed.projectId,
          referenceNumber: parsed.referenceNumber,
          documentDate: parsed.documentDate,
          notes: parsed.notes,
          postedAt: new Date(),
          postedByUserId: principal.userId,
          status: 'posted',
        },
        linesToInsert,
        tx
      );

      for (const line of linesToInsert) {
        await this.repo.ensureStockBalance(principal.companyId, targetWarehouseId, line.itemId, tx);
        const balance = await this.repo.getStockBalanceForUpdate(targetWarehouseId, line.itemId, tx);
        if (!balance) throw new Error('Failed to lock stock balance row.');

        const currentOnHand = new Decimal(balance.quantityOnHand);
        const lineQty = new Decimal(line.quantity);

        let newOnHand: Decimal;
        let direction: 'in' | 'out';

        if (parsed.documentType === 'site_issue') {
          direction = 'out';
          const reserved = new Decimal(balance.quantityReserved);
          const available = currentOnHand.minus(reserved);
          if (available.lt(lineQty)) {
            const err: any = new Error(
              `Insufficient stock to issue. Available: ${available.toFixed(4)}, Required: ${lineQty.toFixed(4)}`
            );
            err.statusCode = 409;
            throw err;
          }
          newOnHand = currentOnHand.minus(lineQty);
        } else {
          // opening_balance, site_return, adjustment
          direction = 'in';
          newOnHand = currentOnHand.plus(lineQty);
        }

        const entryNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          'STOCK_LEDGER_ENTRY',
          'SLE',
          tx
        );

        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber,
            postingDate: new Date(),
            sourceType: parsed.documentType as any,
            sourceId: header.id,
            sourceReference: `${docNumber} (${parsed.documentType})`,
            warehouseId: targetWarehouseId,
            itemId: line.itemId,
            direction,
            quantity: lineQty.toFixed(4),
            balanceBefore: currentOnHand.toFixed(4),
            balanceAfter: newOnHand.toFixed(4),
            unitCost: line.unitRate || null,
            notes: line.notes || parsed.notes,
            postedByUserId: principal.userId,
          },
          tx
        );

        await this.repo.updateStockBalanceQuantities(
          balance.id,
          newOnHand.toFixed(4),
          balance.quantityReserved,
          tx
        );
      }

      return header;
    });
  }

  async listStockDocuments(principal: AuthenticatedPrincipal, params?: { documentType?: string }) {
    this.assertPermission(principal, 'inventory.stock.read');
    return this.repo.listStockDocuments(principal.companyId, params);
  }
}
