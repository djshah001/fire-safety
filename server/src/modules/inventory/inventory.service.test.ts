import { describe, expect, it, vi } from 'vitest';
import { InventoryService } from './inventory.service.js';
import type { InventoryRepository } from './inventory.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';

describe('InventoryService', () => {
  const principal: AuthenticatedPrincipal = {
    sessionId: 'test-session',
    userId: 'a0000000-0000-4000-8000-000000000001',
    companyId: 'b0000000-0000-4000-8000-000000000001',
    name: 'Admin User',
    email: 'admin@firesafety.com',
    mustChangePassword: false,
    grants: [
      {
        permissionCode: 'system.access.all',
        scopeKind: 'company',
        scopeId: null,
        source: 'role',
      },
    ],
  };

  const validWh1 = 'c0000000-0000-4000-8000-000000000001';
  const validWh2 = 'c0000000-0000-4000-8000-000000000002';
  const validGrnLine = 'd0000000-0000-4000-8000-000000000001';
  const validItem = 'e0000000-0000-4000-8000-000000000001';
  const validProject = 'f0000000-0000-4000-8000-000000000001';

  it('rejects GRN posting when accepted quantity is zero', async () => {
    const mockRepo = {
      withTransaction: vi.fn(async (cb) => cb({} as any)),
      getGoodsReceiptLineForPosting: vi.fn().mockResolvedValue({
        lineId: validGrnLine,
        goodsReceiptId: 'grn-1',
        grnNumber: 'GRN-001',
        lineNumber: 1,
        deliveredQuantity: '10.0000',
        acceptedQuantity: '0.0000',
        rejectedQuantity: '10.0000',
        itemId: validItem,
      }),
    } as unknown as InventoryRepository;

    const service = new InventoryService(mockRepo);

    await expect(
      service.postGoodsReceiptToInventory(principal, {
        warehouseId: validWh1,
        goodsReceiptLineId: validGrnLine,
      })
    ).rejects.toThrow('Cannot post GRN line #1 with 0 accepted quantity');
  });

  it('prevents duplicate posting of the same GRN line (idempotency)', async () => {
    const mockRepo = {
      withTransaction: vi.fn(async (cb) => cb({} as any)),
      getGoodsReceiptLineForPosting: vi.fn().mockResolvedValue({
        lineId: validGrnLine,
        goodsReceiptId: 'grn-1',
        grnNumber: 'GRN-001',
        lineNumber: 1,
        deliveredQuantity: '10.0000',
        acceptedQuantity: '10.0000',
        rejectedQuantity: '0.0000',
        itemId: validItem,
      }),
      findLedgerEntryBySource: vi.fn().mockResolvedValue({
        id: 'entry-1',
        entryNumber: 'SLE-2026-00001',
      }),
    } as unknown as InventoryRepository;

    const service = new InventoryService(mockRepo);

    await expect(
      service.postGoodsReceiptToInventory(principal, {
        warehouseId: validWh1,
        goodsReceiptLineId: validGrnLine,
      })
    ).rejects.toThrow('already been posted to inventory in entry SLE-2026-00001');
  });

  it('posts accepted GRN lines to stock ledger with balance update', async () => {
    const mockBalance = {
      id: 'bal-1',
      quantityOnHand: '5.0000',
      quantityReserved: '0.0000',
    };

    const mockRepo = {
      withTransaction: vi.fn(async (cb) => cb({} as any)),
      getGoodsReceiptLineForPosting: vi.fn().mockResolvedValue({
        lineId: validGrnLine,
        goodsReceiptId: 'grn-1',
        grnNumber: 'GRN-001',
        vendorChallanNumber: 'CH-999',
        lineNumber: 1,
        deliveredQuantity: '10.0000',
        acceptedQuantity: '8.0000',
        rejectedQuantity: '2.0000',
        itemId: validItem,
        unitRate: '150.00',
      }),
      findLedgerEntryBySource: vi.fn().mockResolvedValue(null),
      getWarehouseById: vi.fn().mockResolvedValue({ id: validWh1, code: 'WH-CENTRAL' }),
      ensureStockBalance: vi.fn().mockResolvedValue(mockBalance),
      getStockBalanceForUpdate: vi.fn().mockResolvedValue(mockBalance),
      allocateDocumentNumber: vi.fn().mockResolvedValue('SLE-2026-00042'),
      createStockLedgerEntry: vi.fn().mockResolvedValue({
        id: 'sle-42',
        entryNumber: 'SLE-2026-00042',
        quantity: '8.0000',
        direction: 'in',
        balanceBefore: '5.0000',
        balanceAfter: '13.0000',
      }),
      updateStockBalanceQuantities: vi.fn().mockResolvedValue({
        id: 'bal-1',
        quantityOnHand: '13.0000',
      }),
    } as unknown as InventoryRepository;

    const service = new InventoryService(mockRepo);

    const result = await service.postGoodsReceiptToInventory(principal, {
      warehouseId: validWh1,
      goodsReceiptLineId: validGrnLine,
    });

    expect(result.success).toBe(true);
    expect(result.ledgerEntry?.balanceAfter).toBe('13.0000');
    expect(mockRepo.createStockLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'in',
        quantity: '8.0000',
        balanceBefore: '5.0000',
        balanceAfter: '13.0000',
      }),
      expect.anything()
    );
  });

  it('rejects inter-warehouse transfer with identical source and destination', async () => {
    const mockRepo = {} as unknown as InventoryRepository;
    const service = new InventoryService(mockRepo);

    await expect(
      service.createStockTransfer(principal, {
        sourceWarehouseId: validWh1,
        destinationWarehouseId: validWh1,
        lines: [
          {
            itemId: validItem,
            dispatchedQuantity: '10',
          },
        ],
      })
    ).rejects.toThrow('Source and destination warehouses must be different.');
  });

  it('rejects stock transfer dispatch if source available stock is insufficient', async () => {
    const mockRepo = {
      withTransaction: vi.fn(async (cb) => cb({} as any)),
      getStockTransferById: vi.fn().mockResolvedValue({
        id: 'trf-1',
        transferNumber: 'TRF-2026-0001',
        status: 'draft',
        sourceWarehouseId: validWh1,
        destinationWarehouseId: validWh2,
        lines: [
          {
            id: 'line-1',
            itemId: validItem,
            itemCode: 'DET-01',
            itemName: 'Smoke Detector',
            dispatchedQuantity: '20.0000',
          },
        ],
      }),
      ensureStockBalance: vi.fn().mockResolvedValue(null),
      getStockBalanceForUpdate: vi.fn().mockResolvedValue({
        id: 'bal-1',
        quantityOnHand: '10.0000',
        quantityReserved: '0.0000',
      }),
    } as unknown as InventoryRepository;

    const service = new InventoryService(mockRepo);

    await expect(service.dispatchStockTransfer(principal, 'trf-1')).rejects.toThrow(
      'Insufficient unreserved stock'
    );
  });

  it('allows stock reservation and releases it', async () => {
    const mockBalance = {
      id: 'bal-1',
      quantityOnHand: '100.0000',
      quantityReserved: '10.0000',
    };

    const mockRepo = {
      withTransaction: vi.fn(async (cb) => cb({} as any)),
      ensureStockBalance: vi.fn().mockResolvedValue(mockBalance),
      getStockBalanceForUpdate: vi.fn().mockResolvedValue(mockBalance),
      allocateDocumentNumber: vi.fn().mockResolvedValue('RES-2026-00001'),
      createStockReservation: vi.fn().mockResolvedValue({
        id: 'res-1',
        reservationNumber: 'RES-2026-00001',
        status: 'active',
        quantityReserved: '25.0000',
      }),
      updateStockBalanceQuantities: vi.fn().mockResolvedValue(mockBalance),
      getStockReservationById: vi.fn().mockResolvedValue({
        id: 'res-1',
        warehouseId: validWh1,
        itemId: validItem,
        quantityReserved: '25.0000',
        quantityIssued: '0.0000',
        status: 'active',
      }),
      updateStockReservationStatus: vi.fn().mockResolvedValue({
        id: 'res-1',
        status: 'released',
      }),
    } as unknown as InventoryRepository;

    const service = new InventoryService(mockRepo);

    const reservation = await service.createStockReservation(principal, {
      projectId: validProject,
      warehouseId: validWh1,
      itemId: validItem,
      quantityReserved: '25.0000',
    });

    expect(reservation?.reservationNumber).toBe('RES-2026-00001');

    const released = await service.releaseStockReservation(principal, 'res-1');
    expect(released?.status).toBe('released');
  });
});
