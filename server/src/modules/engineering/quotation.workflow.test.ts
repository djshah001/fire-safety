import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { QuotationService } from './quotation.service.js';

const companyId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000002';
const quotationId = '00000000-0000-4000-8000-000000000003';
const revisionId = '00000000-0000-4000-8000-000000000004';
const lineId = '00000000-0000-4000-8000-000000000005';
const boqLineId = '00000000-0000-4000-8000-000000000006';
const offering1Id = '00000000-0000-4000-8000-000000000007';
const offering2Id = '00000000-0000-4000-8000-000000000008';
const costOpt1Id = '00000000-0000-4000-8000-000000000009';
const costOpt2Id = '00000000-0000-4000-8000-000000000010';
const userId = '00000000-0000-4000-8000-000000000099';

const salesPrincipal: AuthenticatedPrincipal = {
  sessionId: 'sess-1',
  userId,
  companyId,
  name: 'Purchase Executive',
  email: 'purchase@example.test',
  mustChangePassword: false,
  grants: [
    { permissionCode: 'engineering.quotation.read', scopeKind: 'company', scopeId: null, source: 'role' },
    { permissionCode: 'engineering.quotation.write', scopeKind: 'company', scopeId: null, source: 'role' },
  ],
};

function makeFakeDb() {
  return {
    transaction: async <T>(fn: (tx: never) => Promise<T>) => fn({} as never),
  } as never;
}

describe('quotationService inline pricing workflow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recalculates line markup, unit rate, line amount, and revision totals on batch inline save', async () => {
    const updateLine = vi.fn().mockImplementation(async (_c, _r, _l, _v, values) => ({
      id: lineId,
      rowVersion: 2,
      ...values,
    }));
    const updateDraft = vi.fn().mockImplementation(async (_c, _r, _v, values) => ({
      id: revisionId,
      rowVersion: 2,
      ...values,
    }));
    const addContributor = vi.fn().mockResolvedValue(undefined);
    const appendAuditEvent = vi.fn().mockResolvedValue({});

    const service = new QuotationService(makeFakeDb());

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({ id: jobId, companyId }),
    } as never);

    const draftLine = {
      id: lineId,
      boqLineId,
      lineNumber: 1,
      sortOrder: 1,
      offeringId: offering1Id,
      boqCostOptionId: costOpt1Id,
      brandId: 'brand-1',
      brandNameSnapshot: 'Make A',
      manufacturerModelSnapshot: 'MOD-1',
      manufacturerSkuSnapshot: 'SKU-1',
      quantity: '10.0000',
      supplyRate: '100.0000',
      labourRate: '20.0000',
      miscellaneousRate: '5.0000',
      markupPercent: '10.0000',
      markupAmount: '12.0000',
      quotedUnitRate: '137.0000',
      unitRate: '137.00',
      discountAmount: '0.00',
      lineSubtotal: '1370.00',
      lineTotal: '1370.00',
      notes: null,
      rowVersion: 1,
    };

    vi.spyOn(await import('./quotation.repository.js'), 'createQuotationRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({
        revision: {
          id: revisionId,
          status: 'draft',
          rowVersion: 1,
          additionalDiscount: '50.00',
          taxAmount: '0.00',
          roundingAdjustment: '0.00',
        },
        quotation: { id: quotationId, quotationNumber: 'FS-QUO-2026-000001' },
      }),
      listLines: vi.fn().mockResolvedValue([draftLine]),
      listCostOptionsForBoqLines: vi.fn().mockResolvedValue([
        {
          id: costOpt1Id,
          boqLineId,
          offeringId: offering1Id,
          brandId: 'brand-1',
          brandName: 'Make A',
          manufacturerModel: 'MOD-1',
          manufacturerSku: 'SKU-1',
          isPreferred: true,
          supplyRate: '100.0000',
          labourRate: '20.0000',
          miscellaneousRate: '5.0000',
          markupPercent: '10.0000',
          markupAmount: '12.0000',
          quotedUnitRate: '137.0000',
          lineTotal: '1370.00',
        },
        {
          id: costOpt2Id,
          boqLineId,
          offeringId: offering2Id,
          brandId: 'brand-2',
          brandName: 'Make B',
          manufacturerModel: 'MOD-2',
          manufacturerSku: 'SKU-2',
          isPreferred: false,
          supplyRate: '150.0000',
          labourRate: '30.0000',
          miscellaneousRate: '10.0000',
          markupPercent: '20.0000',
          markupAmount: '36.0000',
          quotedUnitRate: '226.0000',
          lineTotal: '2260.00',
        },
      ]),
      updateDraft,
      updateLine,
      addContributor,
    } as never);

    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent,
    } as never);

    // Edit supplyRate=200, labourRate=50, misc=10, markupPercent=20:
    // markupAmount = (200 + 50) * 20% = 50.0000
    // quotedUnitRate = 200 + 50 + 50 + 10 = 310.0000
    // lineTotal = 10 * 310 = 3100.00
    // revision grandTotal = 3100 - 50 (additionalDiscount) = 3050.00
    const result = await service.updateLinesPricingBatch(
      salesPrincipal,
      jobId,
      revisionId,
      {
        expectedVersion: 1,
        updates: [
          {
            lineId,
            expectedLineVersion: 1,
            supplyRate: '200',
            labourRate: '50',
            miscellaneousRate: '10',
            markupPercent: '20',
            notes: 'Revised in place',
          },
        ],
      },
      'req-inline-1',
    );

    expect(updateLine).toHaveBeenCalledWith(
      companyId,
      revisionId,
      lineId,
      1,
      expect.objectContaining({
        supplyRate: '200.0000',
        labourRate: '50.0000',
        miscellaneousRate: '10.0000',
        markupPercent: '20.0000',
        markupAmount: '50.0000',
        quotedUnitRate: '310.0000',
        unitRate: '310.00',
        lineSubtotal: '3100.00',
        lineTotal: '3100.00',
        notes: 'Revised in place',
      }),
    );
    expect(updateDraft).toHaveBeenCalledWith(
      companyId,
      revisionId,
      1,
      expect.objectContaining({
        subtotal: '3100.00',
        grandTotal: '3050.00',
      }),
    );
    expect(addContributor).toHaveBeenCalledWith(companyId, revisionId, userId);
    expect(appendAuditEvent).toHaveBeenCalledOnce();
    expect(result.revision.grandTotal).toBe('3050.00');
  });

  it('rejects stale revision version on inline batch save with 409 conflict', async () => {
    const service = new QuotationService(makeFakeDb());

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({ id: jobId, companyId }),
    } as never);

    vi.spyOn(await import('./quotation.repository.js'), 'createQuotationRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({
        revision: {
          id: revisionId,
          status: 'draft',
          rowVersion: 2,
          additionalDiscount: '0.00',
          taxAmount: '0.00',
          roundingAdjustment: '0.00',
        },
        quotation: { id: quotationId, quotationNumber: 'FS-QUO-2026-000001' },
      }),
      listLines: vi.fn().mockResolvedValue([
        {
          id: lineId,
          boqLineId,
          offeringId: offering1Id,
          boqCostOptionId: costOpt1Id,
          quantity: '10.0000',
          supplyRate: '100.0000',
          labourRate: '20.0000',
          miscellaneousRate: '5.0000',
          markupPercent: '10.0000',
          discountAmount: '0.00',
          lineSubtotal: '1370.00',
          notes: null,
          rowVersion: 1,
        },
      ]),
      listCostOptionsForBoqLines: vi.fn().mockResolvedValue([]),
      updateDraft: vi.fn().mockResolvedValue(undefined),
    } as never);

    await expect(
      service.updateLinesPricingBatch(
        salesPrincipal,
        jobId,
        revisionId,
        { expectedVersion: 1, updates: [{ lineId, supplyRate: '120' }] },
        'req-inline-2',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
