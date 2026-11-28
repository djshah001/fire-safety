import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, ConflictError, ForbiddenError } from '../../core/errors/appError.js';
import {
  purchaseExecutivePermissionCodes,
  purchaseManagerPermissionCodes,
  storekeeperPermissionCodes,
} from '../../core/security/permissions.js';
import {
  auditEvents,
  companies,
  goodsReceiptLines,
  goodsReceipts,
  notifications,
  procurementRequisitions,
  procurementRfqLines,
  procurementRfqs,
  procurementSelectionDecisions,
  procurementSelectionLineAwards,
  projects,
  purchaseComparisons,
  purchaseOrderDispatches,
  purchaseOrderLines,
  purchaseOrderRevisions,
  purchaseOrders,
  storeReplenishmentRequests,
  supplierReturnLines,
  supplierReturns,
  vendorOfferLines,
  vendorOffers,
  vendorPriceInquiries,
  vendorPriceInquiryResponses,
  vendors,
  warehouseItemThresholds,
} from '../../infrastructure/database/schema/index.js';
import { msg91WhatsAppService } from '../../infrastructure/notifications/msg91.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { ProcurementService, procurementService } from './procurement.service.js';
import { PurchaseOrderService } from './purchaseOrder.service.js';

vi.mock('../../infrastructure/documents/supplierReturn.pdf.js', () => ({
  renderSupplierReturnPdf: vi.fn(async () => Buffer.from('%PDF-1.4\n%mock-rtv\n')),
}));

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const REQ_ID = '44444444-4444-4444-8444-444444444401';
const RFQ_ID = '44444444-4444-4444-8444-444444444402';
const RFQ_LINE_1 = '44444444-4444-4444-8444-444444444403';
const RFQ_LINE_2 = '44444444-4444-4444-8444-444444444404';
const REQ_LINE_1 = '44444444-4444-4444-8444-444444444405';
const REQ_LINE_2 = '44444444-4444-4444-8444-444444444406';
const COMP_ID = '44444444-4444-4444-8444-444444444407';
const INQ_ID = '55555555-5555-4555-8555-555555555501';
const RESP_ID_A1 = '55555555-5555-4555-8555-555555555502';
const RESP_ID_A2 = '55555555-5555-4555-8555-555555555503';
const VENDOR_A = '66666666-6666-4666-8666-666666666601';
const VENDOR_B = '66666666-6666-4666-8666-666666666602';
const OFFER_A = '77777777-7777-4777-8777-777777777701';
const OFFER_B = '77777777-7777-4777-8777-777777777702';
const OFFER_LINE_A1 = '77777777-7777-4777-8777-777777777711';
const OFFER_LINE_A2 = '77777777-7777-4777-8777-777777777712';
const OFFER_LINE_B1 = '77777777-7777-4777-8777-777777777721';
const OFFER_LINE_B2 = '77777777-7777-4777-8777-777777777722';
const ITEM_1 = '88888888-8888-4888-8888-888888888801';
const ITEM_2 = '88888888-8888-4888-8888-888888888802';
const UNIT_ID = '88888888-8888-4888-8888-888888888809';
const PO_ID = '99999999-9999-4999-8999-999999999901';
const PO_REV_ID = '99999999-9999-4999-8999-999999999902';
const PO_LINE_1 = '99999999-9999-4999-8999-999999999903';
const GRN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const GRN_LINE_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const RTV_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const RTV_LINE_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

const BUYER_ID = '10000000-0000-4000-8000-000000000001';
const MANAGER_ID = '10000000-0000-4000-8000-000000000002';
const STOREKEEPER_ID = '10000000-0000-4000-8000-000000000003';

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
  updateQueue?: unknown[][];
};

function createMockDb(handlers: Map<object, TableHandler> = new Map()) {
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
    select: () => ({
      from: (table: object) => makeSelectChain(table),
    }),
    selectDistinct: () => ({
      from: (table: object) => makeSelectChain(table),
    }),
    insert: (table: object) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = (Array.isArray(values) ? values : [values]).map((row) => ({
          id: `00000000-0000-4000-8000-${String(idSeq++).padStart(12, '0')}`,
          createdAt: new Date(),
          updatedAt: new Date(),
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
        const queued = handlers.get(table)?.updateQueue;
        const rows =
          queued && queued.length > 0
            ? (queued.shift() ?? [])
            : [{ id: `mock-upd-${idSeq++}`, ...values }];
        return attachPromise(
          (target) => ({
            where: () => target,
            returning: () => Promise.resolve(rows),
          }),
          () => rows,
        );
      },
    }),
    delete: () =>
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

  return { db: executor, inserted, updated };
}

describe('Phase 6 Procurement & PO Lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('converts submitted price inquiry responses into formal offers idempotently without duplicating on repeat', async () => {
    const buyer = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);
    const rfqLinesList = [
      {
        id: RFQ_LINE_1,
        companyId: COMPANY_ID,
        rfqId: RFQ_ID,
        requisitionLineId: REQ_LINE_1,
        lineNumber: 1,
        itemId: ITEM_1,
        itemCodeSnapshot: 'PIPE-100',
        itemNameSnapshot: 'MS Pipe 100mm',
        specificationSnapshot: 'IS 1239 Heavy',
        unitId: UNIT_ID,
        unitSymbolSnapshot: 'Mtr',
        quantity: '20.0000',
      },
      {
        id: RFQ_LINE_2,
        companyId: COMPANY_ID,
        rfqId: RFQ_ID,
        requisitionLineId: REQ_LINE_2,
        lineNumber: 2,
        itemId: ITEM_2,
        itemCodeSnapshot: 'VALVE-50',
        itemNameSnapshot: 'Butterfly Valve 50mm',
        specificationSnapshot: 'PN16 Wafer',
        unitId: UNIT_ID,
        unitSymbolSnapshot: 'Nos',
        quantity: '4.0000',
      },
    ];
    const inquiryResponses = [
      {
        id: RESP_ID_A1,
        companyId: COMPANY_ID,
        inquiryId: INQ_ID,
        vendorId: VENDOR_A,
        itemRef: { itemId: ITEM_1, brandOffered: 'Jindal', specification: 'IS 1239 Heavy' },
        unitRate: '500.00',
        currency: 'INR',
        taxBasis: 'GST 18% Extra',
        leadTimeDays: 5,
        paymentTerms: '30 days credit',
        warranty: '12 months',
        validUntil: '2026-12-31',
        submittedAt: new Date(),
      },
      {
        id: RESP_ID_A2,
        companyId: COMPANY_ID,
        inquiryId: INQ_ID,
        vendorId: VENDOR_A,
        itemRef: { itemId: ITEM_2, brandOffered: 'Audco', specification: 'PN16 Wafer' },
        unitRate: '1200.00',
        currency: 'INR',
        taxBasis: 'GST 18% Extra',
        leadTimeDays: 5,
        paymentTerms: '30 days credit',
        warranty: '12 months',
        validUntil: '2026-12-31',
        submittedAt: new Date(),
      },
    ];

    const handlers = new Map<object, TableHandler>([
      [
        procurementRequisitions,
        {
          selectDefault: [
            {
              id: REQ_ID,
              companyId: COMPANY_ID,
              buyerUserId: BUYER_ID,
              purchaseManagerUserId: MANAGER_ID,
              status: 'sourcing',
            },
          ],
        },
      ],
      [
        procurementRfqs,
        { selectDefault: [{ id: RFQ_ID, companyId: COMPANY_ID, requisitionId: REQ_ID, status: 'open' }] },
      ],
      [
        vendorPriceInquiries,
        {
          selectDefault: [
            { id: INQ_ID, companyId: COMPANY_ID, inquiryCode: 'PRI-000001', requisitionId: REQ_ID },
          ],
        },
      ],
      [vendorPriceInquiryResponses, { selectDefault: inquiryResponses }],
      [procurementRfqLines, { selectDefault: rfqLinesList }],
      [
        vendorOffers,
        {
          selectQueue: [
            [], // first call: no offers yet
            [
              {
                id: OFFER_A,
                companyId: COMPANY_ID,
                rfqId: RFQ_ID,
                vendorId: VENDOR_A,
                sourcePriceInquiryResponseId: RESP_ID_A1,
              },
            ], // second call: response already linked
          ],
        },
      ],
    ]);

    const { db, inserted } = createMockDb(handlers);
    const service = new ProcurementService(db as never);

    const first = await service.convertInquiryResponsesToOffers(
      buyer,
      REQ_ID,
      { inquiryId: INQ_ID },
      'req-import-1',
    );
    expect(first.imported).toHaveLength(1);
    expect(first.imported[0]!.vendorId).toBe(VENDOR_A);
    expect(first.imported[0]!.total).toBe('14800.00'); // 20*500 + 4*1200
    expect(inserted.get(vendorOffers)?.[0]!.sourcePriceInquiryResponseId).toBe(RESP_ID_A1);

    const second = await service.convertInquiryResponsesToOffers(
      buyer,
      REQ_ID,
      { inquiryId: INQ_ID },
      'req-import-2',
    );
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toEqual([{ vendorId: VENDOR_A, reason: 'already_imported' }]);
  });

  it('supports line-level split awards across vendors and generates separate POs per winning vendor', async () => {
    const manager = makePrincipal(MANAGER_ID, purchaseManagerPermissionCodes);
    const buyer = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);

    const handlers = new Map<object, TableHandler>([
      [
        procurementRequisitions,
        {
          selectDefault: [
            {
              id: REQ_ID,
              companyId: COMPANY_ID,
              buyerUserId: BUYER_ID,
              purchaseManagerUserId: MANAGER_ID,
              status: 'sourcing',
            },
          ],
        },
      ],
      [
        procurementRfqs,
        { selectDefault: [{ id: RFQ_ID, companyId: COMPANY_ID, requisitionId: REQ_ID, status: 'open' }] },
      ],
      [
        procurementRfqLines,
        {
          selectDefault: [
            { id: RFQ_LINE_1, lineNumber: 1, quantity: '20.0000' },
            { id: RFQ_LINE_2, lineNumber: 2, quantity: '4.0000' },
          ],
        },
      ],
      [
        vendorOffers,
        {
          selectDefault: [
            { id: OFFER_A, rfqId: RFQ_ID, vendorId: VENDOR_A, total: '15000.00' },
            { id: OFFER_B, rfqId: RFQ_ID, vendorId: VENDOR_B, total: '14000.00' },
          ],
        },
      ],
      [
        purchaseComparisons,
        {
          selectDefault: [{ id: COMP_ID, companyId: COMPANY_ID, rfqId: RFQ_ID, status: 'open', rowVersion: 1 }],
        },
      ],
      [
        vendorOfferLines,
        {
          selectDefault: [
            { id: OFFER_LINE_A1, vendorOfferId: OFFER_A, rfqLineId: RFQ_LINE_1, lineTotal: '9000.00' },
            { id: OFFER_LINE_A2, vendorOfferId: OFFER_A, rfqLineId: RFQ_LINE_2, lineTotal: '6000.00' },
            { id: OFFER_LINE_B1, vendorOfferId: OFFER_B, rfqLineId: RFQ_LINE_1, lineTotal: '10000.00' },
            { id: OFFER_LINE_B2, vendorOfferId: OFFER_B, rfqLineId: RFQ_LINE_2, lineTotal: '4000.00' },
          ],
        },
      ],
    ]);

    const { db, inserted } = createMockDb(handlers);
    const procSvc = new ProcurementService(db as never);
    const splitRes = await procSvc.selectSplit(
      manager,
      REQ_ID,
      {
        expectedVersion: 1,
        selectionReason: 'Best unit pricing per line item',
        awards: [
          { rfqLineId: RFQ_LINE_1, winningOfferId: OFFER_A, winningOfferLineId: OFFER_LINE_A1 },
          { rfqLineId: RFQ_LINE_2, winningOfferId: OFFER_B, winningOfferLineId: OFFER_LINE_B2 },
        ],
      },
      'req-split-select',
    );
    expect(splitRes.decision).toBeDefined();
    expect(splitRes.lineAwards).toHaveLength(2);
    expect(inserted.get(procurementSelectionDecisions)).toHaveLength(1);
    expect(inserted.get(procurementSelectionLineAwards)).toHaveLength(2);

    const workspaceStub = {
      requisition: {
        id: REQ_ID,
        projectId: PROJECT_ID,
        requisitionNumber: 'REQ-2026-00001',
        title: 'Hydrant & Valve Pkg',
        status: 'selected',
        deliveryLocation: 'Site Alpha',
        requiredBy: '2026-12-20',
      },
      selection: { id: 'sel-1', selectedOfferId: OFFER_A },
      lineAwards: [
        {
          id: 'aw-1',
          rfqLineId: RFQ_LINE_1,
          winningVendorId: VENDOR_A,
          winningOfferId: OFFER_A,
          winningOfferLineId: OFFER_LINE_A1,
          awardedQuantity: '20.0000',
          generatedPoId: null,
        },
        {
          id: 'aw-2',
          rfqLineId: RFQ_LINE_2,
          winningVendorId: VENDOR_B,
          winningOfferId: OFFER_B,
          winningOfferLineId: OFFER_LINE_B2,
          awardedQuantity: '4.0000',
          generatedPoId: null,
        },
      ],
      rfqLines: [
        {
          id: RFQ_LINE_1,
          requisitionLineId: REQ_LINE_1,
          itemId: ITEM_1,
          itemCodeSnapshot: 'PIPE-100',
          itemNameSnapshot: 'MS Pipe 100mm',
          specificationSnapshot: 'IS 1239',
          unitId: UNIT_ID,
          unitSymbolSnapshot: 'Mtr',
        },
        {
          id: RFQ_LINE_2,
          requisitionLineId: REQ_LINE_2,
          itemId: ITEM_2,
          itemCodeSnapshot: 'VALVE-50',
          itemNameSnapshot: 'Butterfly Valve',
          specificationSnapshot: 'PN16',
          unitId: UNIT_ID,
          unitSymbolSnapshot: 'Nos',
        },
      ],
      lines: [
        { id: REQ_LINE_1, projectAllocationQty: '20.0000', storeReplenishmentQty: '0.0000', destinationType: 'warehouse' },
        { id: REQ_LINE_2, projectAllocationQty: '4.0000', storeReplenishmentQty: '0.0000', destinationType: 'warehouse' },
      ],
      offers: [
        {
          id: OFFER_A,
          vendorName: 'Pipe Vendor A',
          currency: 'INR',
          paymentTerms: '30 days',
          lines: [{ id: OFFER_LINE_A1, unitRate: '450.00', brandOffered: 'Jindal', specificationOffered: 'IS 1239' }],
        },
        {
          id: OFFER_B,
          vendorName: 'Valve Vendor B',
          currency: 'INR',
          paymentTerms: '15 days',
          lines: [{ id: OFFER_LINE_B2, unitRate: '1000.00', brandOffered: 'Audco', specificationOffered: 'PN16' }],
        },
      ],
    };

    const poHandlers = new Map<object, TableHandler>([
      [
        procurementSelectionLineAwards,
        {
          updateQueue: [[{ id: 'aw-1' }], [{ id: 'aw-2' }]],
        },
      ],
    ]);
    const poMock = createMockDb(poHandlers);
    const poSvc = new PurchaseOrderService(poMock.db as never);
    vi.spyOn(procurementService, 'get')
      .mockResolvedValueOnce(workspaceStub as never)
      .mockResolvedValueOnce({
        ...workspaceStub,
        lineAwards: workspaceStub.lineAwards.map((a, idx) => ({ ...a, generatedPoId: `po-${idx + 1}` })),
      } as never);

    const poResult = await poSvc.createFromRequisitionAwards(
      buyer,
      { requisitionId: REQ_ID },
      'req-gen-split-pos',
    );
    expect(poResult.purchaseOrders).toHaveLength(2);
    expect(poMock.inserted.get(purchaseOrders)).toHaveLength(2);
    expect(poMock.inserted.get(purchaseOrderRevisions)).toHaveLength(2);
    expect(poMock.inserted.get(purchaseOrderLines)).toHaveLength(2);

    await expect(
      poSvc.createFromRequisitionAwards(buyer, { requisitionId: REQ_ID }, 'req-gen-repeat'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('short-closes a partially delivered PO, re-evaluates thresholds, and blocks subsequent GRNs', async () => {
    const manager = makePrincipal(MANAGER_ID, purchaseManagerPermissionCodes);
    const storekeeper = makePrincipal(STOREKEEPER_ID, storekeeperPermissionCodes);

    const handlers = new Map<object, TableHandler>([
      [
        purchaseOrders,
        {
          selectQueue: [
            [{ id: PO_ID, companyId: COMPANY_ID, poNumber: 'PO-2026-00001', status: 'partially_delivered', rowVersion: 2 }],
            [{ id: PO_ID, companyId: COMPANY_ID, status: 'short_closed', rowVersion: 3 }],
          ],
        },
      ],
      [
        purchaseOrderLines,
        {
          selectDefault: [
            {
              id: PO_LINE_1,
              companyId: COMPANY_ID,
              purchaseOrderId: PO_ID,
              itemId: ITEM_1,
              quantity: '100.0000',
              receivedQuantity: '60.0000',
              acceptedQuantity: '60.0000',
              shortClosedQuantity: '0.0000',
            },
          ],
        },
      ],
      [warehouseItemThresholds, { selectDefault: [] }],
      [storeReplenishmentRequests, { selectDefault: [] }],
    ]);

    const { db, updated } = createMockDb(handlers);
    const poSvc = new PurchaseOrderService(db as never);

    await expect(
      poSvc.shortClosePurchaseOrder(
        storekeeper,
        PO_ID,
        { expectedVersion: 2, reason: 'Storekeeper blocked' },
        'req-sc-403',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const closed = await poSvc.shortClosePurchaseOrder(
      manager,
      PO_ID,
      { expectedVersion: 2, reason: 'Vendor discontinued balance batch' },
      'req-sc-ok',
    );
    expect(closed.status).toBe('short_closed');
    expect(updated.get(purchaseOrderLines)?.[0]!.shortClosedQuantity).toBe('40.0000');

    await expect(
      poSvc.createGoodsReceipt(
        storekeeper,
        PO_ID,
        {
          vendorChallanNumber: 'CH-999',
          vendorChallanDate: '2026-11-28',
          deliveryLocation: 'Warehouse 1',
          lines: [{ purchaseOrderLineId: PO_LINE_1, deliveredQuantity: '5.0000' }],
        },
        'req-grn-after-sc',
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('logs manual WhatsApp fallback on vendor PO dispatch when MSG91 is unconfigured and blocks storekeepers', async () => {
    const buyer = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);
    const storekeeper = makePrincipal(STOREKEEPER_ID, storekeeperPermissionCodes);
    vi.spyOn(msg91WhatsAppService, 'sendPurchaseOrderNotice').mockResolvedValue({
      success: false,
      status: 'unconfigured',
      error: 'MSG91 WhatsApp is not configured.',
    });

    const handlers = new Map<object, TableHandler>([
      [
        purchaseOrders,
        {
          selectDefault: [
            {
              id: PO_ID,
              companyId: COMPANY_ID,
              poNumber: 'PO-2026-00010',
              title: 'Sprinkler Heads',
              status: 'issued',
              currency: 'INR',
              grandTotal: '59000.00',
              deliveryLocation: 'Main Store',
            },
          ],
        },
      ],
      [
        purchaseOrderRevisions,
        {
          selectDefault: [{ id: PO_REV_ID, revisionNumber: 0, status: 'issued', issuedPdfStorageId: 'po-file.pdf' }],
        },
      ],
    ]);

    const { db, inserted } = createMockDb(handlers);
    const poSvc = new PurchaseOrderService(db as never);

    await expect(
      poSvc.dispatchToVendor(
        storekeeper,
        PO_ID,
        { channel: 'whatsapp_manual', recipientName: 'Vendor Sales', recipientContact: '9876543210' },
        'req-disp-403',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const res = await poSvc.dispatchToVendor(
      buyer,
      PO_ID,
      { channel: 'whatsapp_msg91', recipientName: 'Vendor Sales', recipientContact: '+91 9876543210' },
      'req-disp-ok',
    );
    expect(res.fallbackToManual).toBe(true);
    expect(res.dispatch!.status).toBe('manual_opened');
    expect(res.manualWhatsAppUrl).toContain('https://wa.me/919876543210');
    expect(inserted.get(purchaseOrderDispatches)?.[0]!.channel).toBe('whatsapp_manual');
  });

  it('blocks unapproved GRN overdelivery and non-admin self-approval while permitting manager-approved excess', async () => {
    const storekeeper = makePrincipal(STOREKEEPER_ID, storekeeperPermissionCodes);
    const buyer = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);

    const baseHandlers = () =>
      new Map<object, TableHandler>([
        [
          purchaseOrders,
          {
            selectDefault: [
              {
                id: PO_ID,
                companyId: COMPANY_ID,
                poNumber: 'PO-2026-00020',
                status: 'issued',
                createdByUserId: BUYER_ID,
                projectId: PROJECT_ID,
                vendorId: VENDOR_A,
                rowVersion: 1,
              },
            ],
          },
        ],
        [
          purchaseOrderLines,
          {
            selectDefault: [
              {
                id: PO_LINE_1,
                companyId: COMPANY_ID,
                purchaseOrderId: PO_ID,
                lineNumber: 1,
                itemId: ITEM_1,
                brandOfferingId: null,
                quantity: '10.0000',
                receivedQuantity: '0.0000',
                acceptedQuantity: '0.0000',
                rejectedQuantity: '0.0000',
              },
            ],
          },
        ],
      ]);

    const svc1 = new PurchaseOrderService(createMockDb(baseHandlers()).db as never);
    await expect(
      svc1.createGoodsReceipt(
        storekeeper,
        PO_ID,
        {
          vendorChallanNumber: 'CH-100',
          vendorChallanDate: '2026-11-28',
          deliveryLocation: 'Main Store',
          lines: [{ purchaseOrderLineId: PO_LINE_1, deliveredQuantity: '12.0000' }],
        },
        'req-excess-no-reason',
      ),
    ).rejects.toMatchObject({ code: 'OVERDELIVERY_REQUIRES_APPROVAL', statusCode: 422 });

    await expect(
      new PurchaseOrderService(createMockDb(baseHandlers()).db as never).createGoodsReceipt(
        storekeeper,
        PO_ID,
        {
          vendorChallanNumber: 'CH-100',
          vendorChallanDate: '2026-11-28',
          deliveryLocation: 'Main Store',
          lines: [
            {
              purchaseOrderLineId: PO_LINE_1,
              deliveredQuantity: '12.0000',
              excessApprovalReason: 'Trying without manager perm',
            },
          ],
        },
        'req-excess-403-store',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Non-admin PO creator with approval perm cannot self-approve overdelivery on own PO
    const creatorWithApprove = makePrincipal(BUYER_ID, [
      ...storekeeperPermissionCodes,
      ...purchaseManagerPermissionCodes,
    ]);
    await expect(
      new PurchaseOrderService(createMockDb(baseHandlers()).db as never).createGoodsReceipt(
        creatorWithApprove,
        PO_ID,
        {
          vendorChallanNumber: 'CH-100',
          vendorChallanDate: '2026-11-28',
          deliveryLocation: 'Main Store',
          lines: [
            {
              purchaseOrderLineId: PO_LINE_1,
              deliveredQuantity: '12.0000',
              excessApprovalReason: 'Self-approval attempt',
            },
          ],
        },
        'req-excess-self',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const { db, inserted } = createMockDb(baseHandlers());
    const mgrWithGrnPerm = makePrincipal(MANAGER_ID, [
      ...purchaseManagerPermissionCodes,
      'procurement.goods_receipt.manage',
    ]);
    const grnRes = await new PurchaseOrderService(db as never).createGoodsReceipt(
      mgrWithGrnPerm,
      PO_ID,
      {
        vendorChallanNumber: 'CH-100',
        vendorChallanDate: '2026-11-28',
        deliveryLocation: 'Main Store',
        lines: [
          {
            purchaseOrderLineId: PO_LINE_1,
            deliveredQuantity: '12.0000',
            excessApprovalReason: 'Accepted full mill roll length tolerance (+2)',
          },
        ],
      },
      'req-excess-ok',
    );
    expect(grnRes.id).toBeDefined();
    expect(inserted.get(goodsReceiptLines)?.[0]!.excessQuantity).toBe('2.0000');
    expect(inserted.get(goodsReceiptLines)?.[0]!.excessApprovedByUserId).toBe(MANAGER_ID);
    expect(
      inserted.get(auditEvents)?.some((a) => a.action === 'procurement.grn_overdelivery_approved'),
    ).toBe(true);
    expect(buyer.userId).toBe(BUYER_ID);
  });

  it('enforces rejected-quantity bounds on RTV creation, generates Challan PDF on dispatch, and settles replacements safely', async () => {
    const buyer = makePrincipal(BUYER_ID, purchaseExecutivePermissionCodes);
    const manager = makePrincipal(MANAGER_ID, purchaseManagerPermissionCodes);

    const rtvHandlers = new Map<object, TableHandler>([
      [
        purchaseOrders,
        { selectDefault: [{ id: PO_ID, companyId: COMPANY_ID, poNumber: 'PO-2026-00030', vendorId: VENDOR_A, projectId: PROJECT_ID }] },
      ],
      [goodsReceipts, { selectDefault: [{ id: GRN_ID, companyId: COMPANY_ID, purchaseOrderId: PO_ID, grnNumber: 'GRN-2026-00001' }] }],
      [
        goodsReceiptLines,
        {
          selectDefault: [
            { id: GRN_LINE_1, lineNumber: 1, purchaseOrderLineId: PO_LINE_1, rejectedQuantity: '5.0000' },
          ],
        },
      ],
      [
        purchaseOrderLines,
        {
          selectDefault: [
            {
              id: PO_LINE_1,
              companyId: COMPANY_ID,
              purchaseOrderId: PO_ID,
              itemId: ITEM_1,
              brandOfferingId: null,
              receivedQuantity: '10.0000',
              acceptedQuantity: '5.0000',
              rejectedQuantity: '5.0000',
            },
          ],
        },
      ],
      [vendors, { selectDefault: [{ id: VENDOR_A, displayName: 'Vendor Alpha', code: 'V001' }] }],
      [projects, { selectDefault: [{ id: PROJECT_ID, projectNumber: 'PRJ-01', title: 'Site Alpha' }] }],
      [companies, { selectDefault: [{ id: COMPANY_ID, name: 'Fire Safety Co' }] }],
      [
        supplierReturns,
        {
          selectQueue: [
            [
              {
                id: RTV_ID,
                companyId: COMPANY_ID,
                rtvNumber: 'RTV-2026-00001',
                purchaseOrderId: PO_ID,
                goodsReceiptId: GRN_ID,
                vendorId: VENDOR_A,
                projectId: PROJECT_ID,
                status: 'draft',
                resolutionType: 'replacement',
                reason: 'Damaged flange',
                rowVersion: 1,
              },
            ],
            [
              {
                id: RTV_ID,
                companyId: COMPANY_ID,
                rtvNumber: 'RTV-2026-00001',
                purchaseOrderId: PO_ID,
                goodsReceiptId: GRN_ID,
                status: 'dispatched',
                resolutionType: 'replacement',
                rowVersion: 2,
              },
            ],
            [
              {
                id: RTV_ID,
                companyId: COMPANY_ID,
                rtvNumber: 'RTV-2026-00002',
                purchaseOrderId: PO_ID,
                status: 'dispatched',
                resolutionType: 'credit_note',
                rowVersion: 2,
              },
            ],
          ],
        },
      ],
      [
        supplierReturnLines,
        {
          selectQueue: [
            [], // priorReturns in createSupplierReturn (over-return check)
            [], // priorReturns in createSupplierReturn (valid check)
            [
              {
                id: RTV_LINE_1,
                itemCode: 'VALVE-50',
                itemName: 'Butterfly Valve',
                brandOffered: 'Audco',
                unitSymbol: 'Nos',
                returnQuantity: '4.0000',
                remarks: 'Cracked seal',
              },
            ], // dispatchSupplierReturn lines
            [
              {
                id: RTV_LINE_1,
                supplierReturnId: RTV_ID,
                purchaseOrderLineId: PO_LINE_1,
                returnQuantity: '4.0000',
                replacementReceivedQuantity: '0.0000',
              },
            ], // recordSupplierReturnReplacement lines
          ],
        },
      ],
    ]);

    const { db, inserted, updated } = createMockDb(rtvHandlers);
    const poSvc = new PurchaseOrderService(db as never);

    // Block over-return > rejectedQuantity (5)
    await expect(
      poSvc.createSupplierReturn(
        buyer,
        {
          purchaseOrderId: PO_ID,
          goodsReceiptId: GRN_ID,
          resolutionType: 'replacement',
          reason: 'Damaged flange',
          lines: [{ goodsReceiptLineId: GRN_LINE_1, returnQuantity: '6.0000' }],
        },
        'req-rtv-over',
      ),
    ).rejects.toBeInstanceOf(AppError);

    const createdRtv = await poSvc.createSupplierReturn(
      buyer,
      {
        purchaseOrderId: PO_ID,
        goodsReceiptId: GRN_ID,
        resolutionType: 'replacement',
        reason: 'Damaged flange',
        lines: [{ goodsReceiptLineId: GRN_LINE_1, returnQuantity: '4.0000', remarks: 'Cracked seal' }],
      },
      'req-rtv-create',
    );
    expect(createdRtv.status).toBe('draft');
    expect(inserted.get(supplierReturnLines)?.[0]!.returnQuantity).toBe('4.0000');

    const dispatched = await poSvc.dispatchSupplierReturn(
      buyer,
      RTV_ID,
      { expectedVersion: 1, dispatchDate: '2026-11-28', transporterName: 'BlueDart' },
      'req-rtv-disp',
    );
    expect(dispatched.status).toBe('dispatched');
    expect(dispatched.hasPdf).toBe(true);

    const replaced = await poSvc.recordSupplierReturnReplacement(
      buyer,
      RTV_ID,
      { expectedVersion: 2, lines: [{ supplierReturnLineId: RTV_LINE_1, receivedQuantity: '4.0000' }] },
      'req-rtv-rep',
    );
    expect(replaced.status).toBe('closed');
    const poLineUpd = updated.get(purchaseOrderLines)?.[0];
    expect(poLineUpd?.acceptedQuantity).toBe('9.0000');
    expect(poLineUpd?.rejectedQuantity).toBe('1.0000');

    const settled = await poSvc.settleSupplierReturnCredit(
      manager,
      RTV_ID,
      { expectedVersion: 2, creditNoteReference: 'CN-2026-0891' },
      'req-rtv-credit',
    );
    expect(settled.status).toBe('credit_settled');
    expect(settled.creditNoteReference).toBe('CN-2026-0891');
    expect(inserted.get(notifications)).toBeUndefined();
  });
});
