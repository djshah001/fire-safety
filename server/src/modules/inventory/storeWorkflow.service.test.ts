import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError } from '../../core/errors/appError.js';
import {
  purchaseExecutivePermissionCodes,
  siteEngineerPermissionCodes,
  storekeeperPermissionCodes,
} from '../../core/security/permissions.js';
import {
  auditEvents,
  deliveryChallanLines,
  deliveryChallans,
  goodsReceiptLines,
  goodsReceipts,
  items,
  materialIssueRequestLines,
  materialIssueRequests,
  notifications,
  outboxJobs,
  projectMembers,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  quotationLines,
  quotationRevisions,
  roles,
  stockBalances,
  stockLedgerEntries,
  stockLocations,
  stockReservations,
  units,
  userRoleAssignments,
  users,
  warehouseItemThresholds,
  warehouses,
} from '../../infrastructure/database/schema/index.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { ProcurementService } from '../procurement/procurement.service.js';
import { PurchaseOrderService } from '../procurement/purchaseOrder.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

vi.mock('../../infrastructure/documents/deliveryChallan.pdf.js', () => ({
  renderDeliveryChallanPdf: vi.fn(async () => Buffer.from('%PDF-1.4\n%mock-dc\n')),
}));

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const WAREHOUSE_ID = '22222222-2222-4222-8222-222222222222';
const MAIN_LOC_ID = '22222222-2222-4222-8222-222222222201';
const IN_TRANSIT_LOC_ID = '22222222-2222-4222-8222-222222222202';
const SITE_LOC_ID = '22222222-2222-4222-8222-222222222203';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const QUOTATION_REV_ID = '44444444-4444-4444-8444-444444444444';
const QUOTATION_LINE_ID = '44444444-4444-4444-8444-444444444445';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const UNIT_ID = '66666666-6666-4666-8666-666666666666';
const BRAND_A = '77777777-7777-4777-8777-777777777701';
const BRAND_B = '77777777-7777-4777-8777-777777777702';
const MIR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const MIR_LINE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const DC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const DC_LINE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const GRN_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const GRN_LINE_ID_1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const GRN_LINE_ID_2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const PO_ID_1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const PO_LINE_ID_1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const PO_ID_2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
const PO_LINE_ID_2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
const SRR_ID_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const VENDOR_ID_1 = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
const STOREKEEPER_ID = '10000000-0000-4000-8000-000000000001';
const SITE_ENG_ID = '10000000-0000-4000-8000-000000000002';
const BUYER_ID = '10000000-0000-4000-8000-000000000003';

function hasPermission(principal: AuthenticatedPrincipal, code: string) {
  return principal.grants.some((grant) => grant.permissionCode === code);
}

function makePrincipal(userId: string, permissionCodes: string[]): AuthenticatedPrincipal {
  return {
    sessionId: `sess-${userId}`,
    userId,
    companyId: COMPANY_ID,
    name: `User ${userId}`,
    email: `${userId}@example.com`,
    mustChangePassword: false,
    grants: permissionCodes.map((permissionCode) => ({
      permissionCode,
      scopeKind: 'company',
      scopeId: null,
      source: 'role',
    })),
  };
}

type TableHandler = {
  selectQueue?: unknown[][];
  selectDefault?: unknown[];
};

function createTableMockDb(handlers: Map<object, TableHandler> = new Map()) {
  const inserted = new Map<object, Record<string, unknown>[]>();
  const updated = new Map<object, Record<string, unknown>[]>();
  let idSeq = 1;

  function attachPromise<T extends Record<string, unknown>>(
    buildMethods: (target: Record<string, unknown>) => T,
    resolveValue: () => unknown,
  ): T {
    const promise = Promise.resolve().then(() => resolveValue()) as unknown as Record<string, unknown>;
    return Object.assign(promise, buildMethods(promise)) as T;
  }

  function makeSelectChain(table: object) {
    return attachPromise(
      (target) => ({
        innerJoin: () => target,
        leftJoin: () => target,
        where: () => target,
        groupBy: () => target,
        orderBy: () => target,
        limit: () => target,
        for: () => target,
      }),
      () => {
        const entry = handlers.get(table);
        return entry?.selectQueue && entry.selectQueue.length > 0
          ? (entry.selectQueue.shift() ?? [])
          : (entry?.selectDefault ?? []);
      },
    );
  }

  const executor: Record<string, unknown> = {
    select: (_fields?: unknown) => ({
      from: (table: object) => makeSelectChain(table),
    }),
    selectDistinct: (_fields?: unknown) => ({
      from: (table: object) => makeSelectChain(table),
    }),
    insert: (table: object) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = (Array.isArray(values) ? values : [values]).map((row) => ({
          id: `00000000-0000-4000-8000-${String(idSeq++).padStart(12, '0')}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(table === deliveryChallans ? { dispatchedAt: new Date(), status: 'dispatched' } : {}),
          ...(table === stockReservations ? { status: 'active' } : {}),
          ...row,
        }));
        const existing = inserted.get(table) ?? [];
        existing.push(...rows);
        inserted.set(table, existing);

        return attachPromise(
          (target) => ({
            onConflictDoNothing: () => target,
            onConflictDoUpdate: () => target,
            returning: () => Promise.resolve(rows.map((r) => ({ lastValue: 1, ...r }))),
          }),
          () => rows,
        );
      },
    }),
    update: (table: object) => ({
      set: (values: Record<string, unknown>) => {
        const existing = updated.get(table) ?? [];
        existing.push(values);
        updated.set(table, existing);
        const rows = [{ id: `mock-upd-${idSeq++}`, ...values }];
        return attachPromise(
          (target) => ({
            where: () => target,
            returning: () => Promise.resolve(rows),
          }),
          () => rows,
        );
      },
    }),
    delete: (_table: object) =>
      attachPromise(
        (target) => ({
          where: () => target,
          returning: () => Promise.resolve([]),
        }),
        () => [],
      ),
    execute: async () => ({ rows: [] }),
  };

  executor.transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(executor);

  return {
    db: executor,
    inserted,
    updated,
  };
}

function makeInventoryService(
  db: unknown,
  overrides?: {
    ensureStockBalanceResult?: Record<string, unknown> | ((params: { locationId: string; brandOfferingId?: string | null }) => Record<string, unknown>);
    grnLineForPosting?: Record<string, unknown> | null;
  },
) {
  const repo = new InventoryRepository(db as never);
  vi.spyOn(repo, 'ensureWarehouseSystemLocations').mockResolvedValue({
    mainLocation: {
      id: MAIN_LOC_ID,
      companyId: COMPANY_ID,
      warehouseId: WAREHOUSE_ID,
      code: 'MAIN',
      name: 'Main Store',
      locationType: 'main',
      projectId: null,
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never,
    inTransitLocation: {
      id: IN_TRANSIT_LOC_ID,
      companyId: COMPANY_ID,
      warehouseId: WAREHOUSE_ID,
      code: 'IN_TRANSIT',
      name: 'In-Transit Dispatch Staging',
      locationType: 'in_transit',
      projectId: null,
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never,
  });
  vi.spyOn(repo, 'ensureProjectSiteLocation').mockResolvedValue({
    id: SITE_LOC_ID,
    companyId: COMPANY_ID,
    warehouseId: WAREHOUSE_ID,
    code: `SITE-${PROJECT_ID.slice(0, 8)}`,
    name: 'Project Site Store',
    locationType: 'site',
    projectId: PROJECT_ID,
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
  if (overrides?.ensureStockBalanceResult !== undefined) {
    const resolver = overrides.ensureStockBalanceResult;
    vi.spyOn(repo, 'ensureStockBalance').mockImplementation(async (_companyId, _warehouseId, _itemId, opts) => {
      const val = typeof resolver === 'function' ? resolver(opts as never) : resolver;
      return val as never;
    });
  }
  if (overrides?.grnLineForPosting !== undefined) {
    vi.spyOn(repo, 'getGoodsReceiptLineForPosting').mockResolvedValue(overrides.grnLineForPosting as never);
  }
  return new InventoryService(repo);
}

describe('Store & Procurement integrated workflows', () => {
  it('enforces strict role separation between Store, Site, and Purchase', async () => {
    const storekeeper = makePrincipal(STOREKEEPER_ID, storekeeperPermissionCodes);
    const siteEngineer = makePrincipal(SITE_ENG_ID, siteEngineerPermissionCodes);
    const purchaseExec = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);

    expect(hasPermission(purchaseExec, 'inventory.stock.read')).toBe(true);
    expect(hasPermission(purchaseExec, 'inventory.request.create')).toBe(true);
    expect(hasPermission(storekeeper, 'procurement.po.create')).toBe(false);
    expect(hasPermission(storekeeper, 'procurement.requisition.create')).toBe(false);

    const { db } = createTableMockDb();
    const procurementService = new ProcurementService(db as never);
    const purchaseOrderService = new PurchaseOrderService(db as never);

    await expect(
      procurementService.createRequisitionFromFulfillmentPlan(
        storekeeper,
        {
          quotationRevisionId: QUOTATION_REV_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [
            {
              quotationLineId: QUOTATION_LINE_ID,
              itemId: ITEM_ID,
              unitId: UNIT_ID,
              projectShortageQty: '5',
              storeReplenishmentQty: '0',
            },
          ],
        },
        'req-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      procurementService.createRequisitionFromSrr(
        siteEngineer,
        { replenishmentRequestIds: [SRR_ID_1] },
        'req-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      purchaseOrderService.createDirect(
        storekeeper,
        {
          projectId: PROJECT_ID,
          vendorId: VENDOR_ID_1,
          title: 'Unauthorized Store Direct PO',
          currency: 'INR',
          paymentTerms: '30 days',
          deliveryTerms: 'Ex-Works',
          deliveryLocation: 'Central Store',
          lines: [
            {
              itemId: ITEM_ID,
              itemCodeSnapshot: 'HYD-01',
              itemNameSnapshot: 'Hydrant Valve',
              specificationSnapshot: 'Standard UL/FM',
              brandOffered: 'Brand A',
              unitId: UNIT_ID,
              unitSymbolSnapshot: 'Nos',
              quantity: '10',
              unitRate: '100',
            },
          ],
        },
        'req-3',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const purchaseReadMock = createTableMockDb(new Map([[stockBalances, { selectDefault: [] }]]));
    const invReadSvc = makeInventoryService(purchaseReadMock.db);
    await expect(invReadSvc.listStockBalances(purchaseExec, {})).resolves.toEqual([]);
  });

  it('enforces brand-exact stock isolation when creating an MIR', async () => {
    const purchaseExec = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);
    const handlers = new Map<object, TableHandler>([
      [projects, { selectDefault: [{ id: PROJECT_ID, companyId: COMPANY_ID }] }],
      [warehouses, { selectDefault: [{ id: WAREHOUSE_ID, companyId: COMPANY_ID, isActive: 1 }] }],
      [
        quotationRevisions,
        { selectDefault: [{ id: QUOTATION_REV_ID, companyId: COMPANY_ID, status: 'accepted' }] },
      ],
      [
        quotationLines,
        {
          selectQueue: [
            // First test: Quotation specifies BRAND_A; requesting BRAND_B must be rejected
            [
              {
                qLine: { id: QUOTATION_LINE_ID, offeringId: BRAND_A, quantity: '10.0000' },
                quotationLine: { id: QUOTATION_LINE_ID, offeringId: BRAND_A, quantity: '10.0000' },
                boqLine: { id: 'boq-1', itemId: ITEM_ID, unitId: UNIT_ID },
              },
            ],
            // Second test: Quotation specifies BRAND_B; warehouse only has stock for BRAND_A (BRAND_B = 0)
            [
              {
                qLine: { id: QUOTATION_LINE_ID, offeringId: BRAND_B, quantity: '10.0000' },
                quotationLine: { id: QUOTATION_LINE_ID, offeringId: BRAND_B, quantity: '10.0000' },
                boqLine: { id: 'boq-1', itemId: ITEM_ID, unitId: UNIT_ID },
              },
            ],
          ],
        },
      ],
      [stockBalances, { selectDefault: [{ id: 'bal-brand-check', quantityOnHand: '0.0000', quantityReserved: '0.0000' }] }],
      [users, { selectDefault: [] }],
    ]);
    const { db } = createTableMockDb(handlers);
    const inventoryService = makeInventoryService(db, {
      ensureStockBalanceResult: (opts) => ({
        id: 'bal-brand-check',
        quantityOnHand: opts.brandOfferingId === BRAND_A ? '50.0000' : '0.0000',
        quantityReserved: '0.0000',
      }),
    });

    // 1. Wrong brand compared to Quotation
    await expect(
      inventoryService.createMir(purchaseExec, {
        projectId: PROJECT_ID,
        quotationRevisionId: QUOTATION_REV_ID,
        warehouseId: WAREHOUSE_ID,
        lines: [
          {
            quotationLineId: QUOTATION_LINE_ID,
            itemId: ITEM_ID,
            brandOfferingId: BRAND_B,
            unitId: UNIT_ID,
            requestedQty: '5',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // 2. Quotation specifies BRAND_B, Store only stocks BRAND_A -> BRAND_B has 0 free stock -> 409 ConflictError
    await expect(
      inventoryService.createMir(purchaseExec, {
        projectId: PROJECT_ID,
        quotationRevisionId: QUOTATION_REV_ID,
        warehouseId: WAREHOUSE_ID,
        lines: [
          {
            quotationLineId: QUOTATION_LINE_ID,
            itemId: ITEM_ID,
            brandOfferingId: BRAND_B,
            unitId: UNIT_ID,
            requestedQty: '5',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('deduplicates low-stock alerts and resets only when effective stock reaches minStock', async () => {
    // 1. Trigger alert when effectiveStock (4) < minStock (10)
    const handlers1 = new Map<object, TableHandler>([
      [
        warehouseItemThresholds,
        {
          selectDefault: [
            {
              id: 'thr-1',
              companyId: COMPANY_ID,
              warehouseId: WAREHOUSE_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              minStock: '10.0000',
              maxStock: '50.0000',
              lowStockAlertActive: false,
              rowVersion: 1,
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectQueue: [
            [{ id: MAIN_LOC_ID, locationType: 'main' }],
            [{ id: IN_TRANSIT_LOC_ID, locationType: 'in_transit' }],
          ],
        },
      ],
      [
        stockBalances,
        {
          selectQueue: [
            [{ quantityOnHand: '4.0000', quantityReserved: '0.0000' }],
            [],
          ],
        },
      ],
      [items, { selectDefault: [{ code: 'ITM-01', name: 'Sprinkler Head' }] }],
      [users, { selectDefault: [{ id: 'sk-1' }, { id: 'pm-1' }] }],
      [userRoleAssignments, { selectDefault: [] }],
      [roles, { selectDefault: [] }],
    ]);
    const mock1 = createTableMockDb(handlers1);
    const svc1 = makeInventoryService(mock1.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === MAIN_LOC_ID ? 'bal-main' : 'bal-transit',
        quantityOnHand: opts.locationId === MAIN_LOC_ID ? '4.0000' : '0.0000',
        quantityReserved: '0.0000',
      }),
    });
    await svc1.evaluateLowStockThresholds(mock1.db as never, COMPANY_ID, WAREHOUSE_ID, [
      { itemId: ITEM_ID, brandOfferingId: BRAND_A },
    ]);

    expect(mock1.updated.get(warehouseItemThresholds)).toHaveLength(1);
    expect(mock1.updated.get(warehouseItemThresholds)?.[0]?.lowStockAlertActive).toBe(true);
    const outbox1 = mock1.inserted.get(outboxJobs) ?? [];
    expect(outbox1).toHaveLength(1);
    expect(outbox1[0]).toMatchObject({
      type: 'inventory.low_stock_alert',
      payload: {
        warehouseId: WAREHOUSE_ID,
        itemId: ITEM_ID,
        brandOfferingId: BRAND_A,
        effectiveStock: '4.0000',
        minStock: '10.0000',
        maxStock: '50.0000',
      },
    });
    expect(mock1.inserted.get(notifications)).toHaveLength(2);

    // 2. Re-evaluate while still < minStock and lowStockAlertActive=true -> NO duplicate alert
    const handlers2 = new Map<object, TableHandler>([
      [
        warehouseItemThresholds,
        {
          selectDefault: [
            {
              id: 'thr-1',
              companyId: COMPANY_ID,
              warehouseId: WAREHOUSE_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              minStock: '10.0000',
              maxStock: '50.0000',
              lowStockAlertActive: true,
              rowVersion: 2,
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectQueue: [
            [{ id: MAIN_LOC_ID, locationType: 'main' }],
            [{ id: IN_TRANSIT_LOC_ID, locationType: 'in_transit' }],
          ],
        },
      ],
      [
        stockBalances,
        {
          selectQueue: [
            [{ quantityOnHand: '2.0000', quantityReserved: '0.0000' }],
            [],
          ],
        },
      ],
    ]);
    const mock2 = createTableMockDb(handlers2);
    const svc2 = makeInventoryService(mock2.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === MAIN_LOC_ID ? 'bal-main' : 'bal-transit',
        quantityOnHand: opts.locationId === MAIN_LOC_ID ? '2.0000' : '0.0000',
        quantityReserved: '0.0000',
      }),
    });
    await svc2.evaluateLowStockThresholds(mock2.db as never, COMPANY_ID, WAREHOUSE_ID, [
      { itemId: ITEM_ID, brandOfferingId: BRAND_A },
    ]);
    expect(mock2.inserted.get(outboxJobs) ?? []).toHaveLength(0);
    expect(mock2.inserted.get(notifications) ?? []).toHaveLength(0);

    // 3. Replenished >= minStock -> resets lowStockAlertActive = false
    const handlers3 = new Map<object, TableHandler>([
      [
        warehouseItemThresholds,
        {
          selectDefault: [
            {
              id: 'thr-1',
              companyId: COMPANY_ID,
              warehouseId: WAREHOUSE_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              minStock: '10.0000',
              maxStock: '50.0000',
              lowStockAlertActive: true,
              rowVersion: 2,
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectQueue: [
            [{ id: MAIN_LOC_ID, locationType: 'main' }],
            [{ id: IN_TRANSIT_LOC_ID, locationType: 'in_transit' }],
          ],
        },
      ],
      [
        stockBalances,
        {
          selectQueue: [
            [{ quantityOnHand: '15.0000', quantityReserved: '0.0000' }],
            [],
          ],
        },
      ],
    ]);
    const mock3 = createTableMockDb(handlers3);
    const svc3 = makeInventoryService(mock3.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === MAIN_LOC_ID ? 'bal-main' : 'bal-transit',
        quantityOnHand: opts.locationId === MAIN_LOC_ID ? '15.0000' : '0.0000',
        quantityReserved: '0.0000',
      }),
    });
    await svc3.evaluateLowStockThresholds(mock3.db as never, COMPANY_ID, WAREHOUSE_ID, [
      { itemId: ITEM_ID, brandOfferingId: BRAND_A },
    ]);
    expect(mock3.updated.get(warehouseItemThresholds)?.[0]?.lowStockAlertActive).toBe(false);
    expect(mock3.inserted.get(outboxJobs) ?? []).toHaveLength(0);
  });

  it('dispatches MIR -> DC (MAIN to IN_TRANSIT), blocks self-POD, requires photo, tracks damage & resolves discrepancy', async () => {
    const storekeeper = makePrincipal(STOREKEEPER_ID, storekeeperPermissionCodes);
    const siteEngineer = makePrincipal(SITE_ENG_ID, siteEngineerPermissionCodes);
    const admin = makePrincipal(STOREKEEPER_ID, ['system.access.all']);

    // Step A: Dispatch MIR (10 reserved units from MAIN -> IN_TRANSIT)
    const dispatchHandlers = new Map<object, TableHandler>([
      [
        materialIssueRequests,
        {
          selectDefault: [
            {
              id: MIR_ID,
              mirNumber: 'MIR-2026-00001',
              companyId: COMPANY_ID,
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              status: 'open',
              rowVersion: 1,
            },
          ],
        },
      ],
      [
        materialIssueRequestLines,
        {
          selectQueue: [
            [
              {
                id: MIR_LINE_ID,
                mirId: MIR_ID,
                lineNumber: 1,
                itemId: ITEM_ID,
                brandOfferingId: BRAND_A,
                unitId: UNIT_ID,
                reservationId: 'res-1',
                stockReservationId: 'res-1',
                requestedQty: '10.0000',
                dispatchedQty: '0.0000',
                verifiedAtSiteQty: '0.0000',
              },
            ],
            [{ id: MIR_LINE_ID, requestedQty: '10.0000', dispatchedQty: '10.0000' }],
          ],
        },
      ],
      [
        stockLocations,
        {
          selectQueue: [
            [{ id: MAIN_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'main' }],
            [{ id: IN_TRANSIT_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'in_transit' }],
          ],
        },
      ],
      [
        stockBalances,
        {
          selectQueue: [
            [
              {
                id: 'bal-main',
                quantityOnHand: '10.0000',
                quantityReserved: '10.0000',
              },
            ],
            [
              {
                id: 'bal-transit',
                quantityOnHand: '0.0000',
                quantityReserved: '0.0000',
              },
            ],
          ],
        },
      ],
      [
        stockReservations,
        {
          selectDefault: [
            {
              id: 'res-1',
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              quantityReserved: '10.0000',
              quantityIssued: '0.0000',
              status: 'active',
            },
          ],
        },
      ],
      [warehouses, { selectDefault: [{ id: WAREHOUSE_ID, code: 'WH-1', name: 'Central Store' }] }],
      [projects, { selectDefault: [{ id: PROJECT_ID, projectNumber: 'PRJ-01', title: 'Plant Hydrant' }] }],
      [users, { selectDefault: [{ id: STOREKEEPER_ID, name: 'Storekeeper One' }] }],
      [items, { selectDefault: [{ id: ITEM_ID, code: 'HYD-01', name: 'Hydrant Valve' }] }],
      [units, { selectDefault: [{ id: UNIT_ID, symbol: 'Nos' }] }],
      [projectMembers, { selectDefault: [{ userId: SITE_ENG_ID, role: 'site_engineer' }] }],
      [
        deliveryChallans,
        {
          selectDefault: [
            {
              id: DC_ID,
              dcNumber: 'DC-2026-00001',
              companyId: COMPANY_ID,
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              status: 'dispatched',
              dispatchedByUserId: STOREKEEPER_ID,
              rowVersion: 1,
            },
          ],
        },
      ],
    ]);
    const dispatchMock = createTableMockDb(dispatchHandlers);
    const dispatchSvc = makeInventoryService(dispatchMock.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === MAIN_LOC_ID ? 'bal-main' : 'bal-transit',
        quantityOnHand: opts.locationId === MAIN_LOC_ID ? '10.0000' : '0.0000',
        quantityReserved: opts.locationId === MAIN_LOC_ID ? '10.0000' : '0.0000',
      }),
    });
    const dc = await dispatchSvc.dispatchMir(storekeeper, MIR_ID, {
      lines: [{ mirLineId: MIR_LINE_ID, dispatchedQty: '10' }],
      vehicleNumber: 'MH-12-AB-1234',
    });
    expect(dc).toBeDefined();
    expect(dispatchMock.inserted.get(deliveryChallans)).toHaveLength(1);
    expect(dispatchMock.inserted.get(stockLedgerEntries)).toHaveLength(2);
    expect(dispatchMock.updated.get(stockReservations)?.[0]).toMatchObject({
      quantityIssued: '10.0000',
      status: 'fulfilled',
    });

    // Step B: Missing POD photo fails with 422
    const emptyPhotoSvc = makeInventoryService(createTableMockDb().db);
    await expect(
      emptyPhotoSvc.verifyPod(
        siteEngineer,
        DC_ID,
        {
          rowVersion: 1,
          lines: [{ dcLineId: DC_LINE_ID, verifiedReceivedQty: '10', damagedOrShortQty: '0' }],
        },
        null as never,
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    // Step C: Dispatching user (non-admin) cannot self-verify POD
    const selfVerifyHandlers = new Map<object, TableHandler>([
      [
        deliveryChallans,
        {
          selectDefault: [
            {
              id: DC_ID,
              dcNumber: 'DC-2026-00001',
              companyId: COMPANY_ID,
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              mirId: MIR_ID,
              status: 'dispatched',
              dispatchedByUserId: STOREKEEPER_ID,
              rowVersion: 1,
            },
          ],
        },
      ],
    ]);
    const selfVerifySvc = makeInventoryService(createTableMockDb(selfVerifyHandlers).db);
    await expect(
      selfVerifySvc.verifyPod(
        storekeeper,
        DC_ID,
        {
          rowVersion: 1,
          lines: [{ dcLineId: DC_LINE_ID, verifiedReceivedQty: '10', damagedOrShortQty: '0' }],
        },
        { storageName: 'pod.jpg', checksumSha256: 'abc' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Step D: Mismatched quantities (verified + damaged != dispatched) -> 422
    const mismatchHandlers = new Map<object, TableHandler>([
      [
        deliveryChallans,
        {
          selectDefault: [
            {
              id: DC_ID,
              dcNumber: 'DC-2026-00001',
              companyId: COMPANY_ID,
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              mirId: MIR_ID,
              status: 'dispatched',
              dispatchedByUserId: STOREKEEPER_ID,
              rowVersion: 1,
            },
          ],
        },
      ],
      [
        deliveryChallanLines,
        {
          selectDefault: [
            {
              id: DC_LINE_ID,
              dcId: DC_ID,
              mirLineId: MIR_LINE_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              unitId: UNIT_ID,
              dispatchedQty: '10.0000',
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectDefault: [
            { id: IN_TRANSIT_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'in_transit' },
          ],
        },
      ],
    ]);
    const mismatchSvc = makeInventoryService(createTableMockDb(mismatchHandlers).db);
    await expect(
      mismatchSvc.verifyPod(
        siteEngineer,
        DC_ID,
        {
          rowVersion: 1,
          lines: [{ dcLineId: DC_LINE_ID, verifiedReceivedQty: '8', damagedOrShortQty: '1' }],
        },
        { storageName: 'pod.jpg', checksumSha256: 'abc' },
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    // Step E: Partial damage by independent Site Engineer -> discrepancy_pending & 7 moved to SITE
    const partialHandlers = new Map<object, TableHandler>([
      [
        deliveryChallans,
        {
          selectDefault: [
            {
              id: DC_ID,
              dcNumber: 'DC-2026-00001',
              companyId: COMPANY_ID,
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              mirId: MIR_ID,
              status: 'dispatched',
              dispatchedByUserId: STOREKEEPER_ID,
              rowVersion: 1,
            },
          ],
        },
      ],
      [
        deliveryChallanLines,
        {
          selectDefault: [
            {
              id: DC_LINE_ID,
              dcId: DC_ID,
              mirLineId: MIR_LINE_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              unitId: UNIT_ID,
              dispatchedQty: '10.0000',
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectQueue: [
            [{ id: IN_TRANSIT_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'in_transit' }],
            [{ id: SITE_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'site', projectId: PROJECT_ID }],
          ],
        },
      ],
      [
        stockBalances,
        {
          selectQueue: [
            [{ id: 'bal-transit', quantityOnHand: '10.0000', quantityReserved: '0.0000' }],
            [{ id: 'bal-site', quantityOnHand: '0.0000', quantityReserved: '0.0000' }],
          ],
        },
      ],
      [
        materialIssueRequestLines,
        {
          selectDefault: [
            {
              id: MIR_LINE_ID,
              requestedQty: '10.0000',
              dispatchedQty: '10.0000',
              verifiedQty: '7.0000',
              verifiedAtSiteQty: '7.0000',
              verifiedDamagedQty: '3.0000',
              verifiedReceivedQty: '7.0000',
              shortClosedQty: '0.0000',
            },
          ],
        },
      ],
      [materialIssueRequests, { selectDefault: [{ id: MIR_ID, rowVersion: 2 }] }],
      [warehouseItemThresholds, { selectDefault: [] }],
      [projectMembers, { selectDefault: [{ userId: 'pm-1', role: 'project_manager' }] }],
      [users, { selectDefault: [{ id: 'pm-1' }] }],
    ]);
    const partialMock = createTableMockDb(partialHandlers);
    const partialSvc = makeInventoryService(partialMock.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === IN_TRANSIT_LOC_ID ? 'bal-transit' : 'bal-site',
        quantityOnHand: opts.locationId === IN_TRANSIT_LOC_ID ? '10.0000' : '0.0000',
        quantityReserved: '0.0000',
      }),
    });
    await partialSvc.verifyPod(
      siteEngineer,
      DC_ID,
      {
        rowVersion: 1,
        lines: [{ dcLineId: DC_LINE_ID, verifiedReceivedQty: '7', damagedOrShortQty: '3' }],
      },
      { storageName: 'signed-pod.jpg', checksumSha256: 'sha256-pod' },
    );
    expect(partialMock.updated.get(deliveryChallans)?.[0]).toMatchObject({
      status: 'discrepancy_pending',
      podPhotoStorageName: 'signed-pod.jpg',
    });
    expect(partialMock.inserted.get(stockLedgerEntries)).toHaveLength(2);

    // Step F: Admin override allowed when same user is system_admin
    const adminOverrideMock = createTableMockDb(
      new Map<object, TableHandler>([
        [
          deliveryChallans,
          {
            selectDefault: [
              {
                id: DC_ID,
                dcNumber: 'DC-2026-00001',
                companyId: COMPANY_ID,
                projectId: PROJECT_ID,
                warehouseId: WAREHOUSE_ID,
                mirId: MIR_ID,
                status: 'dispatched',
                dispatchedByUserId: STOREKEEPER_ID,
                rowVersion: 1,
              },
            ],
          },
        ],
        [
          deliveryChallanLines,
          {
            selectDefault: [
              {
                id: DC_LINE_ID,
                dcId: DC_ID,
                mirLineId: MIR_LINE_ID,
                itemId: ITEM_ID,
                brandOfferingId: BRAND_A,
                unitId: UNIT_ID,
                dispatchedQty: '10.0000',
              },
            ],
          },
        ],
        [
          stockLocations,
          {
            selectQueue: [
              [{ id: IN_TRANSIT_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'in_transit' }],
              [{ id: SITE_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'site', projectId: PROJECT_ID }],
            ],
          },
        ],
        [
          stockBalances,
          {
            selectQueue: [
              [{ id: 'bal-transit', quantityOnHand: '10.0000', quantityReserved: '0.0000' }],
              [{ id: 'bal-site', quantityOnHand: '0.0000', quantityReserved: '0.0000' }],
            ],
          },
        ],
        [
          materialIssueRequestLines,
          {
            selectDefault: [
              {
                id: MIR_LINE_ID,
                requestedQty: '10.0000',
                dispatchedQty: '10.0000',
                verifiedQty: '10.0000',
                verifiedAtSiteQty: '10.0000',
                verifiedDamagedQty: '0.0000',
                verifiedReceivedQty: '10.0000',
                shortClosedQty: '0.0000',
              },
            ],
          },
        ],
        [materialIssueRequests, { selectDefault: [{ id: MIR_ID, rowVersion: 2 }] }],
        [warehouseItemThresholds, { selectDefault: [] }],
      ]),
    );
    const adminSvc = makeInventoryService(adminOverrideMock.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === IN_TRANSIT_LOC_ID ? 'bal-transit' : 'bal-site',
        quantityOnHand: opts.locationId === IN_TRANSIT_LOC_ID ? '10.0000' : '0.0000',
        quantityReserved: '0.0000',
      }),
    });
    await adminSvc.verifyPod(
      admin,
      DC_ID,
      {
        rowVersion: 1,
        lines: [{ dcLineId: DC_LINE_ID, verifiedReceivedQty: '10', damagedOrShortQty: '0' }],
      },
      { storageName: 'admin-pod.jpg', checksumSha256: 'sha-admin' },
    );
    expect(adminOverrideMock.inserted.get(auditEvents)?.[0]?.metadata).toMatchObject({
      administratorOverride: true,
    });

    // Step G: Resolve discrepancy with return_to_store -> storekeeper cannot self-resolve; authorized resolver returns 3 from IN_TRANSIT to MAIN
    const resolveHandlers = new Map<object, TableHandler>([
      [
        deliveryChallans,
        {
          selectDefault: [
            {
              id: DC_ID,
              dcNumber: 'DC-2026-00001',
              companyId: COMPANY_ID,
              projectId: PROJECT_ID,
              warehouseId: WAREHOUSE_ID,
              status: 'discrepancy_pending',
              rowVersion: 2,
            },
          ],
        },
      ],
      [
        deliveryChallanLines,
        {
          selectDefault: [
            {
              id: DC_LINE_ID,
              dcId: DC_ID,
              itemId: ITEM_ID,
              brandOfferingId: BRAND_A,
              unitId: UNIT_ID,
              dispatchedQty: '10.0000',
              verifiedReceivedQty: '7.0000',
              damagedOrShortQty: '3.0000',
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectQueue: [
            [{ id: IN_TRANSIT_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'in_transit' }],
            [{ id: MAIN_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'main' }],
          ],
        },
      ],
      [
        stockBalances,
        {
          selectQueue: [
            [{ id: 'bal-transit', quantityOnHand: '3.0000', quantityReserved: '0.0000' }],
            [{ id: 'bal-main', quantityOnHand: '20.0000', quantityReserved: '0.0000' }],
          ],
        },
      ],
      [warehouseItemThresholds, { selectDefault: [] }],
      [warehouses, { selectDefault: [{ id: WAREHOUSE_ID, name: 'Central Store' }] }],
      [projects, { selectDefault: [{ id: PROJECT_ID, projectNumber: 'PRJ-01', title: 'Plant Hydrant' }] }],
      [materialIssueRequests, { selectDefault: [{ id: MIR_ID, mirNumber: 'MIR-2026-00001' }] }],
      [users, { selectDefault: [{ id: STOREKEEPER_ID, name: 'Storekeeper One' }] }],
    ]);
    const resolveMock = createTableMockDb(resolveHandlers);
    const resolveSvc = makeInventoryService(resolveMock.db, {
      ensureStockBalanceResult: (opts) => ({
        id: opts.locationId === IN_TRANSIT_LOC_ID ? 'bal-transit' : 'bal-main',
        quantityOnHand: opts.locationId === IN_TRANSIT_LOC_ID ? '3.0000' : '20.0000',
        quantityReserved: '0.0000',
      }),
    });
    const resolver = makePrincipal('10000000-0000-4000-8000-000000000004', [
      'inventory.discrepancy.resolve',
      'inventory.stock.read',
    ]);
    await expect(
      resolveSvc.resolveDiscrepancy(storekeeper, DC_ID, {
        rowVersion: 2,
        resolution: 'return_to_store',
        resolutionNotes: 'Unauthorized resolver check',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await resolveSvc.resolveDiscrepancy(resolver, DC_ID, {
      rowVersion: 2,
      resolution: 'return_to_store',
      resolutionNotes: '3 damaged valves returned to store quarantine bin',
    });
    expect(resolveMock.updated.get(deliveryChallans)?.[0]).toMatchObject({ status: 'resolved' });
    const resolveLedger = resolveMock.inserted.get(stockLedgerEntries) ?? [];
    expect(resolveLedger).toHaveLength(2);
    expect(resolveLedger[0]).toMatchObject({ sourceType: 'dc_discrepancy_return', direction: 'out', quantity: '3.0000' });
    expect(resolveLedger[1]).toMatchObject({ sourceType: 'dc_discrepancy_return', direction: 'in', quantity: '3.0000' });
  });

  it('auto-reserves project allocation on Split-PO GRN and routes direct_to_site PO GRN to SITE', async () => {
    const storekeeper = makePrincipal(STOREKEEPER_ID, storekeeperPermissionCodes);

    // 1. Split PO into central warehouse (10 accepted: 6 project allocation + 4 store replenishment)
    const splitHandlers = new Map<object, TableHandler>([
      [warehouses, { selectDefault: [{ id: WAREHOUSE_ID, companyId: COMPANY_ID, isActive: 1 }] }],
      [
        goodsReceiptLines,
        {
          selectDefault: [
            {
              grnLine: {
                id: GRN_LINE_ID_1,
                companyId: COMPANY_ID,
                acceptedQuantity: '10.0000',
                unitCost: '500.00',
                itemId: ITEM_ID,
                unitId: UNIT_ID,
                brandOfferingId: BRAND_A,
                postedToInventory: 0,
                goodsReceiptId: GRN_ID,
                purchaseOrderLineId: PO_LINE_ID_1,
              },
              receipt: { id: GRN_ID, receiptNumber: 'GRN-2026-00001' },
              poLine: {
                id: PO_LINE_ID_1,
                purchaseOrderId: PO_ID_1,
                projectAllocationQty: '6.0000',
                storeReplenishmentQty: '4.0000',
                allocatedReceivedQty: '0.0000',
                storeReceivedQty: '0.0000',
                destinationType: 'warehouse',
              },
              po: {
                id: PO_ID_1,
                poNumber: 'PO-2026-00001',
                projectId: PROJECT_ID,
              },
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectDefault: [{ id: MAIN_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'main' }],
        },
      ],
      [stockBalances, { selectDefault: [{ id: 'bal-main', quantityOnHand: '0.0000', quantityReserved: '0.0000' }] }],
      [warehouseItemThresholds, { selectDefault: [] }],
    ]);
    const splitMock = createTableMockDb(splitHandlers);
    const splitSvc = makeInventoryService(splitMock.db, {
      ensureStockBalanceResult: {
        id: 'bal-main',
        quantityOnHand: '0.0000',
        quantityReserved: '0.0000',
      },
      grnLineForPosting: {
        id: GRN_LINE_ID_1,
        companyId: COMPANY_ID,
        acceptedQuantity: '10.0000',
        unitCost: '500.00',
        itemId: ITEM_ID,
        unitId: UNIT_ID,
        brandOfferingId: BRAND_A,
        postedToInventory: 0,
        goodsReceiptId: GRN_ID,
        receiptNumber: 'GRN-2026-00001',
        purchaseOrderLineId: PO_LINE_ID_1,
        purchaseOrderId: PO_ID_1,
        poNumber: 'PO-2026-00001',
        poProjectId: PROJECT_ID,
        poLineId: PO_LINE_ID_1,
        projectAllocationQty: '6.0000',
        storeReplenishmentQty: '4.0000',
        allocatedReceivedQty: '0.0000',
        storeReceivedQty: '0.0000',
        destinationType: 'warehouse',
      },
    });
    await splitSvc.postGoodsReceiptToInventory(storekeeper, {
      warehouseId: WAREHOUSE_ID,
      goodsReceiptLineId: GRN_LINE_ID_1,
    });

    const reservations = splitMock.inserted.get(stockReservations) ?? [];
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      projectId: PROJECT_ID,
      warehouseId: WAREHOUSE_ID,
      itemId: ITEM_ID,
      brandOfferingId: BRAND_A,
      quantityReserved: '6.0000',
      status: 'active',
    });
    expect(splitMock.updated.get(purchaseOrderLines)?.[0]).toMatchObject({
      allocatedReceivedQty: '6.0000',
      storeReceivedQty: '4.0000',
    });

    // 2. Direct-to-Site PO posts directly into SITE location without touching Store stock reservation
    const directHandlers = new Map<object, TableHandler>([
      [warehouses, { selectDefault: [{ id: WAREHOUSE_ID, companyId: COMPANY_ID, isActive: 1 }] }],
      [
        goodsReceiptLines,
        {
          selectDefault: [
            {
              grnLine: {
                id: GRN_LINE_ID_2,
                companyId: COMPANY_ID,
                acceptedQuantity: '8.0000',
                unitCost: '400.00',
                itemId: ITEM_ID,
                unitId: UNIT_ID,
                brandOfferingId: BRAND_A,
                postedToInventory: 0,
                goodsReceiptId: GRN_ID,
                purchaseOrderLineId: PO_LINE_ID_2,
              },
              receipt: { id: GRN_ID, receiptNumber: 'GRN-2026-00002' },
              poLine: {
                id: PO_LINE_ID_2,
                purchaseOrderId: PO_ID_2,
                projectAllocationQty: '8.0000',
                storeReplenishmentQty: '0.0000',
                allocatedReceivedQty: '0.0000',
                storeReceivedQty: '0.0000',
                destinationType: 'direct_to_site',
              },
              po: {
                id: PO_ID_2,
                poNumber: 'PO-2026-00002',
                projectId: PROJECT_ID,
              },
            },
          ],
        },
      ],
      [
        stockLocations,
        {
          selectDefault: [{ id: SITE_LOC_ID, companyId: COMPANY_ID, warehouseId: WAREHOUSE_ID, locationType: 'site', projectId: PROJECT_ID }],
        },
      ],
      [stockBalances, { selectDefault: [{ id: 'bal-site', quantityOnHand: '0.0000', quantityReserved: '0.0000' }] }],
      [warehouseItemThresholds, { selectDefault: [] }],
      [goodsReceipts, { selectDefault: [] }],
      [purchaseOrders, { selectDefault: [] }],
    ]);
    const directMock = createTableMockDb(directHandlers);
    const directSvc = makeInventoryService(directMock.db, {
      ensureStockBalanceResult: {
        id: 'bal-site',
        quantityOnHand: '0.0000',
        quantityReserved: '0.0000',
      },
      grnLineForPosting: {
        id: GRN_LINE_ID_2,
        companyId: COMPANY_ID,
        acceptedQuantity: '8.0000',
        unitCost: '400.00',
        itemId: ITEM_ID,
        unitId: UNIT_ID,
        brandOfferingId: BRAND_A,
        postedToInventory: 0,
        goodsReceiptId: GRN_ID,
        receiptNumber: 'GRN-2026-00002',
        purchaseOrderLineId: PO_LINE_ID_2,
        purchaseOrderId: PO_ID_2,
        poNumber: 'PO-2026-00002',
        poProjectId: PROJECT_ID,
        poLineId: PO_LINE_ID_2,
        projectAllocationQty: '8.0000',
        storeReplenishmentQty: '0.0000',
        allocatedReceivedQty: '0.0000',
        storeReceivedQty: '0.0000',
        destinationType: 'direct_to_site',
      },
    });
    await directSvc.postGoodsReceiptToInventory(storekeeper, {
      warehouseId: WAREHOUSE_ID,
      goodsReceiptLineId: GRN_LINE_ID_2,
    });
    expect(directMock.inserted.get(stockReservations) ?? []).toHaveLength(0);
    expect(directMock.inserted.get(stockLedgerEntries)?.[0]).toMatchObject({
      locationId: SITE_LOC_ID,
      direction: 'in',
      quantity: '8.0000',
    });
    expect(directMock.updated.get(purchaseOrderLines)?.[0]).toMatchObject({
      allocatedReceivedQty: '8.0000',
      storeReceivedQty: '0.0000',
    });
  });
});
