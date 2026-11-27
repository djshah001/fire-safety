import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { BoqService } from './boq.service.js';

const companyId = 'b0000000-0000-4000-8000-000000000001';
const jobId = 'c0000000-0000-4000-8000-000000000001';
const boqId = 'd0000000-0000-4000-8000-000000000001';
const designerId = 'a0000000-0000-4000-8000-000000000011';
const costerId = 'a0000000-0000-4000-8000-000000000012';
const purchaseHeadId = 'a0000000-0000-4000-8000-000000000013';
const adminApproverId = 'a0000000-0000-4000-8000-000000000014';
const line1Id = 'e0000000-0000-4000-8000-000000000001';
const line2Id = 'e0000000-0000-4000-8000-000000000002';
const unitNosId = 'f0000000-0000-4000-8000-000000000001';
const item1Id = '10000000-0000-4000-8000-000000000001';
const item2Id = '10000000-0000-4000-8000-000000000002';
const template2Id = '20000000-0000-4000-8000-000000000002';
const offering1Id = '30000000-0000-4000-8000-000000000001';
const est1Id = '40000000-0000-4000-8000-000000000001';
const est2Id = '40000000-0000-4000-8000-000000000002';
const rateOldId = '50000000-0000-4000-8000-000000000001';
const rateNewId = '50000000-0000-4000-8000-000000000002';

const designerPrincipal: AuthenticatedPrincipal = {
  sessionId: 'sess-design',
  userId: designerId,
  companyId,
  name: 'Designer',
  email: 'designer@test',
  mustChangePassword: false,
  grants: [{ permissionCode: 'engineering.design.write', scopeKind: 'company', scopeId: null, source: 'role' }],
};

const costerPrincipal: AuthenticatedPrincipal = {
  sessionId: 'sess-cost',
  userId: costerId,
  companyId,
  name: 'Purchase Coster',
  email: 'coster@test',
  mustChangePassword: false,
  grants: [
    { permissionCode: 'engineering.estimate.read', scopeKind: 'company', scopeId: null, source: 'role' },
    { permissionCode: 'engineering.estimate.write', scopeKind: 'company', scopeId: null, source: 'role' },
  ],
};

function makeLine(id: string, num: number, itemId: string, quantity = '2.0000', section = 'Pump house') {
  return {
    id,
    companyId,
    boqRevisionId: boqId,
    lineNumber: num,
    sortOrder: num,
    section,
    itemId,
    itemCodeSnapshot: `ITEM-${num}`,
    itemNameSnapshot: `Fire Item ${num}`,
    specificationSnapshot: 'IS spec',
    brand: null,
    model: null,
    unitId: unitNosId,
    unitSymbolSnapshot: 'Nos',
    quantity,
    drawingReference: null,
    notes: null,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('BOQ inline quantity, template switch, reorder, bulk actions & stale-rate workflows', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJob() {
    return {
      id: jobId,
      title: 'Plant Fire Protection',
      status: 'customer_approved',
      designerUserId: designerId,
      designHeadUserId: adminApproverId,
      leadId: 'e0000000-0000-4000-8000-000000000099',
      opportunityId: 'f0000000-0000-4000-8000-000000000099',
      rowVersion: 1,
    };
  }

  function makeService() {
    return new BoqService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);
  }

  it('rejects fractional quantities for integer-only units and throws 409 on stale boq version', async () => {
    const line1 = makeLine(line1Id, 1, item1Id);
    const service = makeService();

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
    } as never);
    const bumpRevision = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'draft', rowVersion: 2 }),
      listLines: vi.fn().mockResolvedValue([line1]),
      listUnitsByIds: vi.fn().mockResolvedValue([{ id: unitNosId, name: 'Numbers', allowFractional: false }]),
      bumpRevision,
    } as never);

    await expect(
      service.saveQuantitiesBatch(designerPrincipal, jobId, boqId, {
        expectedVersion: 2,
        updates: [{ lineId: line1Id, quantity: '2.5' }],
      }, 'req-1'),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });

    await expect(
      service.saveQuantitiesBatch(designerPrincipal, jobId, boqId, {
        expectedVersion: 1,
        updates: [{ lineId: line1Id, quantity: '5' }],
      }, 'req-2'),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(bumpRevision).toHaveBeenCalledOnce();
  });

  it('validates exact line IDs and renumbers lines on reorder', async () => {
    const line1 = makeLine(line1Id, 1, item1Id);
    const line2 = makeLine(line2Id, 2, item2Id);
    const service = makeService();

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
    } as never);
    const renumberLines = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'draft', rowVersion: 3 }),
      listLines: vi.fn().mockResolvedValue([line1, line2]),
      listLineMeta: vi.fn().mockResolvedValue([]),
      bumpRevision: vi.fn().mockResolvedValue({ id: boqId, rowVersion: 4 }),
      renumberLines,
      addContributor: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    await expect(
      service.reorderLines(designerPrincipal, jobId, boqId, { expectedVersion: 3, orderedLineIds: [line1Id] }, 'req-3'),
    ).rejects.toMatchObject({ statusCode: 422 });

    const result = await service.reorderLines(
      designerPrincipal,
      jobId,
      boqId,
      { expectedVersion: 3, orderedLineIds: [line2Id, line1Id] },
      'req-4',
    );
    expect(renumberLines).toHaveBeenCalledWith(companyId, boqId, [line2Id, line1Id]);
    expect(result.rowVersion).toBe(4);
  });

  it('supports template append (skipping duplicates) and replace (clearing draft lines)', async () => {
    const line1 = makeLine(line1Id, 1, item1Id, '5.0000');
    const createLine = vi.fn().mockResolvedValue({});
    const deleteAllLines = vi.fn().mockResolvedValue(undefined);
    const updateRevisionMetadata = vi.fn().mockResolvedValue({ id: boqId, rowVersion: 5 });
    const service = makeService();

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
    } as never);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'draft', rowVersion: 4 }),
      findTemplate: vi.fn().mockResolvedValue({
        id: template2Id, name: 'Warehouse Template', status: 'active',
        costingUserId: costerId, purchaseHeadUserId: purchaseHeadId, adminApproverUserId: adminApproverId,
      }),
      listTemplateItems: vi.fn().mockResolvedValue([
        { itemId: item1Id, section: 'Hydrant', itemCode: 'I1', itemName: 'Item 1', specification: 'S1', itemStatus: 'active', unitId: unitNosId, unitSymbol: 'Nos', unitStatus: 'active', sortOrder: 1 },
        { itemId: item2Id, section: 'Sprinkler', itemCode: 'I2', itemName: 'Item 2', specification: 'S2', itemStatus: 'active', unitId: unitNosId, unitSymbol: 'Nos', unitStatus: 'active', sortOrder: 2 },
      ]),
      listLines: vi.fn().mockResolvedValue([line1]),
      listLineMeta: vi.fn().mockResolvedValue([]),
      bumpRevision: vi.fn().mockResolvedValue({ id: boqId, rowVersion: 5 }),
      updateRevisionMetadata,
      deleteAllLines,
      createLine,
      addContributor: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    await service.applyTemplate(designerPrincipal, jobId, boqId, { expectedVersion: 4, templateId: template2Id, mode: 'append' }, 'req-5');
    expect(deleteAllLines).not.toHaveBeenCalled();
    expect(createLine).toHaveBeenCalledOnce();
    expect(createLine).toHaveBeenCalledWith(expect.objectContaining({ itemId: item2Id, lineNumber: 2, sortOrder: 2, quantity: '0.0000' }));

    createLine.mockClear();
    await service.applyTemplate(designerPrincipal, jobId, boqId, { expectedVersion: 4, templateId: template2Id, mode: 'replace' }, 'req-6');
    expect(updateRevisionMetadata).toHaveBeenCalledOnce();
    expect(deleteAllLines).toHaveBeenCalledWith(companyId, boqId);
    expect(createLine).toHaveBeenCalledTimes(2);
  });

  it('adds items, removes a line, bulk deletes, and bulk updates sections', async () => {
    const line1 = makeLine(line1Id, 1, item1Id, '5.0000');
    const line2 = makeLine(line2Id, 2, item2Id, '3.0000');
    const createLine = vi.fn().mockResolvedValue({});
    const deleteLinesByIds = vi.fn().mockResolvedValue([line2]);
    const deleteLineById = vi.fn().mockResolvedValue(line1);
    const renumberLines = vi.fn().mockResolvedValue(undefined);
    const updateLineUnchecked = vi.fn().mockResolvedValue({});
    const service = makeService();

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
    } as never);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'draft', rowVersion: 2 }),
      findActiveItem: vi.fn().mockResolvedValue({
        id: item2Id, code: 'PIPE-80', name: 'GI Pipe 80mm', specification: 'IS 1239',
        categoryName: 'Piping', unitId: unitNosId, unitName: 'Numbers', unitSymbol: 'Nos', allowFractional: false,
      }),
      nextLineNumber: vi.fn().mockResolvedValue(3),
      createLine,
      deleteLineById,
      deleteLinesByIds,
      renumberLines,
      listLines: vi.fn().mockResolvedValue([line1, line2]),
      listLineMeta: vi.fn().mockResolvedValue([]),
      listUnitsByIds: vi.fn().mockResolvedValue([{ id: unitNosId, name: 'Numbers', allowFractional: false }]),
      updateLineUnchecked,
      bumpRevision: vi.fn().mockResolvedValue({ id: boqId, rowVersion: 3 }),
      addContributor: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    await service.addLines(designerPrincipal, jobId, boqId, {
      expectedVersion: 2,
      items: [{ itemId: item2Id, section: 'Hydrant', quantity: '4' }],
    }, 'req-7');
    expect(createLine).toHaveBeenCalledWith(expect.objectContaining({ itemId: item2Id, section: 'Hydrant', quantity: '4.0000', lineNumber: 3, sortOrder: 3 }));

    await service.removeLine(designerPrincipal, jobId, boqId, line1Id, 2, 'req-8');
    expect(deleteLineById).toHaveBeenCalledWith(companyId, boqId, line1Id);
    expect(renumberLines).toHaveBeenCalledWith(companyId, boqId);

    await service.bulkDeleteLines(designerPrincipal, jobId, boqId, { expectedVersion: 2, lineIds: [line2Id] }, 'req-9');
    expect(deleteLinesByIds).toHaveBeenCalledWith(companyId, boqId, [line2Id]);

    await service.bulkUpdateLines(designerPrincipal, jobId, boqId, {
      expectedVersion: 2,
      lineIds: [line1Id, line2Id],
      patch: { sectionName: 'Pump Room', quantity: '10' },
    }, 'req-10');
    expect(updateLineUnchecked).toHaveBeenCalledTimes(2);
    expect(updateLineUnchecked).toHaveBeenCalledWith(companyId, boqId, line1Id, { section: 'Pump Room', quantity: '10.0000' });
  });

  it('applies exact decimal.js bulk markup across costing lines', async () => {
    const est1 = {
      id: est1Id, boqLineId: line1Id, lineNumber: 1, category: 'material' as const, description: 'Pump',
      quantity: '24.0000', unitRate: '0', lineTotal: '0', rateVersionId: rateOldId, offeringId: offering1Id,
      brandIdSnapshot: null, brandNameSnapshot: 'TestBrand', manufacturerModelSnapshot: 'M1',
      manufacturerSkuSnapshot: null, isPreferredOfferingSnapshot: true,
      supplyRate: '1045.0000', labourRate: '320.0000', miscellaneousRate: '25.0000',
      markupPercent: null, markupAmount: null, quotedUnitRate: null, notes: null, rowVersion: 1,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const est2 = { ...est1, id: est2Id, boqLineId: line2Id, lineNumber: 2, isPreferredOfferingSnapshot: false };
    const updateEstimateLine = vi.fn().mockResolvedValue({ ...est1, rowVersion: 2 });
    const service = makeService();

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
    } as never);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'costing', costingUserId: costerId, rowVersion: 2 }),
      listLines: vi.fn().mockResolvedValue([makeLine(line1Id, 1, item1Id, '24.0000'), makeLine(line2Id, 2, item2Id, '24.0000')]),
      listEstimateLines: vi.fn()
        .mockResolvedValueOnce([est1, est2])
        .mockResolvedValueOnce([
          { ...est1, markupPercent: '20', markupAmount: '273.0000', quotedUnitRate: '1663.0000', lineTotal: '39912.00' },
          { ...est2, markupPercent: '20', markupAmount: '273.0000', quotedUnitRate: '1663.0000', lineTotal: '39912.00' },
        ]),
      bumpRevision: vi.fn().mockResolvedValue({ id: boqId, rowVersion: 3 }),
      updateEstimateLine,
      addContributor: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    const result = await service.bulkMarkup(costerPrincipal, jobId, boqId, {
      expectedVersion: 2,
      lineIds: [est1Id, est2Id],
      markupPercent: '20',
    }, 'req-11');

    expect(updateEstimateLine).toHaveBeenCalledWith(companyId, boqId, est1Id, 1, expect.objectContaining({
      markupPercent: '20',
      markupAmount: '273.0000',
      quotedUnitRate: '1663.0000',
      lineTotal: '39912.00',
    }));
    // Only the preferred offering contributes to the summary total
    expect(result.estimateTotals.total).toBe('39912.00');
  });

  it('flags stale catalogue rates in costing workspace and preserves markups when refreshing rates', async () => {
    const line1 = makeLine(line1Id, 1, item1Id, '10.0000');
    const est1 = {
      id: est1Id, boqLineId: line1Id, lineNumber: 1, category: 'material' as const, description: 'Detector',
      quantity: '10.0000', unitRate: '1663.00', lineTotal: '16630.00', rateVersionId: rateOldId, offeringId: offering1Id,
      brandIdSnapshot: null, brandNameSnapshot: 'Apollo', manufacturerModelSnapshot: 'A1',
      manufacturerSkuSnapshot: null, isPreferredOfferingSnapshot: true,
      supplyRate: '1045.0000', labourRate: '320.0000', miscellaneousRate: '25.0000',
      markupPercent: '20.0000', markupAmount: '273.0000', quotedUnitRate: '1663.0000', notes: null, rowVersion: 1,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const createEstimateLine = vi.fn().mockResolvedValue({});
    const deleteEstimateLinesForRevision = vi.fn().mockResolvedValue(undefined);
    const service = makeService();

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
    } as never);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      listRevisions: vi.fn().mockResolvedValue([{
        id: boqId, designJobId: jobId, designRevisionId: 'dr-1', revisionNumber: 1, title: 'BOQ 1',
        changeSummary: 'Initial', status: 'costing', estimateCurrency: 'INR', createdByUserId: designerId,
        submittedByUserId: designerId, submittedAt: new Date(), templateId: template2Id,
        templateNameSnapshot: 'Warehouse', costingUserId: costerId, purchaseHeadUserId: purchaseHeadId,
        adminApproverUserId: adminApproverId, rowVersion: 4,
      }]),
      findRevision: vi.fn().mockResolvedValue({
        id: boqId, designJobId: jobId, status: 'costing', estimateCurrency: 'INR',
        costingUserId: costerId, rowVersion: 4,
      }),
      listActiveTemplatesSummary: vi.fn().mockResolvedValue([]),
      listEligibleDesignRevisions: vi.fn().mockResolvedValue([]),
      listLines: vi.fn().mockResolvedValue([line1]),
      listLineMeta: vi.fn().mockResolvedValue([]),
      listReviews: vi.fn().mockResolvedValue([]),
      listEstimateLines: vi.fn().mockResolvedValue([est1]),
      updateRevisionMetadata: vi.fn().mockResolvedValue({ id: boqId, rowVersion: 5, costingDate: '2026-11-26' }),
      deleteEstimateLinesForRevision,
      createEstimateLine,
      addContributor: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.spyOn(await import('../masters/masters.repository.js'), 'createMastersRepository').mockReturnValue({
      findEffectiveOfferingRate: vi.fn().mockResolvedValue({ id: rateNewId }),
      listEffectiveOfferingRates: vi.fn().mockResolvedValue([{
        offering: { id: offering1Id, brandId: null, manufacturerModel: 'A1', manufacturerSku: null, isPreferred: true },
        brandName: 'Apollo',
        rate: { id: rateNewId, supplyRate: '1100.0000', labourRate: '300.0000', miscellaneousRate: '50.0000', miscellaneousNote: null },
      }]),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    const workspace = await service.getWorkspace(costerPrincipal, jobId);
    expect(workspace.boqs[0]!.hasStaleRates).toBe(true);
    expect(workspace.boqs[0]!.staleLineIds).toEqual([line1Id]);

    await service.refreshCostingRates(costerPrincipal, jobId, boqId, 4, 'req-12');
    expect(deleteEstimateLinesForRevision).toHaveBeenCalledWith(companyId, boqId);
    // (1100 + 300) * 20% = 280; quotedUnitRate = 1100 + 300 + 280 + 50 = 1730; lineTotal = 17300.00
    expect(createEstimateLine).toHaveBeenCalledWith(expect.objectContaining({
      rateVersionId: rateNewId,
      markupPercent: '20.0000',
      markupAmount: '280.0000',
      quotedUnitRate: '1730.0000',
      lineTotal: '17300.00',
    }));
  });

  it('allows system administrators to create new BOQ revisions after approval and reassign workflow chains', async () => {
    const adminPrincipal: AuthenticatedPrincipal = {
      sessionId: 'sess-admin',
      userId: 'a0000000-0000-4000-8000-000000000099',
      companyId,
      name: 'System Admin',
      email: 'admin@test',
      mustChangePassword: false,
      grants: [{ permissionCode: 'system.access.all', scopeKind: 'company', scopeId: null, source: 'role' }],
    };
    const designRevId = '70000000-0000-4000-8000-000000000001';
    const service = makeService();
    const createRevision = vi.fn().mockResolvedValue({ id: '80000000-0000-4000-8000-000000000002', revisionNumber: 2, status: 'draft' });
    const updateRevisionChain = vi.fn().mockResolvedValue({ id: boqId, rowVersion: 2 });

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue(mockJob()),
      findRevision: vi.fn().mockResolvedValue({ id: designRevId, status: 'customer_approved' }),
    } as never);
    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findActiveTemplateForJob: vi.fn().mockResolvedValue({
        template: { id: template2Id, name: 'Warehouse', costingUserId: costerId, purchaseHeadUserId: purchaseHeadId, adminApproverUserId: adminApproverId },
      }),
      listTemplateItems: vi.fn().mockResolvedValue([
        { itemId: item1Id, section: 'Hydrant', itemCode: 'I1', itemName: 'Item 1', specification: 'S1', itemStatus: 'active', unitId: unitNosId, unitSymbol: 'Nos', unitStatus: 'active', sortOrder: 1 },
      ]),
      listRevisions: vi.fn().mockResolvedValue([{ id: boqId, status: 'approved', designRevisionId: designRevId, revisionNumber: 1 }]),
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'approved', designRevisionId: designRevId, rowVersion: 1 }),
      nextRevisionNumber: vi.fn().mockResolvedValue(2),
      createRevision,
      listLines: vi.fn().mockResolvedValue([makeLine(line1Id, 1, item1Id, '5.0000')]),
      createLine: vi.fn().mockResolvedValue({}),
      addContributor: vi.fn().mockResolvedValue(undefined),
      updateRevisionChain,
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    const created = await service.createRevision(adminPrincipal, jobId, {
      designRevisionId: designRevId,
      sourceBoqRevisionId: boqId,
      title: 'BOQ R2 Admin Scope Revision',
      changeSummary: 'Admin revision after initial approval',
    }, 'req-13');
    expect(created.revisionNumber).toBe(2);
    expect(createRevision).toHaveBeenCalledOnce();

    vi.spyOn(await import('./boq.repository.js'), 'createBoqRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({ id: boqId, status: 'costing', rowVersion: 1 }),
      updateRevisionChain,
    } as never);
    vi.spyOn(await import('../crm/crm.repository.js'), 'createCrmRepository').mockReturnValue({
      findEligibleUser: vi.fn().mockResolvedValue({ id: costerId, name: 'User', email: 'u@test' }),
    } as never);

    const updatedChain = await service.reassignChain(adminPrincipal, jobId, boqId, {
      expectedVersion: 1,
      costingUserId: costerId,
      purchaseHeadUserId: purchaseHeadId,
      adminApproverUserId: adminApproverId,
    }, 'req-14');
    expect(updatedChain.rowVersion).toBe(2);
  });
});
