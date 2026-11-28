import { describe, expect, it } from 'vitest';
import { purchaseExecutivePermissionCodes } from '../../core/security/permissions.js';
import {
  deliveryChallanLines,
  itemBrandOfferings,
  items,
  materialIssueRequestLines,
  projectCommercialBaselines,
  purchaseOrderLines,
  quotationLines,
  quotationRevisions,
  stockBalances,
  stockLocations,
  units,
  warehouseItemThresholds,
  warehouses,
} from '../../infrastructure/database/schema/index.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { ProcurementService } from './procurement.service.js';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const WAREHOUSE_ID = '22222222-2222-4222-8222-222222222222';
const MAIN_LOC_ID = '22222222-2222-4222-8222-222222222201';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const QUOTATION_REV_ID = '44444444-4444-4444-8444-444444444444';
const QUOTATION_ID = '44444444-4444-4444-8444-444444444400';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const UNIT_ID = '66666666-6666-4666-8666-666666666666';
const BRAND_A = '77777777-7777-4777-8777-777777777701';

function makePurchasePrincipal(): AuthenticatedPrincipal {
  return {
    sessionId: 'sess-buyer',
    userId: 'buyer-1',
    companyId: COMPANY_ID,
    name: 'Buyer One',
    email: 'buyer@example.com',
    mustChangePassword: false,
    grants: purchaseExecutivePermissionCodes.map((permissionCode) => ({
      permissionCode,
      scopeKind: 'company',
      scopeId: null,
      source: 'role',
    })),
  };
}

type TableEntry = unknown[] | { queue: unknown[][] };

function createPlanMockDb(tableRows: Map<object, TableEntry>) {
  function makeChain(table: object) {
    const promise = Promise.resolve().then(() => {
      const entry = tableRows.get(table);
      return Array.isArray(entry)
        ? entry
        : entry && entry.queue.length > 0
          ? (entry.queue.shift() ?? [])
          : [];
    });
    return Object.assign(promise, {
      innerJoin: () => promise,
      leftJoin: () => promise,
      where: () => promise,
      groupBy: () => promise,
      orderBy: () => promise,
      limit: () => promise,
      for: () => promise,
    });
  }

  const db: Record<string, unknown> = {
    select: () => ({
      from: (table: object) => makeChain(table),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}

describe('ProcurementService.getFulfillmentPlan', () => {
  it('computes exact brand-matched Free Available, Project Shortage, Store Replenishment, and Total PO Qty', async () => {
    const tableRows = new Map<object, TableEntry>([
      [
        quotationRevisions,
        [
          {
            revision: {
              id: QUOTATION_REV_ID,
              companyId: COMPANY_ID,
              quotationId: QUOTATION_ID,
              revisionNumber: 1,
              status: 'accepted',
            },
            quotation: {
              id: QUOTATION_ID,
              quotationNumber: 'QTN-2026-00010',
            },
          },
        ],
      ],
      [
        projectCommercialBaselines,
        [
          {
            projectId: PROJECT_ID,
            projectNumber: 'PRJ-2026-00005',
            projectTitle: 'Warehouse Sprinkler Retrofit',
          },
        ],
      ],
      [warehouses, [{ id: WAREHOUSE_ID, name: 'Central Store' }]],
      [stockLocations, [{ id: MAIN_LOC_ID }]],
      [
        quotationLines,
        [
          {
            quotationLine: {
              id: 'ql-1',
              quantity: '50.0000',
              offeringId: BRAND_A,
              itemCodeSnapshot: 'SPR-15MM',
              itemNameSnapshot: 'Pendent Sprinkler 68C',
              unitSymbolSnapshot: 'Nos',
            },
            boqLine: {
              id: 'boq-line-1',
              itemId: ITEM_ID,
              unitId: UNIT_ID,
            },
            brandName: 'Tyco',
          },
        ],
      ],
      // Brand A in MAIN: OnHand = 30, Reserved = 10 -> Free Available = 20
      [
        stockBalances,
        [
          {
            onHand: '30.0000',
            reserved: '10.0000',
          },
        ],
      ],
      // Threshold for Brand A: Min = 15, Max = 60
      [
        warehouseItemThresholds,
        [
          {
            minStock: '15.0000',
            maxStock: '60.0000',
          },
        ],
      ],
      // Already requested via MIR = 10 (5 verified at site, 5 in transit)
      [
        materialIssueRequestLines,
        [
          {
            requestedQty: '10.0000',
            dispatchedQty: '10.0000',
            verifiedAtSiteQty: '5.0000',
            verifiedAtSite: '5.0000',
            shortClosedQty: '0.0000',
            requested: '10.0000',
            dispatched: '10.0000',
            verified: '5.0000',
          },
        ],
      ],
      [deliveryChallanLines, [{ qty: '5.0000', verified: '5.0000', verifiedReceivedQty: '5.0000' }]],
      // Incoming open PO queries:
      // 1) Project PO lines -> ordered qty = 5, allocatedReceived = 0 -> alreadyOrdered = 5
      // 2) Store replenishment PO lines -> storeReplenishmentQty = 20, storeReceivedQty = 5 -> incoming = 15
      [
        purchaseOrderLines,
        {
          queue: [
            [
              {
                qty: '5.0000',
                allocatedReceived: '0.0000',
                destinationType: 'warehouse',
                poStatus: 'issued',
              },
            ],
            [
              {
                qty: '20.0000',
                received: '5.0000',
              },
            ],
          ],
        },
      ],
      [items, [{ code: 'SPR-15MM', name: 'Pendent Sprinkler 68C' }]],
      [itemBrandOfferings, [{ brandName: 'Tyco' }]],
      [units, [{ symbol: 'Nos' }]],
    ]);

    const db = createPlanMockDb(tableRows);
    const service = new ProcurementService(db as never);
    const plan = await service.getFulfillmentPlan(makePurchasePrincipal(), QUOTATION_REV_ID, WAREHOUSE_ID);

    expect(plan.quotationNumber).toBe('QTN-2026-00010');
    expect(plan.projectNumber).toBe('PRJ-2026-00005');
    expect(plan.warehouseName).toBe('Central Store');
    expect(plan.lines).toHaveLength(1);

    const line = plan.lines[0]!;
    expect(line.quotedQty).toBe('50.0000');
    expect(line.alreadyRequestedFromStoreQty).toBe('10.0000');
    expect(line.alreadyDispatchedQty).toBe('10.0000');
    expect(line.alreadyVerifiedAtSiteQty).toBe('5.0000');
    expect(line.alreadyOrderedForProjectQty).toBe('5.0000');
    expect(line.remainingProjectNeed).toBe('35.0000');
    expect(line.freeAvailable).toBe('20.0000');
    expect(line.suggestedStoreIssueQty).toBe('20.0000');
    expect(line.projectShortageQty).toBe('15.0000');
    expect(line.projectedStoreAfterIssue).toBe('15.0000');
    expect(line.incomingStoreOpenPoQty).toBe('15.0000');
    expect(line.suggestedStoreReplenishmentQty).toBe('45.0000');
    expect(line.suggestedTotalPoQty).toBe('60.0000');
  });
});
