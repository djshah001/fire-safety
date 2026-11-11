import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  warehouses,
  stockBalances,
  stockLedgerEntries,
  stockTransfers,
  stockTransferLines,
  stockReservations,
  stockDocuments,
  stockDocumentLines,
  items,
  units,
  users,
  projects,
  goodsReceipts,
  goodsReceiptLines,
  purchaseOrderLines,
  documentCounters,
} from '../../infrastructure/database/schema/index.js';

export type TxOrDb = NodePgDatabase<Record<string, unknown>>;

export class InventoryRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async withTransaction<T>(callback: (tx: TxOrDb) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => callback(tx as TxOrDb));
  }

  async allocateDocumentNumber(
    companyId: string,
    documentType: string,
    prefix: string,
    executor: TxOrDb = this.db
  ): Promise<string> {
    const year = new Date().getFullYear();
    const periodKey = `${year}`;
    const now = new Date();

    const [counter] = await executor
      .insert(documentCounters)
      .values({ companyId, documentType, periodKey, nextValue: 2, updatedAt: now })
      .onConflictDoUpdate({
        target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey],
        set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now },
      })
      .returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });

    if (!counter) {
      throw new Error(`Failed to allocate document number for ${documentType}`);
    }

    const seq = String(counter.allocated).padStart(5, '0');
    return `${prefix}-${year}-${seq}`;
  }

  async listWarehouses(companyId: string, params?: { includeInactive?: boolean }) {
    const conditions = [eq(warehouses.companyId, companyId)];
    if (!params?.includeInactive) {
      conditions.push(eq(warehouses.isActive, 1));
    }

    return this.db
      .select({
        id: warehouses.id,
        code: warehouses.code,
        name: warehouses.name,
        warehouseType: warehouses.warehouseType,
        projectId: warehouses.projectId,
        projectTitle: projects.title,
        addressLine1: warehouses.addressLine1,
        city: warehouses.city,
        state: warehouses.state,
        postalCode: warehouses.postalCode,
        inChargeUserId: warehouses.inChargeUserId,
        inChargeUserName: users.name,
        isActive: warehouses.isActive,
        createdAt: warehouses.createdAt,
        updatedAt: warehouses.updatedAt,
      })
      .from(warehouses)
      .leftJoin(users, eq(warehouses.inChargeUserId, users.id))
      .leftJoin(projects, eq(warehouses.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(warehouses.code);
  }

  async getWarehouseById(companyId: string, id: string, executor: TxOrDb = this.db) {
    const rows = await executor
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.companyId, companyId), eq(warehouses.id, id)))
      .limit(1);
    return rows[0] || null;
  }

  async getWarehouseByCode(companyId: string, code: string, executor: TxOrDb = this.db) {
    const rows = await executor
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.companyId, companyId), eq(warehouses.code, code)))
      .limit(1);
    return rows[0] || null;
  }

  async createWarehouse(
    data: {
      companyId: string;
      code: string;
      name: string;
      warehouseType: 'central_warehouse' | 'regional_depot' | 'project_site_store';
      projectId?: string | null;
      addressLine1: string;
      city: string;
      state: string;
      postalCode?: string | null;
      inChargeUserId?: string | null;
    },
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor.insert(warehouses).values(data).returning();
    return row;
  }

  async updateWarehouse(
    companyId: string,
    id: string,
    data: Partial<{
      name: string;
      addressLine1: string;
      city: string;
      state: string;
      postalCode: string | null;
      inChargeUserId: string | null;
      isActive: number;
    }>,
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor
      .update(warehouses)
      .set({ ...data, updatedAt: new Date(), rowVersion: sql`${warehouses.rowVersion} + 1` })
      .where(and(eq(warehouses.companyId, companyId), eq(warehouses.id, id)))
      .returning();
    return row || null;
  }

  async listStockBalances(
    companyId: string,
    params?: {
      warehouseId?: string;
      search?: string;
      categoryId?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(stockBalances.companyId, companyId)];
    if (params?.warehouseId) {
      conditions.push(eq(stockBalances.warehouseId, params.warehouseId));
    }
    if (params?.categoryId) {
      conditions.push(eq(items.categoryId, params.categoryId));
    }
    if (params?.search) {
      conditions.push(
        or(
          ilike(items.code, `%${params.search}%`),
          ilike(items.name, `%${params.search}%`),
          ilike(warehouses.name, `%${params.search}%`)
        )!
      );
    }

    const query = this.db
      .select({
        id: stockBalances.id,
        warehouseId: stockBalances.warehouseId,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        warehouseType: warehouses.warehouseType,
        itemId: stockBalances.itemId,
        itemCode: items.code,
        itemName: items.name,
        unitId: items.unitId,
        unitSymbol: units.symbol,
        quantityOnHand: stockBalances.quantityOnHand,
        quantityReserved: stockBalances.quantityReserved,
        quantityAvailable: sql<string>`(${stockBalances.quantityOnHand} - ${stockBalances.quantityReserved})::numeric(18,4)`,
        lastMovementAt: stockBalances.lastMovementAt,
        updatedAt: stockBalances.updatedAt,
      })
      .from(stockBalances)
      .innerJoin(warehouses, eq(stockBalances.warehouseId, warehouses.id))
      .innerJoin(items, eq(stockBalances.itemId, items.id))
      .innerJoin(units, eq(items.unitId, units.id))
      .where(and(...conditions))
      .orderBy(warehouses.code, items.code);

    if (params?.limit) {
      query.limit(params.limit);
    }
    if (params?.offset) {
      query.offset(params.offset);
    }

    return query;
  }

  async getStockBalanceForUpdate(
    warehouseId: string,
    itemId: string,
    executor: TxOrDb = this.db
  ) {
    const rows = await executor
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.warehouseId, warehouseId), eq(stockBalances.itemId, itemId)))
      .for('update');
    return rows[0] || null;
  }

  async ensureStockBalance(
    companyId: string,
    warehouseId: string,
    itemId: string,
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor
      .insert(stockBalances)
      .values({
        companyId,
        warehouseId,
        itemId,
        quantityOnHand: '0.0000',
        quantityReserved: '0.0000',
      })
      .onConflictDoNothing()
      .returning();

    if (row) return row;
    return this.getStockBalanceForUpdate(warehouseId, itemId, executor);
  }

  async updateStockBalanceQuantities(
    id: string,
    newQuantityOnHand: string,
    newQuantityReserved: string,
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor
      .update(stockBalances)
      .set({
        quantityOnHand: newQuantityOnHand,
        quantityReserved: newQuantityReserved,
        lastMovementAt: new Date(),
        updatedAt: new Date(),
        rowVersion: sql`${stockBalances.rowVersion} + 1`,
      })
      .where(eq(stockBalances.id, id))
      .returning();
    return row;
  }

  async createStockLedgerEntry(
    data: {
      companyId: string;
      entryNumber: string;
      postingDate: Date;
      sourceType:
        | 'goods_receipt_line'
        | 'opening_balance'
        | 'transfer_dispatch'
        | 'transfer_receipt'
        | 'site_issue'
        | 'site_return'
        | 'adjustment';
      sourceId: string;
      sourceReference: string;
      warehouseId: string;
      itemId: string;
      direction: 'in' | 'out';
      quantity: string;
      balanceBefore: string;
      balanceAfter: string;
      unitCost?: string | null;
      notes?: string | null;
      postedByUserId: string;
    },
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor.insert(stockLedgerEntries).values(data).returning();
    return row;
  }

  async findLedgerEntryBySource(
    companyId: string,
    sourceType:
      | 'goods_receipt_line'
      | 'opening_balance'
      | 'transfer_dispatch'
      | 'transfer_receipt'
      | 'site_issue'
      | 'site_return'
      | 'adjustment',
    sourceId: string,
    warehouseId: string,
    direction: 'in' | 'out',
    executor: TxOrDb = this.db
  ) {
    const rows = await executor
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.companyId, companyId),
          eq(stockLedgerEntries.sourceType, sourceType),
          eq(stockLedgerEntries.sourceId, sourceId),
          eq(stockLedgerEntries.warehouseId, warehouseId),
          eq(stockLedgerEntries.direction, direction)
        )
      )
      .limit(1);
    return rows[0] || null;
  }

  async listStockLedger(
    companyId: string,
    params?: {
      warehouseId?: string;
      itemId?: string;
      sourceType?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(stockLedgerEntries.companyId, companyId)];
    if (params?.warehouseId) {
      conditions.push(eq(stockLedgerEntries.warehouseId, params.warehouseId));
    }
    if (params?.itemId) {
      conditions.push(eq(stockLedgerEntries.itemId, params.itemId));
    }
    if (params?.sourceType) {
      conditions.push(eq(stockLedgerEntries.sourceType, params.sourceType as any));
    }

    const query = this.db
      .select({
        id: stockLedgerEntries.id,
        entryNumber: stockLedgerEntries.entryNumber,
        postingDate: stockLedgerEntries.postingDate,
        sourceType: stockLedgerEntries.sourceType,
        sourceId: stockLedgerEntries.sourceId,
        sourceReference: stockLedgerEntries.sourceReference,
        warehouseId: stockLedgerEntries.warehouseId,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        itemId: stockLedgerEntries.itemId,
        itemCode: items.code,
        itemName: items.name,
        unitSymbol: units.symbol,
        direction: stockLedgerEntries.direction,
        quantity: stockLedgerEntries.quantity,
        balanceBefore: stockLedgerEntries.balanceBefore,
        balanceAfter: stockLedgerEntries.balanceAfter,
        unitCost: stockLedgerEntries.unitCost,
        notes: stockLedgerEntries.notes,
        postedByUserId: stockLedgerEntries.postedByUserId,
        postedByUserName: users.name,
        createdAt: stockLedgerEntries.createdAt,
      })
      .from(stockLedgerEntries)
      .innerJoin(warehouses, eq(stockLedgerEntries.warehouseId, warehouses.id))
      .innerJoin(items, eq(stockLedgerEntries.itemId, items.id))
      .innerJoin(units, eq(items.unitId, units.id))
      .innerJoin(users, eq(stockLedgerEntries.postedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(stockLedgerEntries.postingDate), desc(stockLedgerEntries.createdAt));

    if (params?.limit) {
      query.limit(params.limit);
    }
    if (params?.offset) {
      query.offset(params.offset);
    }

    return query;
  }

  async getGoodsReceiptLineForPosting(
    companyId: string,
    goodsReceiptLineId: string,
    executor: TxOrDb = this.db
  ) {
    const rows = await executor
      .select({
        lineId: goodsReceiptLines.id,
        goodsReceiptId: goodsReceipts.id,
        grnNumber: goodsReceipts.grnNumber,
        grnStatus: goodsReceipts.status,
        vendorChallanNumber: goodsReceipts.vendorChallanNumber,
        vendorChallanDate: goodsReceipts.vendorChallanDate,
        lineNumber: goodsReceiptLines.lineNumber,
        deliveredQuantity: goodsReceiptLines.deliveredQuantity,
        acceptedQuantity: goodsReceiptLines.acceptedQuantity,
        rejectedQuantity: goodsReceiptLines.rejectedQuantity,
        itemId: purchaseOrderLines.itemId,
        itemCode: purchaseOrderLines.itemCodeSnapshot,
        itemName: purchaseOrderLines.itemNameSnapshot,
        unitRate: purchaseOrderLines.unitRate,
      })
      .from(goodsReceiptLines)
      .innerJoin(goodsReceipts, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
      .innerJoin(purchaseOrderLines, eq(goodsReceiptLines.purchaseOrderLineId, purchaseOrderLines.id))
      .where(
        and(
          eq(goodsReceiptLines.companyId, companyId),
          eq(goodsReceiptLines.id, goodsReceiptLineId)
        )
      )
      .limit(1);

    return rows[0] || null;
  }

  async createStockTransfer(
    data: {
      companyId: string;
      transferNumber: string;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      projectId?: string | null;
      challanNumber?: string | null;
      vehicleNumber?: string | null;
      transporterName?: string | null;
      notes?: string | null;
    },
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor.insert(stockTransfers).values(data).returning();
    return row;
  }

  async createStockTransferLines(
    lines: Array<{
      companyId: string;
      transferId: string;
      lineNumber: number;
      itemId: string;
      dispatchedQuantity: string;
      notes?: string | null;
    }>,
    executor: TxOrDb = this.db
  ) {
    return executor.insert(stockTransferLines).values(lines).returning();
  }

  async getStockTransferById(companyId: string, id: string, executor: TxOrDb = this.db) {
    const rows = await executor
      .select({
        id: stockTransfers.id,
        transferNumber: stockTransfers.transferNumber,
        status: stockTransfers.status,
        sourceWarehouseId: stockTransfers.sourceWarehouseId,
        sourceWarehouseName: warehouses.name,
        destinationWarehouseId: stockTransfers.destinationWarehouseId,
        projectId: stockTransfers.projectId,
        challanNumber: stockTransfers.challanNumber,
        vehicleNumber: stockTransfers.vehicleNumber,
        transporterName: stockTransfers.transporterName,
        dispatchedAt: stockTransfers.dispatchedAt,
        dispatchedByUserId: stockTransfers.dispatchedByUserId,
        receivedAt: stockTransfers.receivedAt,
        receivedByUserId: stockTransfers.receivedByUserId,
        notes: stockTransfers.notes,
        rowVersion: stockTransfers.rowVersion,
        createdAt: stockTransfers.createdAt,
        updatedAt: stockTransfers.updatedAt,
      })
      .from(stockTransfers)
      .innerJoin(warehouses, eq(stockTransfers.sourceWarehouseId, warehouses.id))
      .where(and(eq(stockTransfers.companyId, companyId), eq(stockTransfers.id, id)))
      .limit(1);

    if (!rows[0]) return null;

    const dest = await executor
      .select({ name: warehouses.name })
      .from(warehouses)
      .where(eq(warehouses.id, rows[0].destinationWarehouseId))
      .limit(1);

    const lines = await executor
      .select({
        id: stockTransferLines.id,
        lineNumber: stockTransferLines.lineNumber,
        itemId: stockTransferLines.itemId,
        itemCode: items.code,
        itemName: items.name,
        unitSymbol: units.symbol,
        dispatchedQuantity: stockTransferLines.dispatchedQuantity,
        receivedQuantity: stockTransferLines.receivedQuantity,
        notes: stockTransferLines.notes,
      })
      .from(stockTransferLines)
      .innerJoin(items, eq(stockTransferLines.itemId, items.id))
      .innerJoin(units, eq(items.unitId, units.id))
      .where(eq(stockTransferLines.transferId, id))
      .orderBy(stockTransferLines.lineNumber);

    return {
      ...rows[0],
      destinationWarehouseName: dest[0]?.name || 'Unknown',
      lines,
    };
  }

  async listStockTransfers(companyId: string, params?: { status?: string }) {
    const conditions = [eq(stockTransfers.companyId, companyId)];
    if (params?.status) {
      conditions.push(eq(stockTransfers.status, params.status as any));
    }

    const rows = await this.db
      .select({
        id: stockTransfers.id,
        transferNumber: stockTransfers.transferNumber,
        status: stockTransfers.status,
        sourceWarehouseId: stockTransfers.sourceWarehouseId,
        sourceWarehouseCode: warehouses.code,
        sourceWarehouseName: warehouses.name,
        destinationWarehouseId: stockTransfers.destinationWarehouseId,
        projectId: stockTransfers.projectId,
        projectTitle: projects.title,
        challanNumber: stockTransfers.challanNumber,
        vehicleNumber: stockTransfers.vehicleNumber,
        dispatchedAt: stockTransfers.dispatchedAt,
        receivedAt: stockTransfers.receivedAt,
        createdAt: stockTransfers.createdAt,
      })
      .from(stockTransfers)
      .innerJoin(warehouses, eq(stockTransfers.sourceWarehouseId, warehouses.id))
      .leftJoin(projects, eq(stockTransfers.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(desc(stockTransfers.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const [dest] = await this.db
          .select({ code: warehouses.code, name: warehouses.name })
          .from(warehouses)
          .where(eq(warehouses.id, row.destinationWarehouseId))
          .limit(1);
        return {
          ...row,
          destinationWarehouseCode: dest?.code || '',
          destinationWarehouseName: dest?.name || 'Unknown',
        };
      })
    );
  }

  async updateStockTransferStatus(
    id: string,
    data: Partial<{
      status: 'draft' | 'dispatched' | 'received' | 'cancelled';
      dispatchedAt: Date;
      dispatchedByUserId: string;
      receivedAt: Date;
      receivedByUserId: string;
    }>,
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor
      .update(stockTransfers)
      .set({ ...data, updatedAt: new Date(), rowVersion: sql`${stockTransfers.rowVersion} + 1` })
      .where(eq(stockTransfers.id, id))
      .returning();
    return row;
  }

  async updateStockTransferLineReceived(
    transferLineId: string,
    receivedQuantity: string,
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor
      .update(stockTransferLines)
      .set({ receivedQuantity })
      .where(eq(stockTransferLines.id, transferLineId))
      .returning();
    return row;
  }

  async createStockReservation(
    data: {
      companyId: string;
      reservationNumber: string;
      projectId: string;
      boqLineId?: string | null;
      warehouseId: string;
      itemId: string;
      quantityReserved: string;
      reservedByUserId: string;
      notes?: string | null;
    },
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor.insert(stockReservations).values(data).returning();
    return row;
  }

  async getStockReservationById(companyId: string, id: string, executor: TxOrDb = this.db) {
    const rows = await executor
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.companyId, companyId), eq(stockReservations.id, id)))
      .limit(1);
    return rows[0] || null;
  }

  async updateStockReservationStatus(
    id: string,
    status: 'active' | 'fulfilled' | 'released',
    executor: TxOrDb = this.db
  ) {
    const [row] = await executor
      .update(stockReservations)
      .set({ status, updatedAt: new Date(), rowVersion: sql`${stockReservations.rowVersion} + 1` })
      .where(eq(stockReservations.id, id))
      .returning();
    return row;
  }

  async listStockReservations(companyId: string, params?: { projectId?: string; status?: string }) {
    const conditions = [eq(stockReservations.companyId, companyId)];
    if (params?.projectId) {
      conditions.push(eq(stockReservations.projectId, params.projectId));
    }
    if (params?.status) {
      conditions.push(eq(stockReservations.status, params.status as any));
    }

    return this.db
      .select({
        id: stockReservations.id,
        reservationNumber: stockReservations.reservationNumber,
        projectId: stockReservations.projectId,
        projectTitle: projects.title,
        warehouseId: stockReservations.warehouseId,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        itemId: stockReservations.itemId,
        itemCode: items.code,
        itemName: items.name,
        unitSymbol: units.symbol,
        quantityReserved: stockReservations.quantityReserved,
        quantityIssued: stockReservations.quantityIssued,
        status: stockReservations.status,
        reservedByUserId: stockReservations.reservedByUserId,
        reservedByUserName: users.name,
        notes: stockReservations.notes,
        createdAt: stockReservations.createdAt,
      })
      .from(stockReservations)
      .innerJoin(projects, eq(stockReservations.projectId, projects.id))
      .innerJoin(warehouses, eq(stockReservations.warehouseId, warehouses.id))
      .innerJoin(items, eq(stockReservations.itemId, items.id))
      .innerJoin(units, eq(items.unitId, units.id))
      .innerJoin(users, eq(stockReservations.reservedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(stockReservations.createdAt));
  }

  async createStockDocument(
    doc: {
      companyId: string;
      documentNumber: string;
      documentType: 'opening_balance' | 'site_issue' | 'site_return' | 'adjustment';
      sourceWarehouseId?: string | null;
      destinationWarehouseId?: string | null;
      projectId?: string | null;
      referenceNumber?: string | null;
      documentDate: string;
      notes: string;
      postedAt: Date;
      postedByUserId: string;
      status: 'posted';
    },
    lines: Array<{
      companyId: string;
      lineNumber: number;
      itemId: string;
      quantity: string;
      unitRate?: string | null;
      notes?: string | null;
    }>,
    executor: TxOrDb = this.db
  ) {
    const [header] = await executor.insert(stockDocuments).values(doc).returning();
    if (!header) {
      throw new Error('Failed to create stock document');
    }
    const insertedLines = await executor
      .insert(stockDocumentLines)
      .values(lines.map((l) => ({ ...l, stockDocumentId: header.id })))
      .returning();

    return { header, lines: insertedLines };
  }

  async listStockDocuments(companyId: string, params?: { documentType?: string }) {
    const conditions = [eq(stockDocuments.companyId, companyId)];
    if (params?.documentType) {
      conditions.push(eq(stockDocuments.documentType, params.documentType as any));
    }

    return this.db
      .select({
        id: stockDocuments.id,
        documentNumber: stockDocuments.documentNumber,
        documentType: stockDocuments.documentType,
        status: stockDocuments.status,
        sourceWarehouseId: stockDocuments.sourceWarehouseId,
        destinationWarehouseId: stockDocuments.destinationWarehouseId,
        projectId: stockDocuments.projectId,
        projectTitle: projects.title,
        referenceNumber: stockDocuments.referenceNumber,
        documentDate: stockDocuments.documentDate,
        notes: stockDocuments.notes,
        postedAt: stockDocuments.postedAt,
        postedByUserId: stockDocuments.postedByUserId,
        postedByUserName: users.name,
        createdAt: stockDocuments.createdAt,
      })
      .from(stockDocuments)
      .leftJoin(projects, eq(stockDocuments.projectId, projects.id))
      .leftJoin(users, eq(stockDocuments.postedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(stockDocuments.createdAt));
  }
}
