import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Decimal } from "decimal.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/appError.js";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { hasPermission } from "../auth/auth.middleware.js";
import {
  InventoryRepository,
  type StockLedgerSourceType,
  type TxOrDb,
} from "./inventory.repository.js";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  postGrnToStockSchema,
  createStockTransferSchema,
  receiveStockTransferSchema,
  createStockReservationSchema,
  createStockDocumentSchema,
  upsertThresholdSchema,
  createReplenishmentRequestSchema,
  createMirSchema,
  dispatchMirSchema,
  verifyPodSchema,
  resolveDiscrepancySchema,
  createSiteReturnSchema,
} from "./inventory.schemas.js";
import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import {
  warehouseItemThresholds,
  storeReplenishmentRequests,
  materialIssueRequests,
  materialIssueRequestLines,
  deliveryChallans,
  deliveryChallanLines,
  siteReturns,
  siteReturnLines,
  outboxJobs,
  stockLocations,
  stockReservations,
  items,
  itemBrandOfferings,
  brands,
  units,
  warehouses,
  projects,
  sites,
  companies,
  projectMembers,
  users,
  userRoleAssignments,
  roles,
  purchaseOrders,
  purchaseOrderLines,
  quotations,
  quotationRevisions,
  quotationLines,
  boqLines,
} from "../../infrastructure/database/schema/index.js";
import { createNotificationRepository } from "../notifications/notification.repository.js";
import { createAuthRepository } from "../auth/auth.repository.js";
import { isAdministrator } from "../../core/security/administrator.js";
import { renderDeliveryChallanPdf } from "../../infrastructure/documents/deliveryChallan.pdf.js";
import {
  ensureUploadRoot,
  removePrivateFile,
  resolvePrivateFile,
} from "../../infrastructure/storage/localFileStorage.js";

function isQueryableTx(tx: unknown): tx is TxOrDb {
  return Boolean(
    tx && typeof (tx as { select?: unknown }).select === "function",
  );
}

export class InventoryService {
  constructor(private readonly repo: InventoryRepository) {}

  private assertPermission(
    principal: AuthenticatedPrincipal,
    permission: string,
  ) {
    if (
      hasPermission(principal, "system.access.all") ||
      hasPermission(principal, permission)
    ) {
      return;
    }
    throw new ForbiddenError(
      `Forbidden: missing required permission ${permission}`,
    );
  }

  private async resolveMainLocationId(
    companyId: string,
    warehouseId: string,
    tx: TxOrDb,
  ): Promise<string> {
    if (typeof this.repo.ensureWarehouseSystemLocations !== "function") {
      return warehouseId;
    }
    const { mainLocation } = await this.repo.ensureWarehouseSystemLocations(
      companyId,
      warehouseId,
      tx,
    );
    return mainLocation.id;
  }

  async listWarehouses(
    principal: AuthenticatedPrincipal,
    params?: { includeInactive?: boolean },
  ) {
    this.assertPermission(principal, "inventory.warehouse.read");
    return this.repo.listWarehouses(principal.companyId, params);
  }

  async createWarehouse(principal: AuthenticatedPrincipal, payload: unknown) {
    this.assertPermission(principal, "inventory.warehouse.manage");
    const parsed = createWarehouseSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      const existing = await this.repo.getWarehouseByCode(
        principal.companyId,
        parsed.code,
        tx,
      );
      if (existing) {
        throw new ConflictError(
          `Warehouse with code "${parsed.code}" already exists.`,
        );
      }

      return this.repo.createWarehouse(
        {
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
        },
        tx,
      );
    });
  }

  async updateWarehouse(
    principal: AuthenticatedPrincipal,
    id: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, "inventory.warehouse.manage");
    const parsed = updateWarehouseSchema.parse(payload);

    const existing = await this.repo.getWarehouseById(principal.companyId, id);
    if (!existing) {
      throw new NotFoundError("Warehouse not found.");
    }

    return this.repo.updateWarehouse(principal.companyId, id, parsed);
  }

  async listStockBalances(
    principal: AuthenticatedPrincipal,
    params?: {
      warehouseId?: string;
      search?: string;
      categoryId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    return this.repo.listStockBalances(principal.companyId, params);
  }

  async listStockLedger(
    principal: AuthenticatedPrincipal,
    params?: {
      warehouseId?: string;
      itemId?: string;
      sourceType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    return this.repo.listStockLedger(principal.companyId, params);
  }

  async postGoodsReceiptToInventory(
    principal: AuthenticatedPrincipal,
    payload: unknown,
  ) {
    this.assertPermission(principal, "inventory.receipt.post");
    const parsed = postGrnToStockSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      const grnLine = await this.repo.getGoodsReceiptLineForPosting(
        principal.companyId,
        parsed.goodsReceiptLineId,
        tx,
      );

      if (!grnLine) {
        throw new NotFoundError("Goods receipt line not found.");
      }

      const acceptedQty = new Decimal(grnLine.acceptedQuantity);
      if (acceptedQty.lte(0)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Cannot post GRN line #${grnLine.lineNumber} with 0 accepted quantity. Inspected accepted quantity is ${grnLine.acceptedQuantity}.`,
          400,
        );
      }

      const brandOfferingId = grnLine.brandOfferingId ?? null;

      // Check unique posting key (companyId, sourceType, sourceId, warehouseId, itemId, brandOfferingId, direction)
      const existingEntry = await this.repo.findLedgerEntryBySource(
        principal.companyId,
        "goods_receipt_line",
        grnLine.lineId,
        parsed.warehouseId,
        "in",
        tx,
        { itemId: grnLine.itemId, brandOfferingId },
      );

      if (existingEntry) {
        throw new ConflictError(
          `GRN line #${grnLine.lineNumber} has already been posted to inventory in entry ${existingEntry.entryNumber}.`,
        );
      }

      const warehouse = await this.repo.getWarehouseById(
        principal.companyId,
        parsed.warehouseId,
        tx,
      );
      if (!warehouse) {
        throw new NotFoundError("Destination warehouse not found.");
      }

      const isDirectToSite =
        grnLine.destinationType === "direct_to_site" &&
        Boolean(grnLine.poProjectId);
      const targetLocationId = isDirectToSite
        ? (
            await this.repo.ensureProjectSiteLocation(
              principal.companyId,
              parsed.warehouseId,
              grnLine.poProjectId!,
              tx,
            )
          ).id
        : await this.resolveMainLocationId(
            principal.companyId,
            parsed.warehouseId,
            tx,
          );

      // Lock current balance row
      await this.repo.ensureStockBalance(
        principal.companyId,
        parsed.warehouseId,
        grnLine.itemId,
        tx,
        {
          locationId: targetLocationId,
          brandOfferingId,
        },
      );
      const balance = await this.repo.getStockBalanceForUpdate(
        parsed.warehouseId,
        grnLine.itemId,
        tx,
        {
          locationId: targetLocationId,
          brandOfferingId,
        },
      );
      if (!balance) {
        throw new Error("Failed to lock stock balance row.");
      }

      const currentOnHand = new Decimal(balance.quantityOnHand);
      const newOnHand = currentOnHand.plus(acceptedQty);

      const entryNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "STOCK_LEDGER_ENTRY",
        "SLE",
        tx,
      );

      const ledgerEntry = await this.repo.createStockLedgerEntry(
        {
          companyId: principal.companyId,
          entryNumber,
          postingDate: new Date(),
          sourceType: "goods_receipt_line",
          sourceId: grnLine.lineId,
          sourceReference: `GRN ${grnLine.grnNumber} (Line #${grnLine.lineNumber})`,
          warehouseId: parsed.warehouseId,
          locationId: targetLocationId,
          itemId: grnLine.itemId,
          brandOfferingId,
          direction: "in",
          quantity: acceptedQty.toFixed(4),
          balanceBefore: currentOnHand.toFixed(4),
          balanceAfter: newOnHand.toFixed(4),
          unitCost: grnLine.unitRate || null,
          notes: parsed.notes || `Challan: ${grnLine.vendorChallanNumber}`,
          postedByUserId: principal.userId,
        },
        tx,
      );

      let nextReserved = new Decimal(balance.quantityReserved);

      if (isQueryableTx(tx) && grnLine.poLineId) {
        const projAllocTotal = new Decimal(grnLine.projectAllocationQty ?? "0");
        const allocReceivedSoFar = new Decimal(
          grnLine.allocatedReceivedQty ?? "0",
        );
        const storeReplenTotal = new Decimal(
          grnLine.storeReplenishmentQty ?? "0",
        );
        const storeReceivedSoFar = new Decimal(grnLine.storeReceivedQty ?? "0");

        const remainingAlloc = Decimal.max(
          0,
          projAllocTotal.minus(allocReceivedSoFar),
        );
        const allocDelta = Decimal.min(acceptedQty, remainingAlloc);
        const storeDelta = Decimal.min(
          acceptedQty.minus(allocDelta),
          Decimal.max(0, storeReplenTotal.minus(storeReceivedSoFar)),
        );

        await tx
          .update(purchaseOrderLines)
          .set({
            allocatedReceivedQty: allocReceivedSoFar
              .plus(allocDelta)
              .toFixed(4),
            storeReceivedQty: storeReceivedSoFar.plus(storeDelta).toFixed(4),
          })
          .where(eq(purchaseOrderLines.id, grnLine.poLineId));

        if (!isDirectToSite && allocDelta.gt(0) && grnLine.poProjectId) {
          const reservationNumber = await this.repo.allocateDocumentNumber(
            principal.companyId,
            "STOCK_RESERVATION",
            "RES",
            tx,
          );
          await this.repo.createStockReservation(
            {
              companyId: principal.companyId,
              reservationNumber,
              projectId: grnLine.poProjectId,
              warehouseId: parsed.warehouseId,
              itemId: grnLine.itemId,
              brandOfferingId,
              quantityReserved: allocDelta.toFixed(4),
              reservedByUserId: principal.userId,
              notes: `Auto-reserved from ${grnLine.grnNumber} (${grnLine.poNumber ?? "PO"})`,
            },
            tx,
          );
          nextReserved = nextReserved.plus(allocDelta);
        }
      }

      const updatedBalance = await this.repo.updateStockBalanceQuantities(
        balance.id,
        newOnHand.toFixed(4),
        nextReserved.toFixed(4),
        tx,
      );

      if (isQueryableTx(tx)) {
        await this.evaluateLowStockThresholds(
          tx,
          principal.companyId,
          parsed.warehouseId,
          [{ itemId: grnLine.itemId, brandOfferingId }],
        );
      }

      return {
        success: true,
        ledgerEntry,
        updatedBalance,
      };
    });
  }

  async createStockTransfer(
    principal: AuthenticatedPrincipal,
    payload: unknown,
  ) {
    this.assertPermission(principal, "inventory.transfer.create");
    const parsed = createStockTransferSchema.parse(payload);

    if (parsed.sourceWarehouseId === parsed.destinationWarehouseId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Source and destination warehouses must be different.",
        400,
      );
    }

    return this.repo.withTransaction(async (tx) => {
      const sourceWh = await this.repo.getWarehouseById(
        principal.companyId,
        parsed.sourceWarehouseId,
        tx,
      );
      const destWh = await this.repo.getWarehouseById(
        principal.companyId,
        parsed.destinationWarehouseId,
        tx,
      );

      if (!sourceWh || !destWh) {
        throw new NotFoundError("Invalid source or destination warehouse.");
      }

      const transferNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "STOCK_TRANSFER",
        "TRF",
        tx,
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
        tx,
      );

      if (!transfer) {
        throw new ConflictError("Failed to create stock transfer.");
      }

      const lines = parsed.lines.map((l, index) => ({
        companyId: principal.companyId,
        transferId: transfer.id,
        lineNumber: index + 1,
        itemId: l.itemId,
        brandOfferingId: l.brandOfferingId ?? null,
        dispatchedQuantity: new Decimal(l.dispatchedQuantity).toFixed(4),
        notes: l.notes || null,
      }));

      await this.repo.createStockTransferLines(lines, tx);

      return this.repo.getStockTransferById(
        principal.companyId,
        transfer.id,
        tx,
      );
    });
  }

  async dispatchStockTransfer(
    principal: AuthenticatedPrincipal,
    transferId: string,
  ) {
    this.assertPermission(principal, "inventory.transfer.dispatch");

    return this.repo.withTransaction(async (tx) => {
      const transfer = await this.repo.getStockTransferById(
        principal.companyId,
        transferId,
        tx,
      );
      if (!transfer) {
        throw new NotFoundError("Stock transfer not found.");
      }

      if (transfer.status !== "draft") {
        throw new ConflictError(
          `Cannot dispatch transfer with status "${transfer.status}". Must be draft.`,
        );
      }

      const sourceMainLocationId = await this.resolveMainLocationId(
        principal.companyId,
        transfer.sourceWarehouseId,
        tx,
      );

      // Check stock availability and deduct from source warehouse
      for (const line of transfer.lines) {
        const brandOfferingId = line.brandOfferingId ?? null;
        await this.repo.ensureStockBalance(
          principal.companyId,
          transfer.sourceWarehouseId,
          line.itemId,
          tx,
          {
            locationId: sourceMainLocationId,
            brandOfferingId,
          },
        );
        const balance = await this.repo.getStockBalanceForUpdate(
          transfer.sourceWarehouseId,
          line.itemId,
          tx,
          {
            locationId: sourceMainLocationId,
            brandOfferingId,
          },
        );
        if (!balance) {
          throw new Error(
            `Failed to lock source balance for item ${line.itemCode}`,
          );
        }

        const onHand = new Decimal(balance.quantityOnHand);
        const reserved = new Decimal(balance.quantityReserved);
        const available = onHand.minus(reserved);
        const dispatchQty = new Decimal(line.dispatchedQuantity);

        if (available.lt(dispatchQty)) {
          throw new ConflictError(
            `Insufficient unreserved stock for item "${line.itemName}" (${line.itemCode}) at source warehouse. Available: ${available.toFixed(4)}, Required: ${dispatchQty.toFixed(4)}`,
          );
        }

        const newOnHand = onHand.minus(dispatchQty);

        const entryNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );

        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber,
            postingDate: new Date(),
            sourceType: "transfer_dispatch",
            sourceId: transfer.id,
            sourceReference: `Transfer ${transfer.transferNumber} (Challan: ${transfer.challanNumber || "N/A"})`,
            warehouseId: transfer.sourceWarehouseId,
            locationId: sourceMainLocationId,
            itemId: line.itemId,
            brandOfferingId,
            direction: "out",
            quantity: dispatchQty.toFixed(4),
            balanceBefore: onHand.toFixed(4),
            balanceAfter: newOnHand.toFixed(4),
            notes:
              line.notes ||
              `Dispatched to ${transfer.destinationWarehouseName}`,
            postedByUserId: principal.userId,
          },
          tx,
        );

        await this.repo.updateStockBalanceQuantities(
          balance.id,
          newOnHand.toFixed(4),
          balance.quantityReserved,
          tx,
        );
      }

      await this.repo.updateStockTransferStatus(
        transfer.id,
        {
          status: "dispatched",
          dispatchedAt: new Date(),
          dispatchedByUserId: principal.userId,
        },
        tx,
      );

      if (isQueryableTx(tx)) {
        await this.evaluateLowStockThresholds(
          tx,
          principal.companyId,
          transfer.sourceWarehouseId,
          transfer.lines.map((l) => ({
            itemId: l.itemId,
            brandOfferingId: l.brandOfferingId ?? null,
          })),
        );
      }

      return this.repo.getStockTransferById(
        principal.companyId,
        transfer.id,
        tx,
      );
    });
  }

  async receiveStockTransfer(
    principal: AuthenticatedPrincipal,
    transferId: string,
    payload: unknown,
  ) {
    this.assertPermission(principal, "inventory.transfer.receive");
    const parsed = receiveStockTransferSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      const transfer = await this.repo.getStockTransferById(
        principal.companyId,
        transferId,
        tx,
      );
      if (!transfer) {
        throw new NotFoundError("Stock transfer not found.");
      }

      if (transfer.status !== "dispatched") {
        throw new ConflictError(
          `Cannot receive transfer with status "${transfer.status}". Must be dispatched.`,
        );
      }

      const destMainLocationId = await this.resolveMainLocationId(
        principal.companyId,
        transfer.destinationWarehouseId,
        tx,
      );

      for (const lineInput of parsed.lines) {
        const line = transfer.lines.find(
          (l) => l.id === lineInput.transferLineId,
        );
        if (!line) {
          throw new NotFoundError(
            `Transfer line ${lineInput.transferLineId} not found on this transfer.`,
          );
        }

        const recvQty = new Decimal(lineInput.receivedQuantity);
        const dispQty = new Decimal(line.dispatchedQuantity);

        if (recvQty.gt(dispQty)) {
          throw new AppError(
            "VALIDATION_ERROR",
            `Received quantity (${recvQty.toFixed(4)}) cannot exceed dispatched quantity (${dispQty.toFixed(4)}) for item ${line.itemCode}.`,
            400,
          );
        }

        await this.repo.updateStockTransferLineReceived(
          line.id,
          recvQty.toFixed(4),
          tx,
        );

        if (recvQty.gt(0)) {
          const brandOfferingId = line.brandOfferingId ?? null;
          await this.repo.ensureStockBalance(
            principal.companyId,
            transfer.destinationWarehouseId,
            line.itemId,
            tx,
            {
              locationId: destMainLocationId,
              brandOfferingId,
            },
          );
          const balance = await this.repo.getStockBalanceForUpdate(
            transfer.destinationWarehouseId,
            line.itemId,
            tx,
            {
              locationId: destMainLocationId,
              brandOfferingId,
            },
          );
          if (!balance) {
            throw new Error(
              `Failed to lock destination balance for item ${line.itemCode}`,
            );
          }

          const currentOnHand = new Decimal(balance.quantityOnHand);
          const newOnHand = currentOnHand.plus(recvQty);

          const entryNumber = await this.repo.allocateDocumentNumber(
            principal.companyId,
            "STOCK_LEDGER_ENTRY",
            "SLE",
            tx,
          );

          await this.repo.createStockLedgerEntry(
            {
              companyId: principal.companyId,
              entryNumber,
              postingDate: new Date(),
              sourceType: "transfer_receipt",
              sourceId: transfer.id,
              sourceReference: `Transfer ${transfer.transferNumber} received`,
              warehouseId: transfer.destinationWarehouseId,
              locationId: destMainLocationId,
              itemId: line.itemId,
              brandOfferingId,
              direction: "in",
              quantity: recvQty.toFixed(4),
              balanceBefore: currentOnHand.toFixed(4),
              balanceAfter: newOnHand.toFixed(4),
              notes:
                parsed.notes || `Received from ${transfer.sourceWarehouseName}`,
              postedByUserId: principal.userId,
            },
            tx,
          );

          await this.repo.updateStockBalanceQuantities(
            balance.id,
            newOnHand.toFixed(4),
            balance.quantityReserved,
            tx,
          );
        }
      }

      await this.repo.updateStockTransferStatus(
        transfer.id,
        {
          status: "received",
          receivedAt: new Date(),
          receivedByUserId: principal.userId,
        },
        tx,
      );

      if (isQueryableTx(tx)) {
        await this.evaluateLowStockThresholds(
          tx,
          principal.companyId,
          transfer.destinationWarehouseId,
          transfer.lines.map((l) => ({
            itemId: l.itemId,
            brandOfferingId: l.brandOfferingId ?? null,
          })),
        );
      }

      return this.repo.getStockTransferById(
        principal.companyId,
        transfer.id,
        tx,
      );
    });
  }

  async listStockTransfers(
    principal: AuthenticatedPrincipal,
    params?: { status?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    return this.repo.listStockTransfers(principal.companyId, params);
  }

  async getStockTransfer(principal: AuthenticatedPrincipal, id: string) {
    this.assertPermission(principal, "inventory.stock.read");
    const transfer = await this.repo.getStockTransferById(
      principal.companyId,
      id,
    );
    if (!transfer) {
      throw new NotFoundError("Stock transfer not found.");
    }
    return transfer;
  }

  async createStockReservation(
    principal: AuthenticatedPrincipal,
    payload: unknown,
  ) {
    this.assertPermission(principal, "inventory.reservation.manage");
    const parsed = createStockReservationSchema.parse(payload);

    return this.repo.withTransaction(async (tx) => {
      const mainLocationId = await this.resolveMainLocationId(
        principal.companyId,
        parsed.warehouseId,
        tx,
      );
      const brandOfferingId = parsed.brandOfferingId ?? null;

      await this.repo.ensureStockBalance(
        principal.companyId,
        parsed.warehouseId,
        parsed.itemId,
        tx,
        {
          locationId: mainLocationId,
          brandOfferingId,
        },
      );
      const balance = await this.repo.getStockBalanceForUpdate(
        parsed.warehouseId,
        parsed.itemId,
        tx,
        {
          locationId: mainLocationId,
          brandOfferingId,
        },
      );
      if (!balance) {
        throw new Error("Failed to lock stock balance row.");
      }

      const onHand = new Decimal(balance.quantityOnHand);
      const currentReserved = new Decimal(balance.quantityReserved);
      const available = onHand.minus(currentReserved);
      const requestedQty = new Decimal(parsed.quantityReserved);

      if (available.lt(requestedQty)) {
        throw new ConflictError(
          `Insufficient available stock to reserve. Available: ${available.toFixed(4)}, Requested: ${requestedQty.toFixed(4)}`,
        );
      }

      const newReserved = currentReserved.plus(requestedQty);
      await this.repo.updateStockBalanceQuantities(
        balance.id,
        balance.quantityOnHand,
        newReserved.toFixed(4),
        tx,
      );

      const reservationNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "STOCK_RESERVATION",
        "RES",
        tx,
      );

      const reservation = await this.repo.createStockReservation(
        {
          companyId: principal.companyId,
          reservationNumber,
          projectId: parsed.projectId,
          boqLineId: parsed.boqLineId,
          warehouseId: parsed.warehouseId,
          itemId: parsed.itemId,
          brandOfferingId,
          quantityReserved: requestedQty.toFixed(4),
          reservedByUserId: principal.userId,
          notes: parsed.notes,
        },
        tx,
      );

      if (!reservation)
        throw new ConflictError("Failed to create stock reservation.");

      if (isQueryableTx(tx)) {
        await this.evaluateLowStockThresholds(
          tx,
          principal.companyId,
          parsed.warehouseId,
          [{ itemId: parsed.itemId, brandOfferingId }],
        );
      }

      return reservation;
    });
  }

  async releaseStockReservation(principal: AuthenticatedPrincipal, id: string) {
    this.assertPermission(principal, "inventory.reservation.manage");

    return this.repo.withTransaction(async (tx) => {
      const reservation = await this.repo.getStockReservationById(
        principal.companyId,
        id,
        tx,
      );
      if (!reservation) {
        throw new NotFoundError("Reservation not found");
      }

      if (reservation.status !== "active") {
        throw new ConflictError(
          `Cannot release reservation with status "${reservation.status}". Must be active.`,
        );
      }

      const mainLocationId = await this.resolveMainLocationId(
        principal.companyId,
        reservation.warehouseId,
        tx,
      );
      const balance = await this.repo.getStockBalanceForUpdate(
        reservation.warehouseId,
        reservation.itemId,
        tx,
        {
          locationId: mainLocationId,
          brandOfferingId: reservation.brandOfferingId ?? null,
        },
      );
      if (balance) {
        const currentReserved = new Decimal(balance.quantityReserved);
        const qtyToRelease = new Decimal(reservation.quantityReserved).minus(
          new Decimal(reservation.quantityIssued),
        );
        const newReserved = qtyToRelease.gt(currentReserved)
          ? new Decimal(0)
          : currentReserved.minus(qtyToRelease);

        await this.repo.updateStockBalanceQuantities(
          balance.id,
          balance.quantityOnHand,
          newReserved.toFixed(4),
          tx,
        );
      }

      const released = await this.repo.updateStockReservationStatus(
        reservation.id,
        "released",
        tx,
      );
      if (isQueryableTx(tx)) {
        await this.evaluateLowStockThresholds(
          tx,
          principal.companyId,
          reservation.warehouseId,
          [
            {
              itemId: reservation.itemId,
              brandOfferingId: reservation.brandOfferingId ?? null,
            },
          ],
        );
      }
      return released;
    });
  }

  async listStockReservations(
    principal: AuthenticatedPrincipal,
    params?: { projectId?: string; status?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    return this.repo.listStockReservations(principal.companyId, params);
  }

  async createAndPostStockDocument(
    principal: AuthenticatedPrincipal,
    payload: unknown,
  ) {
    const parsed = createStockDocumentSchema.parse(payload);

    if (
      parsed.documentType === "opening_balance" ||
      parsed.documentType === "adjustment"
    ) {
      this.assertPermission(principal, "inventory.adjustment.manage");
    } else if (parsed.documentType === "site_issue") {
      this.assertPermission(principal, "inventory.site_issue.create");
    } else if (parsed.documentType === "site_return") {
      this.assertPermission(principal, "inventory.site_return.create");
    }

    return this.repo.withTransaction(async (tx) => {
      const docNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "STOCK_DOCUMENT",
        "STK-DOC",
        tx,
      );

      const targetWarehouseId =
        parsed.documentType === "site_issue"
          ? parsed.sourceWarehouseId
          : parsed.destinationWarehouseId;

      if (!targetWarehouseId) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Warehouse is required for ${parsed.documentType}.`,
          400,
        );
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
          status: "posted",
        },
        linesToInsert,
        tx,
      );

      const mainLocationId = await this.resolveMainLocationId(
        principal.companyId,
        targetWarehouseId,
        tx,
      );

      for (const line of linesToInsert) {
        await this.repo.ensureStockBalance(
          principal.companyId,
          targetWarehouseId,
          line.itemId,
          tx,
          {
            locationId: mainLocationId,
            brandOfferingId: null,
          },
        );
        const balance = await this.repo.getStockBalanceForUpdate(
          targetWarehouseId,
          line.itemId,
          tx,
          {
            locationId: mainLocationId,
            brandOfferingId: null,
          },
        );
        if (!balance) throw new Error("Failed to lock stock balance row.");

        const currentOnHand = new Decimal(balance.quantityOnHand);
        const lineQty = new Decimal(line.quantity);

        let newOnHand: Decimal;
        let direction: "in" | "out";

        if (parsed.documentType === "site_issue") {
          direction = "out";
          const reserved = new Decimal(balance.quantityReserved);
          const available = currentOnHand.minus(reserved);
          if (available.lt(lineQty)) {
            throw new ConflictError(
              `Insufficient stock to issue. Available: ${available.toFixed(4)}, Required: ${lineQty.toFixed(4)}`,
            );
          }
          newOnHand = currentOnHand.minus(lineQty);
        } else {
          // opening_balance, site_return, adjustment
          direction = "in";
          newOnHand = currentOnHand.plus(lineQty);
        }

        const entryNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );

        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber,
            postingDate: new Date(),
            sourceType: parsed.documentType as
              | "opening_balance"
              | "site_issue"
              | "site_return"
              | "adjustment",
            sourceId: header.id,
            sourceReference: `${docNumber} (${parsed.documentType})`,
            warehouseId: targetWarehouseId,
            locationId: mainLocationId,
            itemId: line.itemId,
            brandOfferingId: null,
            direction,
            quantity: lineQty.toFixed(4),
            balanceBefore: currentOnHand.toFixed(4),
            balanceAfter: newOnHand.toFixed(4),
            unitCost: line.unitRate || null,
            notes: line.notes || parsed.notes,
            postedByUserId: principal.userId,
          },
          tx,
        );

        await this.repo.updateStockBalanceQuantities(
          balance.id,
          newOnHand.toFixed(4),
          balance.quantityReserved,
          tx,
        );
      }

      if (isQueryableTx(tx)) {
        await this.evaluateLowStockThresholds(
          tx,
          principal.companyId,
          targetWarehouseId,
          linesToInsert.map((l) => ({
            itemId: l.itemId,
            brandOfferingId: null,
          })),
        );
      }

      return header;
    });
  }

  async listStockDocuments(
    principal: AuthenticatedPrincipal,
    params?: { documentType?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    return this.repo.listStockDocuments(principal.companyId, params);
  }

  async listThresholds(
    principal: AuthenticatedPrincipal,
    warehouseId?: string,
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    const conditions = [
      eq(warehouseItemThresholds.companyId, principal.companyId),
    ];
    if (warehouseId)
      conditions.push(eq(warehouseItemThresholds.warehouseId, warehouseId));
    return this.repo.withTransaction(async (tx) =>
      tx
        .select({
          id: warehouseItemThresholds.id,
          warehouseId: warehouseItemThresholds.warehouseId,
          warehouseCode: warehouses.code,
          warehouseName: warehouses.name,
          itemId: warehouseItemThresholds.itemId,
          itemCode: items.code,
          itemName: items.name,
          brandOfferingId: warehouseItemThresholds.brandOfferingId,
          brandName: brands.name,
          manufacturerModel: itemBrandOfferings.manufacturerModel,
          unitSymbol: units.symbol,
          minStock: warehouseItemThresholds.minStock,
          maxStock: warehouseItemThresholds.maxStock,
          lowStockAlertActive: warehouseItemThresholds.lowStockAlertActive,
          lowStockAlertSentAt: warehouseItemThresholds.lowStockAlertSentAt,
          updatedByUserId: warehouseItemThresholds.updatedByUserId,
          updatedByUserName: users.name,
          rowVersion: warehouseItemThresholds.rowVersion,
          updatedAt: warehouseItemThresholds.updatedAt,
        })
        .from(warehouseItemThresholds)
        .innerJoin(
          warehouses,
          eq(warehouses.id, warehouseItemThresholds.warehouseId),
        )
        .innerJoin(items, eq(items.id, warehouseItemThresholds.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          itemBrandOfferings,
          eq(itemBrandOfferings.id, warehouseItemThresholds.brandOfferingId),
        )
        .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
        .leftJoin(users, eq(users.id, warehouseItemThresholds.updatedByUserId))
        .where(and(...conditions))
        .orderBy(
          desc(warehouseItemThresholds.lowStockAlertActive),
          warehouseItemThresholds.updatedAt,
        ),
    );
  }

  async upsertThreshold(
    principal: AuthenticatedPrincipal,
    payload: unknown,
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.threshold.manage");
    const parsed = upsertThresholdSchema.parse(payload);
    const minStock = new Decimal(parsed.minStock).toFixed(4);
    const maxStock = new Decimal(parsed.maxStock).toFixed(4);
    return this.repo.withTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM warehouses WHERE company_id = ${principal.companyId} AND id = ${parsed.warehouseId} FOR UPDATE`,
      );
      const existing = await tx
        .select()
        .from(warehouseItemThresholds)
        .where(
          and(
            eq(warehouseItemThresholds.companyId, principal.companyId),
            eq(warehouseItemThresholds.warehouseId, parsed.warehouseId),
            eq(warehouseItemThresholds.itemId, parsed.itemId),
            parsed.brandOfferingId
              ? eq(
                  warehouseItemThresholds.brandOfferingId,
                  parsed.brandOfferingId,
                )
              : isNull(warehouseItemThresholds.brandOfferingId),
          ),
        )
        .limit(1);

      let row;
      if (existing[0]) {
        const [updated] = await tx
          .update(warehouseItemThresholds)
          .set({
            minStock,
            maxStock,
            updatedByUserId: principal.userId,
            rowVersion: sql`${warehouseItemThresholds.rowVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(warehouseItemThresholds.id, existing[0].id),
              eq(warehouseItemThresholds.rowVersion, existing[0].rowVersion),
            ),
          )
          .returning();
        if (!updated)
          throw new ConflictError(
            "Threshold changed concurrently. Please reload.",
          );
        row = updated;
      } else {
        const [inserted] = await tx
          .insert(warehouseItemThresholds)
          .values({
            companyId: principal.companyId,
            warehouseId: parsed.warehouseId,
            itemId: parsed.itemId,
            brandOfferingId: parsed.brandOfferingId ?? null,
            minStock,
            maxStock,
            updatedByUserId: principal.userId,
          })
          .returning();
        row = inserted!;
      }

      await this.evaluateLowStockThresholds(
        tx,
        principal.companyId,
        parsed.warehouseId,
        [
          {
            itemId: parsed.itemId,
            brandOfferingId: parsed.brandOfferingId ?? null,
          },
        ],
      );
      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.threshold_upserted",
        targetType: "warehouse_item_threshold",
        targetId: row.id,
        requestId,
        metadata: {
          warehouseId: parsed.warehouseId,
          itemId: parsed.itemId,
          brandOfferingId: parsed.brandOfferingId ?? null,
          minStock,
          maxStock,
        },
      });
      return row;
    });
  }

  async listReplenishmentRequests(
    principal: AuthenticatedPrincipal,
    params?: { warehouseId?: string; status?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    const conditions = [
      eq(storeReplenishmentRequests.companyId, principal.companyId),
    ];
    if (params?.warehouseId)
      conditions.push(
        eq(storeReplenishmentRequests.warehouseId, params.warehouseId),
      );
    if (params?.status)
      conditions.push(
        eq(
          storeReplenishmentRequests.status,
          params.status as "open" | "ordered" | "dismissed",
        ),
      );

    return this.repo.withTransaction(async (tx) =>
      tx
        .select({
          id: storeReplenishmentRequests.id,
          srrNumber: storeReplenishmentRequests.srrNumber,
          warehouseId: storeReplenishmentRequests.warehouseId,
          warehouseName: warehouses.name,
          itemId: storeReplenishmentRequests.itemId,
          itemCode: items.code,
          itemName: items.name,
          brandOfferingId: storeReplenishmentRequests.brandOfferingId,
          brandName: brands.name,
          unitId: items.unitId,
          unitSymbol: units.symbol,
          requestedQty: storeReplenishmentRequests.requestedQty,
          currentFreeQty: storeReplenishmentRequests.currentFreeQty,
          minStock: storeReplenishmentRequests.minStock,
          maxStock: storeReplenishmentRequests.maxStock,
          status: storeReplenishmentRequests.status,
          linkedPoId: storeReplenishmentRequests.linkedPoId,
          requestedByUserId: storeReplenishmentRequests.requestedByUserId,
          requestedByUserName: users.name,
          notes: storeReplenishmentRequests.notes,
          rowVersion: storeReplenishmentRequests.rowVersion,
          createdAt: storeReplenishmentRequests.createdAt,
        })
        .from(storeReplenishmentRequests)
        .innerJoin(
          warehouses,
          eq(warehouses.id, storeReplenishmentRequests.warehouseId),
        )
        .innerJoin(items, eq(items.id, storeReplenishmentRequests.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .innerJoin(
          users,
          eq(users.id, storeReplenishmentRequests.requestedByUserId),
        )
        .leftJoin(
          itemBrandOfferings,
          eq(itemBrandOfferings.id, storeReplenishmentRequests.brandOfferingId),
        )
        .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
        .where(and(...conditions))
        .orderBy(desc(storeReplenishmentRequests.createdAt)),
    );
  }

  async createReplenishmentRequest(
    principal: AuthenticatedPrincipal,
    payload: unknown,
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.replenishment.request");
    const parsed = createReplenishmentRequestSchema.parse(payload);
    return this.repo.withTransaction(async (tx) => {
      const thresholdRows = await tx
        .select()
        .from(warehouseItemThresholds)
        .where(
          and(
            eq(warehouseItemThresholds.companyId, principal.companyId),
            eq(warehouseItemThresholds.warehouseId, parsed.warehouseId),
            eq(warehouseItemThresholds.itemId, parsed.itemId),
            parsed.brandOfferingId
              ? eq(
                  warehouseItemThresholds.brandOfferingId,
                  parsed.brandOfferingId,
                )
              : isNull(warehouseItemThresholds.brandOfferingId),
          ),
        )
        .limit(1);
      const threshold = thresholdRows[0];
      if (!threshold)
        throw new AppError(
          "VALIDATION_ERROR",
          "Configure min/max stock before creating a replenishment request.",
          422,
        );

      const locations = await this.repo.ensureWarehouseSystemLocations(
        principal.companyId,
        parsed.warehouseId,
        tx,
      );
      await this.repo.ensureStockBalance(
        principal.companyId,
        parsed.warehouseId,
        parsed.itemId,
        tx,
        {
          locationId: locations.mainLocation.id,
          brandOfferingId: parsed.brandOfferingId ?? null,
        },
      );
      const balance = await this.repo.getStockBalanceForUpdate(
        parsed.warehouseId,
        parsed.itemId,
        tx,
        {
          locationId: locations.mainLocation.id,
          brandOfferingId: parsed.brandOfferingId ?? null,
        },
      );
      const rawFree = new Decimal(balance?.quantityOnHand ?? "0").minus(
        new Decimal(balance?.quantityReserved ?? "0"),
      );
      const free = rawFree.gte(0) ? rawFree : new Decimal(0);
      const number = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "STORE_REPLENISHMENT_REQUEST",
        "SRR",
        tx,
      );
      const [row] = await tx
        .insert(storeReplenishmentRequests)
        .values({
          companyId: principal.companyId,
          srrNumber: number,
          warehouseId: parsed.warehouseId,
          itemId: parsed.itemId,
          brandOfferingId: parsed.brandOfferingId ?? null,
          requestedQty: new Decimal(parsed.requestedQty).toFixed(4),
          currentFreeQty: free.toFixed(4),
          minStock: threshold.minStock,
          maxStock: threshold.maxStock,
          requestedByUserId: principal.userId,
          notes: parsed.notes ?? null,
        })
        .returning();

      const purchaseUsers = await tx
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(
          userRoleAssignments,
          eq(userRoleAssignments.userId, users.id),
        )
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
        .where(
          and(
            eq(users.companyId, principal.companyId),
            eq(users.status, "active"),
            inArray(roles.code, ["purchase_executive", "purchase_manager"]),
          ),
        );
      if (purchaseUsers.length > 0) {
        await createNotificationRepository(tx).createMany(
          purchaseUsers.map((u) => ({
            companyId: principal.companyId,
            recipientUserId: u.id,
            type: "inventory.replenishment_requested",
            severity: "warning",
            title: "Store replenishment requested",
            message: `${number} was submitted for store replenishment (${new Decimal(parsed.requestedQty).toFixed(2)} units).`,
            link: "/procurement/requisitions?tab=replenishment",
            targetType: "store_replenishment_request",
            targetId: row!.id,
            dedupKey: `srr-created:${row!.id}:${u.id}`,
          })),
        );
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.replenishment_requested",
        targetType: "store_replenishment_request",
        targetId: row!.id,
        requestId,
        metadata: {
          srrNumber: number,
          warehouseId: parsed.warehouseId,
          itemId: parsed.itemId,
          requestedQty: parsed.requestedQty,
        },
      });
      return row;
    });
  }

  async evaluateLowStockThresholds(
    tx: TxOrDb,
    companyId: string,
    warehouseId: string,
    pairs: Array<{ itemId: string; brandOfferingId: string | null }>,
  ) {
    const seen = new Set<string>();
    for (const pair of pairs) {
      const key = `${pair.itemId}:${pair.brandOfferingId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const thresholdRows = await tx
        .select()
        .from(warehouseItemThresholds)
        .where(
          and(
            eq(warehouseItemThresholds.companyId, companyId),
            eq(warehouseItemThresholds.warehouseId, warehouseId),
            eq(warehouseItemThresholds.itemId, pair.itemId),
            pair.brandOfferingId
              ? eq(
                  warehouseItemThresholds.brandOfferingId,
                  pair.brandOfferingId,
                )
              : isNull(warehouseItemThresholds.brandOfferingId),
          ),
        )
        .for("update")
        .limit(1);
      const threshold = thresholdRows[0];
      if (!threshold) continue;

      const locations = await this.repo.ensureWarehouseSystemLocations(
        companyId,
        warehouseId,
        tx,
      );
      await this.repo.ensureStockBalance(
        companyId,
        warehouseId,
        pair.itemId,
        tx,
        {
          locationId: locations.mainLocation.id,
          brandOfferingId: pair.brandOfferingId,
        },
      );
      const balance = await this.repo.getStockBalanceForUpdate(
        warehouseId,
        pair.itemId,
        tx,
        {
          locationId: locations.mainLocation.id,
          brandOfferingId: pair.brandOfferingId,
        },
      );
      const rawFree = new Decimal(balance?.quantityOnHand ?? "0").minus(
        new Decimal(balance?.quantityReserved ?? "0"),
      );
      const free = rawFree.gte(0) ? rawFree : new Decimal(0);

      const openPoRows = await tx
        .select({
          storeReplenishmentQty: purchaseOrderLines.storeReplenishmentQty,
          storeReceivedQty: purchaseOrderLines.storeReceivedQty,
        })
        .from(purchaseOrderLines)
        .innerJoin(
          purchaseOrders,
          eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
        )
        .where(
          and(
            eq(purchaseOrderLines.companyId, companyId),
            eq(purchaseOrderLines.itemId, pair.itemId),
            pair.brandOfferingId
              ? eq(purchaseOrderLines.brandOfferingId, pair.brandOfferingId)
              : isNull(purchaseOrderLines.brandOfferingId),
            inArray(purchaseOrders.status, [
              "approved",
              "issued",
              "partially_delivered",
            ]),
          ),
        );
      const incoming = openPoRows.reduce((sum, row) => {
        const outstanding = new Decimal(row.storeReplenishmentQty).minus(
          new Decimal(row.storeReceivedQty),
        );
        return sum.plus(outstanding.gte(0) ? outstanding : new Decimal(0));
      }, new Decimal(0));

      const effective = free.plus(incoming);
      const min = new Decimal(threshold.minStock);
      const now = new Date();
      if (effective.lt(min) && !threshold.lowStockAlertActive) {
        const nextRowVersion = threshold.rowVersion + 1;
        await tx
          .update(warehouseItemThresholds)
          .set({
            lowStockAlertActive: true,
            lowStockAlertSentAt: now,
            updatedAt: now,
            rowVersion: nextRowVersion,
          })
          .where(eq(warehouseItemThresholds.id, threshold.id));

        const [itemInfo] = await tx
          .select({ code: items.code, name: items.name })
          .from(items)
          .where(eq(items.id, pair.itemId))
          .limit(1);
        const [whInfo] = await tx
          .select({ name: warehouses.name })
          .from(warehouses)
          .where(eq(warehouses.id, warehouseId))
          .limit(1);

        const recipients = await tx
          .selectDistinct({ id: users.id })
          .from(users)
          .innerJoin(
            userRoleAssignments,
            eq(userRoleAssignments.userId, users.id),
          )
          .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
          .where(
            and(
              eq(users.companyId, companyId),
              eq(users.status, "active"),
              inArray(roles.code, [
                "storekeeper",
                "purchase_executive",
                "purchase_manager",
              ]),
            ),
          );

        const label = itemInfo
          ? `${itemInfo.code} (${itemInfo.name})`
          : pair.itemId;
        const whLabel = whInfo?.name ?? warehouseId;
        const episodeKey = `inventory-low-stock:${warehouseId}:${pair.itemId}:${pair.brandOfferingId ?? "generic"}:v${nextRowVersion}`;

        if (recipients.length > 0) {
          await createNotificationRepository(tx).createMany(
            recipients.map((recipient) => ({
              companyId,
              recipientUserId: recipient.id,
              type: "inventory.low_stock_alert",
              severity: "warning",
              title: "Low stock alert",
              message: `${label} at ${whLabel} dropped below Min (${effective.toFixed(2)} < ${min.toFixed(2)}).`,
              link: "/inventory",
              targetType: "warehouse",
              targetId: warehouseId,
              dedupKey: `${episodeKey}:${recipient.id}`,
            })),
          );
        }

        await tx
          .insert(outboxJobs)
          .values({
            companyId,
            type: "inventory.low_stock_alert",
            payload: {
              warehouseId,
              itemId: pair.itemId,
              brandOfferingId: pair.brandOfferingId,
              effectiveStock: effective.toFixed(4),
              minStock: min.toFixed(4),
              maxStock: threshold.maxStock,
            },
            dedupKey: episodeKey,
          })
          .onConflictDoNothing();
      } else if (effective.gte(min) && threshold.lowStockAlertActive) {
        await tx
          .update(warehouseItemThresholds)
          .set({
            lowStockAlertActive: false,
            lowStockAlertSentAt: null,
            updatedAt: now,
            rowVersion: threshold.rowVersion + 1,
          })
          .where(eq(warehouseItemThresholds.id, threshold.id));
      }
    }
  }

  async listMirRequests(
    principal: AuthenticatedPrincipal,
    params: { warehouseId?: string; projectId?: string; status?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    const conditions = [
      eq(materialIssueRequests.companyId, principal.companyId),
    ];
    if (params.warehouseId)
      conditions.push(
        eq(materialIssueRequests.warehouseId, params.warehouseId),
      );
    if (params.projectId)
      conditions.push(eq(materialIssueRequests.projectId, params.projectId));
    if (params.status)
      conditions.push(
        eq(
          materialIssueRequests.status,
          params.status as
            | "open"
            | "partially_dispatched"
            | "dispatched"
            | "completed"
            | "short_closed"
            | "cancelled",
        ),
      );

    return this.repo.withTransaction(async (tx) => {
      const headers = await tx
        .select({
          id: materialIssueRequests.id,
          mirNumber: materialIssueRequests.mirNumber,
          projectId: materialIssueRequests.projectId,
          projectNumber: projects.projectNumber,
          projectTitle: projects.title,
          quotationRevisionId: materialIssueRequests.quotationRevisionId,
          warehouseId: materialIssueRequests.warehouseId,
          warehouseCode: warehouses.code,
          warehouseName: warehouses.name,
          status: materialIssueRequests.status,
          requestedByUserId: materialIssueRequests.requestedByUserId,
          requestedByUserName: users.name,
          notes: materialIssueRequests.notes,
          rowVersion: materialIssueRequests.rowVersion,
          createdAt: materialIssueRequests.createdAt,
        })
        .from(materialIssueRequests)
        .innerJoin(projects, eq(projects.id, materialIssueRequests.projectId))
        .innerJoin(
          warehouses,
          eq(warehouses.id, materialIssueRequests.warehouseId),
        )
        .innerJoin(users, eq(users.id, materialIssueRequests.requestedByUserId))
        .where(and(...conditions))
        .orderBy(desc(materialIssueRequests.createdAt));

      return Promise.all(
        headers.map(async (header) => {
          const lines = await tx
            .select({
              id: materialIssueRequestLines.id,
              lineNumber: materialIssueRequestLines.lineNumber,
              quotationLineId: materialIssueRequestLines.quotationLineId,
              itemId: materialIssueRequestLines.itemId,
              itemCode: items.code,
              itemName: items.name,
              brandOfferingId: materialIssueRequestLines.brandOfferingId,
              brandName: brands.name,
              manufacturerModel: itemBrandOfferings.manufacturerModel,
              unitId: materialIssueRequestLines.unitId,
              unitSymbol: units.symbol,
              requestedQty: materialIssueRequestLines.requestedQty,
              reservedQty: materialIssueRequestLines.reservedQty,
              dispatchedQty: materialIssueRequestLines.dispatchedQty,
              verifiedReceivedQty:
                materialIssueRequestLines.verifiedReceivedQty,
              damagedOrShortQty: materialIssueRequestLines.damagedOrShortQty,
              reservationId: materialIssueRequestLines.reservationId,
            })
            .from(materialIssueRequestLines)
            .innerJoin(items, eq(items.id, materialIssueRequestLines.itemId))
            .innerJoin(units, eq(units.id, materialIssueRequestLines.unitId))
            .leftJoin(
              itemBrandOfferings,
              eq(
                itemBrandOfferings.id,
                materialIssueRequestLines.brandOfferingId,
              ),
            )
            .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
            .where(eq(materialIssueRequestLines.mirId, header.id))
            .orderBy(materialIssueRequestLines.lineNumber);
          return { ...header, lines };
        }),
      );
    });
  }

  async createMir(
    principal: AuthenticatedPrincipal,
    payload: unknown,
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.request.create");
    const parsed = createMirSchema.parse(payload);
    return this.repo.withTransaction(async (tx) => {
      const [revisionRow] = await tx
        .select({ revision: quotationRevisions, quotation: quotations })
        .from(quotationRevisions)
        .innerJoin(
          quotations,
          eq(quotations.id, quotationRevisions.quotationId),
        )
        .where(
          and(
            eq(quotationRevisions.companyId, principal.companyId),
            eq(quotationRevisions.id, parsed.quotationRevisionId),
            eq(quotationRevisions.status, "accepted"),
          ),
        )
        .limit(1);
      if (!revisionRow)
        throw new ConflictError(
          "Only an Accepted quotation revision can create a material issue request.",
        );

      const mirroredLines = await Promise.all(
        parsed.lines.map(async (input, originalIndex) => {
          const [match] = await tx
            .select({ quotationLine: quotationLines, boqLine: boqLines })
            .from(quotationLines)
            .innerJoin(boqLines, eq(boqLines.id, quotationLines.boqLineId))
            .where(
              and(
                eq(quotationLines.companyId, principal.companyId),
                eq(
                  quotationLines.quotationRevisionId,
                  parsed.quotationRevisionId,
                ),
                eq(quotationLines.id, input.quotationLineId),
              ),
            )
            .limit(1);
          if (!match)
            throw new AppError(
              "VALIDATION_ERROR",
              "MIR line must match the exact accepted quotation line.",
              422,
            );
          if (match.boqLine.itemId !== input.itemId)
            throw new ConflictError(
              "Quotation item does not match the MIR line.",
            );
          if (
            (match.quotationLine.offeringId ?? null) !==
            (input.brandOfferingId ?? null)
          )
            throw new ConflictError(
              "Quotation brand/offering does not match the MIR line.",
            );
          if (match.boqLine.unitId !== input.unitId)
            throw new ConflictError(
              "Quotation unit does not match the MIR line.",
            );
          return {
            originalIndex,
            input: { ...input, itemId: match.boqLine.itemId },
          };
        }),
      );

      const locations = await this.repo.ensureWarehouseSystemLocations(
        principal.companyId,
        parsed.warehouseId,
        tx,
      );
      const sortedForLock = [...mirroredLines].sort((a, b) => {
        const ka = `${parsed.warehouseId}:${locations.mainLocation.id}:${a.input.itemId}:${a.input.brandOfferingId ?? ""}`;
        const kb = `${parsed.warehouseId}:${locations.mainLocation.id}:${b.input.itemId}:${b.input.brandOfferingId ?? ""}`;
        return ka.localeCompare(kb);
      });

      for (const { input } of sortedForLock) {
        await this.repo.ensureStockBalance(
          principal.companyId,
          parsed.warehouseId,
          input.itemId,
          tx,
          {
            locationId: locations.mainLocation.id,
            brandOfferingId: input.brandOfferingId ?? null,
          },
        );
      }

      const number = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "MATERIAL_ISSUE_REQUEST",
        "MIR",
        tx,
      );
      const [mir] = await tx
        .insert(materialIssueRequests)
        .values({
          companyId: principal.companyId,
          mirNumber: number,
          projectId: parsed.projectId,
          quotationRevisionId: parsed.quotationRevisionId,
          warehouseId: parsed.warehouseId,
          requestedByUserId: principal.userId,
          notes: parsed.notes ?? null,
        })
        .returning();

      if (!mir)
        throw new ConflictError("Failed to create material issue request.");

      for (const { originalIndex, input } of sortedForLock) {
        const balance = await this.repo.getStockBalanceForUpdate(
          parsed.warehouseId,
          input.itemId,
          tx,
          {
            locationId: locations.mainLocation.id,
            brandOfferingId: input.brandOfferingId ?? null,
          },
        );
        const free = new Decimal(balance?.quantityOnHand ?? "0").minus(
          new Decimal(balance?.quantityReserved ?? "0"),
        );
        const requested = new Decimal(input.requestedQty);
        if (free.lt(requested)) {
          throw new ConflictError(
            `Insufficient free stock for item ${input.itemId}. Available ${free.toFixed(4)}; requested ${requested.toFixed(4)}.`,
          );
        }

        const reservationNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_RESERVATION",
          "RES",
          tx,
        );
        const [reservation] = await tx
          .insert(stockReservations)
          .values({
            companyId: principal.companyId,
            reservationNumber,
            projectId: parsed.projectId,
            warehouseId: parsed.warehouseId,
            itemId: input.itemId,
            brandOfferingId: input.brandOfferingId ?? null,
            quantityReserved: requested.toFixed(4),
            reservedByUserId: principal.userId,
            notes: `MIR ${number} · ${parsed.notes ?? "Stock requested for quotation fulfillment"}`,
          })
          .returning();
        if (!reservation)
          throw new ConflictError("Failed to create stock reservation.");
        await this.repo.updateStockBalanceQuantities(
          balance!.id,
          balance!.quantityOnHand,
          new Decimal(balance!.quantityReserved).plus(requested).toFixed(4),
          tx,
        );
        await tx.insert(materialIssueRequestLines).values({
          companyId: principal.companyId,
          mirId: mir.id,
          lineNumber: originalIndex + 1,
          quotationLineId: input.quotationLineId,
          itemId: input.itemId,
          brandOfferingId: input.brandOfferingId ?? null,
          unitId: input.unitId,
          requestedQty: requested.toFixed(4),
          reservedQty: requested.toFixed(4),
          reservationId: reservation.id,
        });
      }

      await this.evaluateLowStockThresholds(
        tx,
        principal.companyId,
        parsed.warehouseId,
        parsed.lines.map((line) => ({
          itemId: line.itemId,
          brandOfferingId: line.brandOfferingId ?? null,
        })),
      );

      const storekeepers = await tx
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(
          userRoleAssignments,
          eq(userRoleAssignments.userId, users.id),
        )
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
        .where(
          and(
            eq(users.companyId, principal.companyId),
            eq(users.status, "active"),
            inArray(roles.code, ["storekeeper"]),
          ),
        );
      if (storekeepers.length > 0) {
        await createNotificationRepository(tx).createMany(
          storekeepers.map((sk) => ({
            companyId: principal.companyId,
            recipientUserId: sk.id,
            type: "inventory.mir_created",
            severity: "info",
            title: "New Material Issue Request",
            message: `${number} was created for project issue (${parsed.lines.length} line(s)). Ready for dispatch.`,
            link: "/inventory",
            targetType: "material_issue_request",
            targetId: mir.id,
            dedupKey: `mir-created:${mir.id}:${sk.id}`,
          })),
        );
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.mir_created",
        targetType: "material_issue_request",
        targetId: mir.id,
        requestId,
        metadata: {
          mirNumber: number,
          projectId: parsed.projectId,
          warehouseId: parsed.warehouseId,
          lineCount: parsed.lines.length,
        },
      });

      return {
        ...mir,
        lines: await tx
          .select()
          .from(materialIssueRequestLines)
          .where(eq(materialIssueRequestLines.mirId, mir.id))
          .orderBy(materialIssueRequestLines.lineNumber),
      };
    });
  }

  async dispatchMir(
    principal: AuthenticatedPrincipal,
    mirId: string,
    payload: unknown,
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.dispatch.execute");
    const parsed = dispatchMirSchema.parse(payload);

    const txResult = await this.repo.withTransaction(async (tx) => {
      const [mir] = await tx
        .select()
        .from(materialIssueRequests)
        .where(
          and(
            eq(materialIssueRequests.companyId, principal.companyId),
            eq(materialIssueRequests.id, mirId),
          ),
        )
        .for("update")
        .limit(1);
      if (!mir) throw new NotFoundError("Material issue request not found.");
      if (!["open", "partially_dispatched"].includes(mir.status))
        throw new ConflictError(`MIR is already ${mir.status}.`);

      const dcNumber = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "DELIVERY_CHALLAN",
        "DC",
        tx,
      );
      const locations = await this.repo.ensureWarehouseSystemLocations(
        principal.companyId,
        mir.warehouseId,
        tx,
      );
      const siteLocation = await this.repo.ensureProjectSiteLocation(
        principal.companyId,
        mir.warehouseId,
        mir.projectId,
        tx,
      );
      const [dc] = await tx
        .insert(deliveryChallans)
        .values({
          companyId: principal.companyId,
          dcNumber,
          mirId: mir.id,
          projectId: mir.projectId,
          warehouseId: mir.warehouseId,
          siteLocationId: siteLocation.id,
          dispatchedByUserId: principal.userId,
          transporterName: parsed.transporterName ?? null,
          vehicleNumber: parsed.vehicleNumber ?? null,
          receiverName: parsed.receiverName ?? null,
        })
        .returning();

      if (!dc) throw new ConflictError("Failed to create delivery challan.");

      const lockedLines = await Promise.all(
        parsed.lines.map(async (input, originalIndex) => {
          const [line] = await tx
            .select()
            .from(materialIssueRequestLines)
            .where(
              and(
                eq(materialIssueRequestLines.companyId, principal.companyId),
                eq(materialIssueRequestLines.mirId, mir.id),
                eq(materialIssueRequestLines.id, input.mirLineId),
              ),
            )
            .for("update")
            .limit(1);
          if (!line)
            throw new AppError(
              "VALIDATION_ERROR",
              "Dispatch line does not belong to this MIR.",
              422,
            );
          return { originalIndex, input, line };
        }),
      );

      const sortedDispatch = [...lockedLines].sort((a, b) => {
        const ka = `${mir.warehouseId}:${locations.mainLocation.id}:${a.line.itemId}:${a.line.brandOfferingId ?? ""}`;
        const kb = `${mir.warehouseId}:${locations.mainLocation.id}:${b.line.itemId}:${b.line.brandOfferingId ?? ""}`;
        return ka.localeCompare(kb);
      });

      const pdfLines: Array<{
        lineNumber: number;
        itemCode: string;
        itemName: string;
        brandName: string | null;
        manufacturerModel: string | null;
        unitSymbol: string;
        dispatchedQty: string;
      }> = [];

      for (const { originalIndex, input, line } of sortedDispatch) {
        const remaining = new Decimal(line.requestedQty).minus(
          new Decimal(line.dispatchedQty),
        );
        const dispatchQty = new Decimal(input.dispatchedQty);
        if (dispatchQty.lte(0) || dispatchQty.gt(remaining)) {
          throw new ConflictError(
            `Dispatch quantity exceeds remaining MIR quantity (${remaining.toFixed(4)}).`,
          );
        }

        await this.repo.ensureStockBalance(
          principal.companyId,
          mir.warehouseId,
          line.itemId,
          tx,
          {
            locationId: locations.mainLocation.id,
            brandOfferingId: line.brandOfferingId,
          },
        );
        const mainBalance = await this.repo.getStockBalanceForUpdate(
          mir.warehouseId,
          line.itemId,
          tx,
          {
            locationId: locations.mainLocation.id,
            brandOfferingId: line.brandOfferingId,
          },
        );
        const mainBefore = new Decimal(mainBalance!.quantityOnHand);
        const mainReservedBefore = new Decimal(mainBalance!.quantityReserved);
        if (mainBefore.lt(dispatchQty)) {
          throw new ConflictError(
            `Insufficient physical stock at MAIN for dispatch. On-hand ${mainBefore.toFixed(4)}.`,
          );
        }
        if (mainReservedBefore.lt(dispatchQty)) {
          throw new ConflictError(
            "MIR reservation is no longer available for dispatch.",
          );
        }

        const [dcLine] = await tx
          .insert(deliveryChallanLines)
          .values({
            companyId: principal.companyId,
            dcId: dc.id,
            mirLineId: line.id,
            lineNumber: originalIndex + 1,
            itemId: line.itemId,
            brandOfferingId: line.brandOfferingId,
            dispatchedQty: dispatchQty.toFixed(4),
          })
          .returning();

        const mainAfter = mainBefore.minus(dispatchQty);
        const mainReservedAfter = mainReservedBefore.minus(dispatchQty);
        await this.repo.updateStockBalanceQuantities(
          mainBalance!.id,
          mainAfter.toFixed(4),
          mainReservedAfter.toFixed(4),
          tx,
        );

        if (line.reservationId) {
          const [resRow] = await tx
            .select()
            .from(stockReservations)
            .where(
              and(
                eq(stockReservations.companyId, principal.companyId),
                eq(stockReservations.id, line.reservationId),
              ),
            )
            .for("update")
            .limit(1);
          if (resRow) {
            const nextIssued = new Decimal(resRow.quantityIssued).plus(
              dispatchQty,
            );
            const nextStatus = nextIssued.gte(
              new Decimal(resRow.quantityReserved),
            )
              ? "fulfilled"
              : resRow.status;
            await tx
              .update(stockReservations)
              .set({
                quantityIssued: nextIssued.toFixed(4),
                status: nextStatus,
                updatedAt: new Date(),
                rowVersion: resRow.rowVersion + 1,
              })
              .where(eq(stockReservations.id, resRow.id));
          }
        }

        const outEntryNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );
        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber: outEntryNumber,
            postingDate: new Date(),
            sourceType: "dc_dispatch_out",
            sourceId: dcLine!.id,
            sourceReference: dcNumber,
            warehouseId: mir.warehouseId,
            locationId: locations.mainLocation.id,
            itemId: line.itemId,
            brandOfferingId: line.brandOfferingId,
            direction: "out",
            quantity: dispatchQty.toFixed(4),
            balanceBefore: mainBefore.toFixed(4),
            balanceAfter: mainAfter.toFixed(4),
            postedByUserId: principal.userId,
          },
          tx,
        );

        await this.repo.ensureStockBalance(
          principal.companyId,
          mir.warehouseId,
          line.itemId,
          tx,
          {
            locationId: locations.inTransitLocation.id,
            brandOfferingId: line.brandOfferingId,
          },
        );
        const transit = await this.repo.getStockBalanceForUpdate(
          mir.warehouseId,
          line.itemId,
          tx,
          {
            locationId: locations.inTransitLocation.id,
            brandOfferingId: line.brandOfferingId,
          },
        );
        const transitBefore = new Decimal(transit!.quantityOnHand);
        const transitAfter = transitBefore.plus(dispatchQty);
        await this.repo.updateStockBalanceQuantities(
          transit!.id,
          transitAfter.toFixed(4),
          transit!.quantityReserved,
          tx,
        );

        const inEntryNumber = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );
        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber: inEntryNumber,
            postingDate: new Date(),
            sourceType: "dc_dispatch_in",
            sourceId: dcLine!.id,
            sourceReference: dcNumber,
            warehouseId: mir.warehouseId,
            locationId: locations.inTransitLocation.id,
            itemId: line.itemId,
            brandOfferingId: line.brandOfferingId,
            direction: "in",
            quantity: dispatchQty.toFixed(4),
            balanceBefore: transitBefore.toFixed(4),
            balanceAfter: transitAfter.toFixed(4),
            postedByUserId: principal.userId,
          },
          tx,
        );

        const nextDispatched = new Decimal(line.dispatchedQty).plus(
          dispatchQty,
        );
        await tx
          .update(materialIssueRequestLines)
          .set({
            dispatchedQty: nextDispatched.toFixed(4),
            updatedAt: new Date(),
          })
          .where(eq(materialIssueRequestLines.id, line.id));

        const [itemMeta] = await tx
          .select({
            itemCode: items.code,
            itemName: items.name,
            unitSymbol: units.symbol,
          })
          .from(items)
          .innerJoin(units, eq(units.id, items.unitId))
          .where(eq(items.id, line.itemId))
          .limit(1);
        let brandName: string | null = null;
        let manufacturerModel: string | null = null;
        if (line.brandOfferingId) {
          const [brandMeta] = await tx
            .select({
              brandName: brands.name,
              manufacturerModel: itemBrandOfferings.manufacturerModel,
            })
            .from(itemBrandOfferings)
            .innerJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
            .where(eq(itemBrandOfferings.id, line.brandOfferingId))
            .limit(1);
          brandName = brandMeta?.brandName ?? null;
          manufacturerModel = brandMeta?.manufacturerModel ?? null;
        }
        pdfLines.push({
          lineNumber: originalIndex + 1,
          itemCode: itemMeta?.itemCode ?? "",
          itemName: itemMeta?.itemName ?? "",
          brandName,
          manufacturerModel,
          unitSymbol: itemMeta?.unitSymbol ?? "",
          dispatchedQty: dispatchQty.toFixed(4),
        });
      }

      const remainingLines = await tx
        .select()
        .from(materialIssueRequestLines)
        .where(eq(materialIssueRequestLines.mirId, mir.id));
      const fullyDispatched = remainingLines.every((line) =>
        new Decimal(line.dispatchedQty).gte(new Decimal(line.requestedQty)),
      );
      await tx
        .update(materialIssueRequests)
        .set({
          status: fullyDispatched ? "dispatched" : "partially_dispatched",
          rowVersion: mir.rowVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(materialIssueRequests.id, mir.id));

      await this.evaluateLowStockThresholds(
        tx,
        principal.companyId,
        mir.warehouseId,
        remainingLines.map((line) => ({
          itemId: line.itemId,
          brandOfferingId: line.brandOfferingId,
        })),
      );

      const siteTeam = await tx
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.companyId, principal.companyId),
            eq(projectMembers.projectId, mir.projectId),
            inArray(projectMembers.role, ["site_engineer", "project_manager"]),
          ),
        );
      if (siteTeam.length > 0) {
        await createNotificationRepository(tx).createMany(
          siteTeam.map((m) => ({
            companyId: principal.companyId,
            recipientUserId: m.userId,
            type: "inventory.dc_dispatched",
            severity: "info",
            title: "Material dispatched to site",
            message: `Delivery Challan ${dcNumber} was dispatched from store and is ready for Site POD verification.`,
            link: `/projects/${mir.projectId}?tab=materials`,
            targetType: "delivery_challan",
            targetId: dc.id,
            dedupKey: `dc-dispatched:${dc.id}:${m.userId}`,
          })),
        );
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.dc_dispatched",
        targetType: "delivery_challan",
        targetId: dc.id,
        requestId,
        metadata: {
          dcNumber,
          mirId: mir.id,
          mirNumber: mir.mirNumber,
          projectId: mir.projectId,
        },
      });

      const [companyRow] = await tx
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, principal.companyId))
        .limit(1);
      const [projectRow] = await tx
        .select({
          projectNumber: projects.projectNumber,
          title: projects.title,
          siteName: sites.name,
          addressLine1: sites.addressLine1,
          city: sites.city,
          state: sites.state,
        })
        .from(projects)
        .innerJoin(sites, eq(sites.id, projects.siteId))
        .where(eq(projects.id, mir.projectId))
        .limit(1);
      const [whRow] = await tx
        .select({
          code: warehouses.code,
          name: warehouses.name,
          addressLine1: warehouses.addressLine1,
          city: warehouses.city,
          state: warehouses.state,
        })
        .from(warehouses)
        .where(eq(warehouses.id, mir.warehouseId))
        .limit(1);

      return {
        dc,
        pdfData: {
          dcNumber,
          mirNumber: mir.mirNumber,
          dispatchedAt: dc.dispatchedAt.toISOString(),
          companyName: companyRow?.name ?? "Fire Safety Operations",
          project: {
            number: projectRow?.projectNumber ?? "",
            title: projectRow?.title ?? "",
            siteName: projectRow?.siteName ?? "",
            siteAddress: [
              projectRow?.addressLine1,
              projectRow?.city,
              projectRow?.state,
            ]
              .filter(Boolean)
              .join(", "),
          },
          warehouse: {
            code: whRow?.code ?? "",
            name: whRow?.name ?? "",
            address: [whRow?.addressLine1, whRow?.city, whRow?.state]
              .filter(Boolean)
              .join(", "),
          },
          dispatchedByName: principal.name,
          transporterName: dc.transporterName,
          vehicleNumber: dc.vehicleNumber,
          receiverName: dc.receiverName,
          notes: mir.notes,
          lines: [...pdfLines].sort((a, b) => a.lineNumber - b.lineNumber),
        },
      };
    });

    // Generate immutable Delivery Challan PDF outside DB locks
    const pdfBytes = await renderDeliveryChallanPdf(txResult.pdfData);
    const storageName = `${randomUUID()}.pdf`;
    await ensureUploadRoot();
    await writeFile(resolvePrivateFile(storageName), pdfBytes);
    const checksumSha256 = createHash("sha256").update(pdfBytes).digest("hex");

    try {
      await this.repo.withTransaction(async (tx) => {
        await tx
          .update(deliveryChallans)
          .set({
            pdfStorageName: storageName,
            pdfChecksumSha256: checksumSha256,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(deliveryChallans.companyId, principal.companyId),
              eq(deliveryChallans.id, txResult.dc.id),
            ),
          );
      });
    } catch (error) {
      await removePrivateFile(storageName);
      throw error;
    }

    const [enriched] = await this.listDeliveryChallans(principal, {
      id: txResult.dc.id,
    });
    return enriched ?? this.sanitizeDeliveryChallan(txResult.dc, []);
  }

  async verifyPod(
    principal: AuthenticatedPrincipal,
    dcId: string,
    payload: unknown,
    uploadedPhoto?: { storageName: string; checksumSha256: string },
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.pod.verify");
    if (!uploadedPhoto) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Signed physical Delivery Challan photo (POD) is required.",
        422,
      );
    }
    const parsed = verifyPodSchema.parse(payload);
    const updatedDc = await this.repo.withTransaction(async (tx) => {
      const [dc] = await tx
        .select()
        .from(deliveryChallans)
        .where(
          and(
            eq(deliveryChallans.companyId, principal.companyId),
            eq(deliveryChallans.id, dcId),
          ),
        )
        .for("update")
        .limit(1);
      if (!dc) throw new NotFoundError("Delivery challan not found.");
      if (dc.status !== "dispatched")
        throw new ConflictError(`DC is already ${dc.status}.`);
      const isOverride =
        dc.dispatchedByUserId === principal.userId &&
        isAdministrator(principal);
      if (
        dc.dispatchedByUserId === principal.userId &&
        !isAdministrator(principal)
      ) {
        throw new ForbiddenError(
          "The dispatching storekeeper cannot verify their own delivery challan.",
        );
      }
      if (dc.rowVersion !== parsed.rowVersion)
        throw new ConflictError(
          "The delivery challan changed concurrently. Reload and retry.",
        );

      const dcLines = await tx
        .select()
        .from(deliveryChallanLines)
        .where(eq(deliveryChallanLines.dcId, dc.id))
        .for("update")
        .orderBy(deliveryChallanLines.lineNumber);
      const submittedIds = parsed.lines.map((line) => line.dcLineId);
      if (
        new Set(submittedIds).size !== submittedIds.length ||
        submittedIds.length !== dcLines.length ||
        dcLines.some((line) => !submittedIds.includes(line.id))
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Submit each delivery challan line exactly once.",
          422,
        );
      }

      const [transitLocation] = await tx
        .select()
        .from(stockLocations)
        .where(
          and(
            eq(stockLocations.warehouseId, dc.warehouseId),
            eq(stockLocations.locationType, "in_transit"),
          ),
        )
        .limit(1);
      if (!transitLocation)
        throw new Error("IN_TRANSIT stock location is missing.");

      const sortedDcLines = [...dcLines].sort((a, b) => {
        const ka = `${dc.warehouseId}:${transitLocation.id}:${a.itemId}:${a.brandOfferingId ?? ""}`;
        const kb = `${dc.warehouseId}:${transitLocation.id}:${b.itemId}:${b.brandOfferingId ?? ""}`;
        return ka.localeCompare(kb);
      });

      let anyDamage = false;
      for (const dcLine of sortedDcLines) {
        const input = parsed.lines.find((l) => l.dcLineId === dcLine.id)!;
        const verified = new Decimal(input.verifiedReceivedQty);
        const damaged = new Decimal(input.damagedOrShortQty);
        if (!verified.plus(damaged).eq(new Decimal(dcLine.dispatchedQty))) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Verified received quantity plus damaged/short quantity must equal dispatched quantity.",
            422,
          );
        }
        if (damaged.gt(0)) anyDamage = true;

        await tx
          .update(deliveryChallanLines)
          .set({
            verifiedReceivedQty: verified.toFixed(4),
            damagedOrShortQty: damaged.toFixed(4),
            lineRemarks: input.lineRemarks ?? null,
          })
          .where(eq(deliveryChallanLines.id, dcLine.id));

        if (verified.gt(0)) {
          const transit = await this.repo.getStockBalanceForUpdate(
            dc.warehouseId,
            dcLine.itemId,
            tx,
            {
              locationId: transitLocation.id,
              brandOfferingId: dcLine.brandOfferingId,
            },
          );
          if (!transit) throw new Error("In-transit balance row is missing.");
          const transitBefore = new Decimal(transit.quantityOnHand);
          if (transitBefore.lt(verified))
            throw new ConflictError(
              "Verified quantity exceeds in-transit stock.",
            );
          const transitAfter = transitBefore.minus(verified);
          await this.repo.updateStockBalanceQuantities(
            transit.id,
            transitAfter.toFixed(4),
            transit.quantityReserved,
            tx,
          );
          const outEntryNumber = await this.repo.allocateDocumentNumber(
            principal.companyId,
            "STOCK_LEDGER_ENTRY",
            "SLE",
            tx,
          );
          await this.repo.createStockLedgerEntry(
            {
              companyId: principal.companyId,
              entryNumber: outEntryNumber,
              postingDate: new Date(),
              sourceType: "dc_pod_in",
              sourceId: dcLine.id,
              sourceReference: dc.dcNumber,
              warehouseId: dc.warehouseId,
              locationId: transitLocation.id,
              itemId: dcLine.itemId,
              brandOfferingId: dcLine.brandOfferingId,
              direction: "out",
              quantity: verified.toFixed(4),
              balanceBefore: transitBefore.toFixed(4),
              balanceAfter: transitAfter.toFixed(4),
              postedByUserId: principal.userId,
            },
            tx,
          );

          await this.repo.ensureStockBalance(
            principal.companyId,
            dc.warehouseId,
            dcLine.itemId,
            tx,
            {
              locationId: dc.siteLocationId,
              brandOfferingId: dcLine.brandOfferingId,
            },
          );
          const siteBalance = await this.repo.getStockBalanceForUpdate(
            dc.warehouseId,
            dcLine.itemId,
            tx,
            {
              locationId: dc.siteLocationId,
              brandOfferingId: dcLine.brandOfferingId,
            },
          );
          if (!siteBalance)
            throw new Error("Project site stock balance row is missing.");
          const siteBefore = new Decimal(siteBalance.quantityOnHand);
          const siteAfter = siteBefore.plus(verified);
          await this.repo.updateStockBalanceQuantities(
            siteBalance.id,
            siteAfter.toFixed(4),
            siteBalance.quantityReserved,
            tx,
          );
          const inEntryNumber = await this.repo.allocateDocumentNumber(
            principal.companyId,
            "STOCK_LEDGER_ENTRY",
            "SLE",
            tx,
          );
          await this.repo.createStockLedgerEntry(
            {
              companyId: principal.companyId,
              entryNumber: inEntryNumber,
              postingDate: new Date(),
              sourceType: "dc_pod_in",
              sourceId: dcLine.id,
              sourceReference: dc.dcNumber,
              warehouseId: dc.warehouseId,
              locationId: dc.siteLocationId,
              itemId: dcLine.itemId,
              brandOfferingId: dcLine.brandOfferingId,
              direction: "in",
              quantity: verified.toFixed(4),
              balanceBefore: siteBefore.toFixed(4),
              balanceAfter: siteAfter.toFixed(4),
              postedByUserId: principal.userId,
            },
            tx,
          );
        }

        await tx
          .update(materialIssueRequestLines)
          .set({
            verifiedReceivedQty: sql`${materialIssueRequestLines.verifiedReceivedQty} + ${verified.toFixed(4)}`,
            damagedOrShortQty: sql`${materialIssueRequestLines.damagedOrShortQty} + ${damaged.toFixed(4)}`,
            updatedAt: new Date(),
          })
          .where(eq(materialIssueRequestLines.id, dcLine.mirLineId));
      }

      const nextDcStatus = anyDamage ? "discrepancy_pending" : "verified";
      await tx
        .update(deliveryChallans)
        .set({
          status: nextDcStatus,
          verifiedByUserId: principal.userId,
          verifiedAt: new Date(),
          podPhotoStorageName: uploadedPhoto.storageName,
          podPhotoChecksumSha256: uploadedPhoto.checksumSha256,
          verificationNotes: parsed.verificationNotes ?? null,
          rowVersion: dc.rowVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(deliveryChallans.id, dc.id));

      const mirLines = await tx
        .select()
        .from(materialIssueRequestLines)
        .where(eq(materialIssueRequestLines.mirId, dc.mirId));
      const allReceived = mirLines.every((line) =>
        new Decimal(line.verifiedReceivedQty).gte(
          new Decimal(line.requestedQty),
        ),
      );
      const allDispatched = mirLines.every((line) =>
        new Decimal(line.dispatchedQty).gte(new Decimal(line.requestedQty)),
      );
      await tx
        .update(materialIssueRequests)
        .set({
          status: allReceived
            ? "completed"
            : allDispatched
              ? "dispatched"
              : "partially_dispatched",
          rowVersion: sql`${materialIssueRequests.rowVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(materialIssueRequests.id, dc.mirId));

      await this.evaluateLowStockThresholds(
        tx,
        principal.companyId,
        dc.warehouseId,
        dcLines.map((line) => ({
          itemId: line.itemId,
          brandOfferingId: line.brandOfferingId,
        })),
      );

      if (anyDamage) {
        const managerRoles = await tx
          .selectDistinct({ id: users.id })
          .from(users)
          .innerJoin(
            userRoleAssignments,
            eq(userRoleAssignments.userId, users.id),
          )
          .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
          .where(
            and(
              eq(users.companyId, principal.companyId),
              eq(users.status, "active"),
              inArray(roles.code, [
                "storekeeper",
                "purchase_manager",
                "project_manager",
              ]),
            ),
          );
        if (managerRoles.length > 0) {
          await createNotificationRepository(tx).createMany(
            managerRoles.map((m) => ({
              companyId: principal.companyId,
              recipientUserId: m.id,
              type: "inventory.dc_discrepancy",
              severity: "warning",
              title: "Delivery discrepancy reported",
              message: `${dc.dcNumber} reported damaged or short quantity on site POD verification.`,
              link: "/inventory",
              targetType: "delivery_challan",
              targetId: dc.id,
              dedupKey: `dc-discrepancy:${dc.id}:${m.id}`,
            })),
          );
        }
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.dc_pod_verified",
        targetType: "delivery_challan",
        targetId: dc.id,
        requestId,
        metadata: {
          dcNumber: dc.dcNumber,
          status: nextDcStatus,
          anyDamage,
          administratorOverride: isOverride,
        },
      });

      return dc;
    });

    const [enriched] = await this.listDeliveryChallans(principal, {
      id: updatedDc.id,
    });
    return enriched ?? this.sanitizeDeliveryChallan(updatedDc, []);
  }

  async resolveDiscrepancy(
    principal: AuthenticatedPrincipal,
    dcId: string,
    payload: unknown,
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.discrepancy.resolve");
    const parsed = resolveDiscrepancySchema.parse(payload);
    const resolvedDc = await this.repo.withTransaction(async (tx) => {
      const [dc] = await tx
        .select()
        .from(deliveryChallans)
        .where(
          and(
            eq(deliveryChallans.companyId, principal.companyId),
            eq(deliveryChallans.id, dcId),
          ),
        )
        .for("update")
        .limit(1);
      if (!dc) throw new NotFoundError("Delivery challan not found.");
      if (dc.status !== "discrepancy_pending")
        throw new ConflictError(
          `DC status is "${dc.status}" and cannot be resolved.`,
        );
      if (dc.rowVersion !== parsed.rowVersion)
        throw new ConflictError(
          "The delivery challan changed concurrently. Reload and retry.",
        );

      const dcLines = await tx
        .select()
        .from(deliveryChallanLines)
        .where(eq(deliveryChallanLines.dcId, dc.id))
        .for("update")
        .orderBy(deliveryChallanLines.lineNumber);

      const locations = await this.repo.ensureWarehouseSystemLocations(
        principal.companyId,
        dc.warehouseId,
        tx,
      );
      const sourceType: StockLedgerSourceType =
        parsed.resolution === "return_to_store"
          ? "dc_discrepancy_return"
          : parsed.resolution === "write_off_transit_loss"
            ? "dc_discrepancy_writeoff"
            : "dc_discrepancy_restock";

      const damagedLines = dcLines
        .filter((l) => new Decimal(l.damagedOrShortQty).gt(0))
        .sort((a, b) =>
          `${dc.warehouseId}:${locations.inTransitLocation.id}:${a.itemId}:${a.brandOfferingId ?? ""}`.localeCompare(
            `${dc.warehouseId}:${locations.inTransitLocation.id}:${b.itemId}:${b.brandOfferingId ?? ""}`,
          ),
        );

      for (const dcLine of damagedLines) {
        const damagedQty = new Decimal(dcLine.damagedOrShortQty);
        const transit = await this.repo.getStockBalanceForUpdate(
          dc.warehouseId,
          dcLine.itemId,
          tx,
          {
            locationId: locations.inTransitLocation.id,
            brandOfferingId: dcLine.brandOfferingId,
          },
        );
        if (!transit || new Decimal(transit.quantityOnHand).lt(damagedQty)) {
          throw new ConflictError(
            "Discrepancy quantity is no longer available in IN_TRANSIT.",
          );
        }
        const transitBefore = new Decimal(transit.quantityOnHand);
        const transitAfter = transitBefore.minus(damagedQty);
        await this.repo.updateStockBalanceQuantities(
          transit.id,
          transitAfter.toFixed(4),
          transit.quantityReserved,
          tx,
        );
        const outEntry = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );
        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber: outEntry,
            postingDate: new Date(),
            sourceType,
            sourceId: dcLine.id,
            sourceReference: `${dc.dcNumber} (${parsed.resolution})`,
            warehouseId: dc.warehouseId,
            locationId: locations.inTransitLocation.id,
            itemId: dcLine.itemId,
            brandOfferingId: dcLine.brandOfferingId,
            direction: "out",
            quantity: damagedQty.toFixed(4),
            balanceBefore: transitBefore.toFixed(4),
            balanceAfter: transitAfter.toFixed(4),
            notes: parsed.resolutionNotes,
            postedByUserId: principal.userId,
          },
          tx,
        );

        if (
          parsed.resolution === "return_to_store" ||
          parsed.resolution === "picking_error_restock"
        ) {
          await this.repo.ensureStockBalance(
            principal.companyId,
            dc.warehouseId,
            dcLine.itemId,
            tx,
            {
              locationId: locations.mainLocation.id,
              brandOfferingId: dcLine.brandOfferingId,
            },
          );
          const mainBalance = await this.repo.getStockBalanceForUpdate(
            dc.warehouseId,
            dcLine.itemId,
            tx,
            {
              locationId: locations.mainLocation.id,
              brandOfferingId: dcLine.brandOfferingId,
            },
          );
          const mainBefore = new Decimal(mainBalance!.quantityOnHand);
          const mainAfter = mainBefore.plus(damagedQty);
          await this.repo.updateStockBalanceQuantities(
            mainBalance!.id,
            mainAfter.toFixed(4),
            mainBalance!.quantityReserved,
            tx,
          );
          const inEntry = await this.repo.allocateDocumentNumber(
            principal.companyId,
            "STOCK_LEDGER_ENTRY",
            "SLE",
            tx,
          );
          await this.repo.createStockLedgerEntry(
            {
              companyId: principal.companyId,
              entryNumber: inEntry,
              postingDate: new Date(),
              sourceType,
              sourceId: dcLine.id,
              sourceReference: `${dc.dcNumber} (${parsed.resolution})`,
              warehouseId: dc.warehouseId,
              locationId: locations.mainLocation.id,
              itemId: dcLine.itemId,
              brandOfferingId: dcLine.brandOfferingId,
              direction: "in",
              quantity: damagedQty.toFixed(4),
              balanceBefore: mainBefore.toFixed(4),
              balanceAfter: mainAfter.toFixed(4),
              notes: parsed.resolutionNotes,
              postedByUserId: principal.userId,
            },
            tx,
          );
        }
      }

      await tx
        .update(deliveryChallans)
        .set({
          status: "resolved",
          discrepancyResolutionNotes: parsed.resolutionNotes,
          resolvedByUserId: principal.userId,
          resolvedAt: new Date(),
          rowVersion: dc.rowVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(deliveryChallans.id, dc.id));

      await this.evaluateLowStockThresholds(
        tx,
        principal.companyId,
        dc.warehouseId,
        damagedLines.map((l) => ({
          itemId: l.itemId,
          brandOfferingId: l.brandOfferingId,
        })),
      );

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.dc_discrepancy_resolved",
        targetType: "delivery_challan",
        targetId: dc.id,
        requestId,
        metadata: {
          dcNumber: dc.dcNumber,
          resolution: parsed.resolution,
          resolutionNotes: parsed.resolutionNotes,
        },
      });

      return dc;
    });

    const [enriched] = await this.listDeliveryChallans(principal, {
      id: resolvedDc.id,
    });
    return enriched ?? this.sanitizeDeliveryChallan(resolvedDc, []);
  }

  async listSiteReturns(
    principal: AuthenticatedPrincipal,
    params?: { projectId?: string; status?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    const conditions = [eq(siteReturns.companyId, principal.companyId)];
    if (params?.projectId)
      conditions.push(eq(siteReturns.projectId, params.projectId));
    if (params?.status)
      conditions.push(
        eq(
          siteReturns.status,
          params.status as "submitted" | "accepted" | "rejected" | "cancelled",
        ),
      );

    return this.repo.withTransaction(async (tx) => {
      const headers = await tx
        .select({
          id: siteReturns.id,
          returnNumber: siteReturns.returnNumber,
          projectId: siteReturns.projectId,
          projectTitle: projects.title,
          warehouseId: siteReturns.warehouseId,
          warehouseName: warehouses.name,
          status: siteReturns.status,
          submittedByUserId: siteReturns.submittedByUserId,
          submittedByUserName: users.name,
          submittedAt: siteReturns.submittedAt,
          acceptedAt: siteReturns.acceptedAt,
          reason: siteReturns.reason,
          notes: siteReturns.notes,
        })
        .from(siteReturns)
        .innerJoin(projects, eq(projects.id, siteReturns.projectId))
        .innerJoin(warehouses, eq(warehouses.id, siteReturns.warehouseId))
        .innerJoin(users, eq(users.id, siteReturns.submittedByUserId))
        .where(and(...conditions))
        .orderBy(desc(siteReturns.createdAt));

      return Promise.all(
        headers.map(async (header) => ({
          ...header,
          lines: await tx
            .select({
              id: siteReturnLines.id,
              lineNumber: siteReturnLines.lineNumber,
              itemId: siteReturnLines.itemId,
              itemCode: items.code,
              itemName: items.name,
              brandOfferingId: siteReturnLines.brandOfferingId,
              brandName: brands.name,
              unitSymbol: units.symbol,
              quantity: siteReturnLines.quantity,
              conditionNotes: siteReturnLines.conditionNotes,
            })
            .from(siteReturnLines)
            .innerJoin(items, eq(items.id, siteReturnLines.itemId))
            .innerJoin(units, eq(units.id, items.unitId))
            .leftJoin(
              itemBrandOfferings,
              eq(itemBrandOfferings.id, siteReturnLines.brandOfferingId),
            )
            .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
            .where(eq(siteReturnLines.siteReturnId, header.id))
            .orderBy(siteReturnLines.lineNumber),
        })),
      );
    });
  }

  async createSiteReturn(
    principal: AuthenticatedPrincipal,
    payload: unknown,
    requestId = "inventory",
  ) {
    if (
      !hasPermission(principal, "inventory.site_return.create") &&
      !hasPermission(principal, "inventory.pod.verify") &&
      !isAdministrator(principal)
    ) {
      throw new ForbiddenError(
        "Forbidden: missing required permission inventory.site_return.create",
      );
    }
    const parsed = createSiteReturnSchema.parse(payload);
    return this.repo.withTransaction(async (tx) => {
      const siteLocation = await this.repo.ensureProjectSiteLocation(
        principal.companyId,
        parsed.warehouseId,
        parsed.projectId,
        tx,
      );

      const sortedLines = [...parsed.lines].sort((a, b) =>
        `${parsed.warehouseId}:${siteLocation.id}:${a.itemId}:${a.brandOfferingId ?? ""}`.localeCompare(
          `${parsed.warehouseId}:${siteLocation.id}:${b.itemId}:${b.brandOfferingId ?? ""}`,
        ),
      );

      for (const input of sortedLines) {
        const siteBalance = await this.repo.getStockBalanceForUpdate(
          parsed.warehouseId,
          input.itemId,
          tx,
          {
            locationId: siteLocation.id,
            brandOfferingId: input.brandOfferingId ?? null,
          },
        );
        const onHand = new Decimal(siteBalance?.quantityOnHand ?? "0");
        const reqQty = new Decimal(input.quantity);
        if (onHand.lt(reqQty)) {
          throw new ConflictError(
            `Returned quantity (${reqQty.toFixed(4)}) exceeds project site stock (${onHand.toFixed(4)}).`,
          );
        }
      }

      const number = await this.repo.allocateDocumentNumber(
        principal.companyId,
        "SITE_RETURN",
        "SRT",
        tx,
      );
      const [siteReturn] = await tx
        .insert(siteReturns)
        .values({
          companyId: principal.companyId,
          returnNumber: number,
          projectId: parsed.projectId,
          warehouseId: parsed.warehouseId,
          siteLocationId: siteLocation.id,
          submittedByUserId: principal.userId,
          reason: parsed.reason,
          notes: parsed.notes ?? null,
        })
        .returning();

      for (let index = 0; index < parsed.lines.length; index++) {
        const input = parsed.lines[index]!;
        await tx.insert(siteReturnLines).values({
          companyId: principal.companyId,
          siteReturnId: siteReturn!.id,
          lineNumber: index + 1,
          itemId: input.itemId,
          brandOfferingId: input.brandOfferingId ?? null,
          quantity: new Decimal(input.quantity).toFixed(4),
          conditionNotes: input.conditionNotes ?? null,
        });
      }

      const storekeepers = await tx
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(
          userRoleAssignments,
          eq(userRoleAssignments.userId, users.id),
        )
        .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
        .where(
          and(
            eq(users.companyId, principal.companyId),
            eq(users.status, "active"),
            inArray(roles.code, ["storekeeper"]),
          ),
        );
      if (storekeepers.length > 0) {
        await createNotificationRepository(tx).createMany(
          storekeepers.map((sk) => ({
            companyId: principal.companyId,
            recipientUserId: sk.id,
            type: "inventory.site_return_submitted",
            severity: "info",
            title: "Site stock return submitted",
            message: `${number} was submitted for return to store.`,
            link: "/inventory",
            targetType: "site_return",
            targetId: siteReturn!.id,
            dedupKey: `site-return:${siteReturn!.id}:${sk.id}`,
          })),
        );
      }

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.site_return_submitted",
        targetType: "site_return",
        targetId: siteReturn!.id,
        requestId,
        metadata: {
          returnNumber: number,
          projectId: parsed.projectId,
          warehouseId: parsed.warehouseId,
        },
      });
      return siteReturn;
    });
  }

  async acceptSiteReturn(
    principal: AuthenticatedPrincipal,
    returnId: string,
    requestId = "inventory",
  ) {
    this.assertPermission(principal, "inventory.dispatch.execute");
    return this.repo.withTransaction(async (tx) => {
      const [siteReturn] = await tx
        .select()
        .from(siteReturns)
        .where(
          and(
            eq(siteReturns.companyId, principal.companyId),
            eq(siteReturns.id, returnId),
          ),
        )
        .for("update")
        .limit(1);
      if (!siteReturn) throw new NotFoundError("Site return not found.");
      if (siteReturn.status !== "submitted")
        throw new ConflictError(`Site return is already ${siteReturn.status}.`);
      const lines = await tx
        .select()
        .from(siteReturnLines)
        .where(eq(siteReturnLines.siteReturnId, siteReturn.id))
        .for("update");
      const locations = await this.repo.ensureWarehouseSystemLocations(
        principal.companyId,
        siteReturn.warehouseId,
        tx,
      );

      const sortedLines = [...lines].sort((a, b) =>
        `${siteReturn.warehouseId}:${siteReturn.siteLocationId}:${a.itemId}:${a.brandOfferingId ?? ""}`.localeCompare(
          `${siteReturn.warehouseId}:${siteReturn.siteLocationId}:${b.itemId}:${b.brandOfferingId ?? ""}`,
        ),
      );

      for (const line of sortedLines) {
        const qty = new Decimal(line.quantity);
        const siteBalance = await this.repo.getStockBalanceForUpdate(
          siteReturn.warehouseId,
          line.itemId,
          tx,
          {
            locationId: siteReturn.siteLocationId,
            brandOfferingId: line.brandOfferingId,
          },
        );
        if (!siteBalance || new Decimal(siteBalance.quantityOnHand).lt(qty))
          throw new ConflictError(
            "Returned quantity exceeds project site stock.",
          );
        const siteBefore = new Decimal(siteBalance.quantityOnHand);
        const siteAfter = siteBefore.minus(qty);
        await this.repo.updateStockBalanceQuantities(
          siteBalance.id,
          siteAfter.toFixed(4),
          siteBalance.quantityReserved,
          tx,
        );
        const outEntry = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );
        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber: outEntry,
            postingDate: new Date(),
            sourceType: "site_return_out",
            sourceId: line.id,
            sourceReference: siteReturn.returnNumber,
            warehouseId: siteReturn.warehouseId,
            locationId: siteReturn.siteLocationId,
            itemId: line.itemId,
            brandOfferingId: line.brandOfferingId,
            direction: "out",
            quantity: qty.toFixed(4),
            balanceBefore: siteBefore.toFixed(4),
            balanceAfter: siteAfter.toFixed(4),
            notes: siteReturn.reason,
            postedByUserId: principal.userId,
          },
          tx,
        );

        await this.repo.ensureStockBalance(
          principal.companyId,
          siteReturn.warehouseId,
          line.itemId,
          tx,
          {
            locationId: locations.mainLocation.id,
            brandOfferingId: line.brandOfferingId,
          },
        );
        const main = await this.repo.getStockBalanceForUpdate(
          siteReturn.warehouseId,
          line.itemId,
          tx,
          {
            locationId: locations.mainLocation.id,
            brandOfferingId: line.brandOfferingId,
          },
        );
        const mainBefore = new Decimal(main!.quantityOnHand);
        const mainAfter = mainBefore.plus(qty);
        await this.repo.updateStockBalanceQuantities(
          main!.id,
          mainAfter.toFixed(4),
          main!.quantityReserved,
          tx,
        );
        const inEntry = await this.repo.allocateDocumentNumber(
          principal.companyId,
          "STOCK_LEDGER_ENTRY",
          "SLE",
          tx,
        );
        await this.repo.createStockLedgerEntry(
          {
            companyId: principal.companyId,
            entryNumber: inEntry,
            postingDate: new Date(),
            sourceType: "site_return_in",
            sourceId: line.id,
            sourceReference: siteReturn.returnNumber,
            warehouseId: siteReturn.warehouseId,
            locationId: locations.mainLocation.id,
            itemId: line.itemId,
            brandOfferingId: line.brandOfferingId,
            direction: "in",
            quantity: qty.toFixed(4),
            balanceBefore: mainBefore.toFixed(4),
            balanceAfter: mainAfter.toFixed(4),
            notes: siteReturn.reason,
            postedByUserId: principal.userId,
          },
          tx,
        );
      }

      const [updated] = await tx
        .update(siteReturns)
        .set({
          status: "accepted",
          acceptedByUserId: principal.userId,
          acceptedAt: new Date(),
          rowVersion: siteReturn.rowVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(siteReturns.id, siteReturn.id))
        .returning();
      await this.evaluateLowStockThresholds(
        tx,
        principal.companyId,
        siteReturn.warehouseId,
        lines.map((line) => ({
          itemId: line.itemId,
          brandOfferingId: line.brandOfferingId,
        })),
      );
      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "inventory.site_return_accepted",
        targetType: "site_return",
        targetId: siteReturn.id,
        requestId,
        metadata: {
          returnNumber: siteReturn.returnNumber,
          projectId: siteReturn.projectId,
        },
      });
      return updated ?? siteReturn;
    });
  }

  private sanitizeDeliveryChallan(
    header: typeof deliveryChallans.$inferSelect,
    lines: unknown[],
  ) {
    return {
      id: header.id,
      dcNumber: header.dcNumber,
      mirId: header.mirId,
      projectId: header.projectId,
      warehouseId: header.warehouseId,
      siteLocationId: header.siteLocationId,
      status: header.status,
      dispatchedByUserId: header.dispatchedByUserId,
      dispatchedAt: header.dispatchedAt,
      transporterName: header.transporterName,
      vehicleNumber: header.vehicleNumber,
      receiverName: header.receiverName,
      hasPdf: Boolean(header.pdfStorageName),
      verifiedByUserId: header.verifiedByUserId,
      verifiedAt: header.verifiedAt,
      hasPodPhoto: Boolean(header.podPhotoStorageName),
      verificationNotes: header.verificationNotes,
      discrepancyResolutionNotes: header.discrepancyResolutionNotes,
      resolvedByUserId: header.resolvedByUserId,
      resolvedAt: header.resolvedAt,
      rowVersion: header.rowVersion,
      createdAt: header.createdAt,
      lines,
    };
  }

  async listDeliveryChallans(
    principal: AuthenticatedPrincipal,
    params: { id?: string; projectId?: string; status?: string },
  ) {
    this.assertPermission(principal, "inventory.stock.read");
    const conditions = [eq(deliveryChallans.companyId, principal.companyId)];
    if (params.id) conditions.push(eq(deliveryChallans.id, params.id));
    if (params.projectId)
      conditions.push(eq(deliveryChallans.projectId, params.projectId));
    if (params.status)
      conditions.push(
        eq(
          deliveryChallans.status,
          params.status as
            | "dispatched"
            | "verified"
            | "discrepancy_pending"
            | "resolved"
            | "cancelled",
        ),
      );

    return this.repo.withTransaction(async (tx) => {
      const headers = await tx
        .select({
          id: deliveryChallans.id,
          dcNumber: deliveryChallans.dcNumber,
          mirId: deliveryChallans.mirId,
          mirNumber: materialIssueRequests.mirNumber,
          projectId: deliveryChallans.projectId,
          projectNumber: projects.projectNumber,
          projectTitle: projects.title,
          warehouseId: deliveryChallans.warehouseId,
          warehouseName: warehouses.name,
          status: deliveryChallans.status,
          dispatchedByUserId: deliveryChallans.dispatchedByUserId,
          dispatchedAt: deliveryChallans.dispatchedAt,
          transporterName: deliveryChallans.transporterName,
          vehicleNumber: deliveryChallans.vehicleNumber,
          receiverName: deliveryChallans.receiverName,
          pdfStorageName: deliveryChallans.pdfStorageName,
          verifiedByUserId: deliveryChallans.verifiedByUserId,
          verifiedAt: deliveryChallans.verifiedAt,
          podPhotoStorageName: deliveryChallans.podPhotoStorageName,
          verificationNotes: deliveryChallans.verificationNotes,
          discrepancyResolutionNotes:
            deliveryChallans.discrepancyResolutionNotes,
          resolvedByUserId: deliveryChallans.resolvedByUserId,
          resolvedAt: deliveryChallans.resolvedAt,
          rowVersion: deliveryChallans.rowVersion,
          createdAt: deliveryChallans.createdAt,
        })
        .from(deliveryChallans)
        .innerJoin(
          materialIssueRequests,
          eq(materialIssueRequests.id, deliveryChallans.mirId),
        )
        .innerJoin(projects, eq(projects.id, deliveryChallans.projectId))
        .innerJoin(warehouses, eq(warehouses.id, deliveryChallans.warehouseId))
        .where(and(...conditions))
        .orderBy(desc(deliveryChallans.createdAt));

      const userIds = Array.from(
        new Set(
          headers.flatMap(
            (h) =>
              [
                h.dispatchedByUserId,
                h.verifiedByUserId,
                h.resolvedByUserId,
              ].filter(Boolean) as string[],
          ),
        ),
      );
      const userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const userRows = await tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds));
        userRows.forEach((u) => userMap.set(u.id, u.name));
      }

      return Promise.all(
        headers.map(async (header) => {
          const lines = await tx
            .select({
              id: deliveryChallanLines.id,
              lineNumber: deliveryChallanLines.lineNumber,
              mirLineId: deliveryChallanLines.mirLineId,
              itemId: deliveryChallanLines.itemId,
              itemCode: items.code,
              itemName: items.name,
              brandOfferingId: deliveryChallanLines.brandOfferingId,
              brandName: brands.name,
              unitSymbol: units.symbol,
              dispatchedQty: deliveryChallanLines.dispatchedQty,
              verifiedReceivedQty: deliveryChallanLines.verifiedReceivedQty,
              damagedOrShortQty: deliveryChallanLines.damagedOrShortQty,
              lineRemarks: deliveryChallanLines.lineRemarks,
            })
            .from(deliveryChallanLines)
            .innerJoin(items, eq(items.id, deliveryChallanLines.itemId))
            .innerJoin(units, eq(units.id, items.unitId))
            .leftJoin(
              itemBrandOfferings,
              eq(itemBrandOfferings.id, deliveryChallanLines.brandOfferingId),
            )
            .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
            .where(eq(deliveryChallanLines.dcId, header.id))
            .orderBy(deliveryChallanLines.lineNumber);

          return {
            id: header.id,
            dcNumber: header.dcNumber,
            mirId: header.mirId,
            mirNumber: header.mirNumber,
            projectId: header.projectId,
            projectNumber: header.projectNumber,
            projectTitle: header.projectTitle,
            warehouseId: header.warehouseId,
            warehouseName: header.warehouseName,
            status: header.status,
            dispatchedByUserId: header.dispatchedByUserId,
            dispatchedByUserName: userMap.get(header.dispatchedByUserId) ?? "",
            dispatchedAt: header.dispatchedAt,
            transporterName: header.transporterName,
            vehicleNumber: header.vehicleNumber,
            receiverName: header.receiverName,
            hasPdf: Boolean(header.pdfStorageName),
            verifiedByUserName: header.verifiedByUserId
              ? (userMap.get(header.verifiedByUserId) ?? null)
              : null,
            verifiedAt: header.verifiedAt,
            hasPodPhoto: Boolean(header.podPhotoStorageName),
            verificationNotes: header.verificationNotes,
            resolvedByUserName: header.resolvedByUserId
              ? (userMap.get(header.resolvedByUserId) ?? null)
              : null,
            resolvedAt: header.resolvedAt,
            discrepancyResolutionNotes: header.discrepancyResolutionNotes,
            rowVersion: header.rowVersion,
            createdAt: header.createdAt,
            lines,
          };
        }),
      );
    });
  }

  async getDeliveryChallanPdfFile(
    principal: AuthenticatedPrincipal,
    dcId: string,
  ) {
    if (
      !hasPermission(principal, "inventory.stock.read") &&
      !hasPermission(principal, "inventory.pod.verify") &&
      !isAdministrator(principal)
    ) {
      throw new ForbiddenError();
    }
    const [dc] = await this.repo.withTransaction(async (tx) =>
      tx
        .select({
          id: deliveryChallans.id,
          dcNumber: deliveryChallans.dcNumber,
          pdfStorageName: deliveryChallans.pdfStorageName,
        })
        .from(deliveryChallans)
        .where(
          and(
            eq(deliveryChallans.companyId, principal.companyId),
            eq(deliveryChallans.id, dcId),
          ),
        )
        .limit(1),
    );
    if (!dc || !dc.pdfStorageName) {
      throw new NotFoundError("Delivery Challan PDF not found.");
    }
    return {
      filePath: resolvePrivateFile(dc.pdfStorageName),
      filename: `${dc.dcNumber}.pdf`,
      mimeType: "application/pdf",
    };
  }

  async getDeliveryChallanPodPhotoFile(
    principal: AuthenticatedPrincipal,
    dcId: string,
  ) {
    if (
      !hasPermission(principal, "inventory.stock.read") &&
      !hasPermission(principal, "inventory.pod.verify") &&
      !isAdministrator(principal)
    ) {
      throw new ForbiddenError();
    }
    const [dc] = await this.repo.withTransaction(async (tx) =>
      tx
        .select({
          id: deliveryChallans.id,
          dcNumber: deliveryChallans.dcNumber,
          podPhotoStorageName: deliveryChallans.podPhotoStorageName,
        })
        .from(deliveryChallans)
        .where(
          and(
            eq(deliveryChallans.companyId, principal.companyId),
            eq(deliveryChallans.id, dcId),
          ),
        )
        .limit(1),
    );
    if (!dc || !dc.podPhotoStorageName) {
      throw new NotFoundError("Delivery Challan POD photo not found.");
    }
    const ext = dc.podPhotoStorageName.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "png"
          ? "image/png"
          : "image/jpeg";
    return {
      filePath: resolvePrivateFile(dc.podPhotoStorageName),
      filename: `${dc.dcNumber}-POD.${ext || "jpg"}`,
      mimeType,
    };
  }
}
