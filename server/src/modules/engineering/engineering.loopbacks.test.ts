import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { customerDecisionSchema } from './engineering.schemas.js';
import { EngineeringService } from './engineering.service.js';
import { quotationCustomerDecisionSchema } from './quotation.schemas.js';
import { QuotationService } from './quotation.service.js';

describe('Design Abandonment & Quotation Decline Loopbacks', () => {
  const companyId = 'b0000000-0000-4000-8000-000000000001';
  const jobId = 'c0000000-0000-4000-8000-000000000001';
  const revisionId = 'd0000000-0000-4000-8000-000000000001';
  const leadId = 'e0000000-0000-4000-8000-000000000001';
  const opportunityId = 'f0000000-0000-4000-8000-000000000001';
  const actorId = 'a0000000-0000-4000-8000-000000000031';
  const headId = 'a0000000-0000-4000-8000-000000000032';
  const designerId = 'a0000000-0000-4000-8000-000000000033';

  const principal: AuthenticatedPrincipal = {
    sessionId: 'sess-sales',
    userId: actorId,
    companyId,
    name: 'Sales Lead',
    email: 'sales@test',
    mustChangePassword: false,
    grants: [
      { permissionCode: 'engineering.design.customer_decision', scopeKind: 'company', scopeId: null, source: 'role' },
      { permissionCode: 'engineering.design.write', scopeKind: 'company', scopeId: null, source: 'role' },
      { permissionCode: 'engineering.quotation.customer_decision', scopeKind: 'company', scopeId: null, source: 'role' },
    ],
  };

  it('requires lossReason when customer abandons design and leadOutcome when declining quotation', () => {
    expect(() =>
      customerDecisionSchema.parse({
        decision: 'abandoned',
        evidenceReference: 'Client email 2026-11-26',
        expectedVersion: 1,
      }),
    ).toThrow();

    expect(() =>
      quotationCustomerDecisionSchema.parse({
        decision: 'declined',
        evidenceReference: 'Email rejection',
        expectedVersion: 1,
      }),
    ).toThrow();

    const valid = quotationCustomerDecisionSchema.parse({
      decision: 'declined',
      leadOutcome: 'mark_lost',
      evidenceReference: 'Email rejection',
      expectedVersion: 1,
    });
    expect(valid.leadOutcome).toBe('mark_lost');
  });

  it('marks design job abandoned, cancels deadlines, and sets Lead & Opportunity Lost on customer design abandonment', async () => {
    const abandonJob = vi.fn().mockResolvedValue({ id: jobId, status: 'abandoned' });
    const cancelPendingDeadlineJobs = vi.fn().mockResolvedValue(undefined);
    const markLeadAndOpportunityLost = vi.fn().mockResolvedValue(undefined);
    const notifyMany = vi.fn().mockResolvedValue([]);

    const service = new EngineeringService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({
        id: jobId,
        title: 'Warehouse Design',
        status: 'sent_to_customer',
        leadId,
        opportunityId,
        designerUserId: designerId,
        designHeadUserId: headId,
        rowVersion: 3,
      }),
      findRevision: vi.fn().mockResolvedValue({ id: revisionId, status: 'sent_to_customer', rowVersion: 2 }),
      transitionRevision: vi.fn().mockResolvedValue({ id: revisionId, status: 'sent_to_customer', rowVersion: 3 }),
      abandonJob,
      cancelPendingDeadlineJobs,
      createCustomerDecision: vi.fn().mockResolvedValue({ id: 'dec-1' }),
      markLeadAndOpportunityLost,
      listDesignAndSalesRecipients: vi.fn().mockResolvedValue([actorId, 'a0000000-0000-4000-8000-000000000039']),
    } as never);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      createMany: notifyMany,
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    await service.recordCustomerDecision(
      principal,
      jobId,
      revisionId,
      {
        decision: 'abandoned',
        evidenceReference: 'Email dated 2026-11-26',
        lossReason: 'Project shelved by client',
        expectedVersion: 2,
      },
      'req-abandon',
    );

    expect(abandonJob).toHaveBeenCalledWith(companyId, jobId, 3, 'Project shelved by client', expect.any(Date), actorId);
    expect(cancelPendingDeadlineJobs).toHaveBeenCalledTimes(1);
    expect(markLeadAndOpportunityLost).toHaveBeenCalledWith(companyId, leadId, opportunityId, 'Project shelved by client', expect.any(Date), actorId);
    expect(notifyMany).toHaveBeenCalledTimes(1);
  });

  it('rejects design revision creation when design job is paused or cancelled', async () => {
    const service = new EngineeringService({} as never);
    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({ id: jobId, status: 'paused', designerUserId: actorId, rowVersion: 2 }),
    } as never);

    await expect(
      service.createRevision(principal, jobId, { title: 'R2', changeSummary: 'Update', expectedJobVersion: 2 }, 'req-frozen'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('transitions Lead/Opportunity and Design Job based on Quotation Decline leadOutcome', async () => {
    const setCommercialState = vi.fn().mockResolvedValue({});
    const setLeadStage = vi.fn().mockResolvedValue({});
    const freezeDesignJobOnQuotationOutcome = vi.fn().mockResolvedValue(undefined);

    const quotationService = new QuotationService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);

    vi.spyOn(await import('./quotation.repository.js'), 'createQuotationRepository').mockReturnValue({
      findRevision: vi.fn().mockResolvedValue({
        quotation: { id: 'q-1', quotationNumber: 'FS-QUO-001' },
        revision: { id: revisionId, status: 'issued', revisionNumber: 1, rowVersion: 2 },
      }),
      findContext: vi.fn().mockResolvedValue({
        jobId,
        opportunityId,
        opportunityCommercialState: 'quoted',
        leadId,
        leadStage: 'commercial_negotiation',
      }),
      transition: vi.fn().mockResolvedValue({ id: revisionId, status: 'declined', rowVersion: 3 }),
      createCustomerDecision: vi.fn().mockResolvedValue({ id: 'qd-1', recordedAt: new Date() }),
      setCommercialState,
      setLeadStage,
      findDesignJobSnapshot: vi.fn().mockResolvedValue({
        id: jobId,
        title: 'Warehouse Design',
        status: 'customer_approved',
        designerUserId: designerId,
        designHeadUserId: headId,
      }),
      freezeDesignJobOnQuotationOutcome,
      listSalesAndDesignRecipients: vi.fn().mockResolvedValue([actorId]),
    } as never);
    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({ id: jobId }),
    } as never);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      createMany: vi.fn().mockResolvedValue([]),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    await quotationService.recordCustomerDecision(
      principal,
      jobId,
      revisionId,
      {
        decision: 'declined',
        leadOutcome: 'put_on_hold',
        evidenceReference: 'Client requested budget pause',
        notes: 'Revisit Q1',
        expectedVersion: 2,
      },
      'req-decline-hold',
    );

    expect(setCommercialState).toHaveBeenCalledWith(companyId, opportunityId, 'on_hold', 'quoted');
    expect(setLeadStage).toHaveBeenCalledWith(companyId, leadId, 'on_hold', {
      previousStage: 'commercial_negotiation',
      updatedByUserId: actorId,
    });
    expect(freezeDesignJobOnQuotationOutcome).toHaveBeenCalledWith(
      companyId,
      jobId,
      'put_on_hold',
      'customer_approved',
      'Revisit Q1',
      expect.any(Date),
      actorId,
    );
  });

  it('allows administrators to reassign design head and design engineer on active jobs', async () => {
    const adminPrincipal: AuthenticatedPrincipal = {
      sessionId: 'sess-admin',
      userId: 'a0000000-0000-4000-8000-000000000099',
      companyId,
      name: 'System Admin',
      email: 'admin@test',
      mustChangePassword: false,
      grants: [{ permissionCode: 'system.access.all', scopeKind: 'company', scopeId: null, source: 'role' }],
    };
    const reassignAssignees = vi.fn().mockResolvedValue({ id: jobId, rowVersion: 4, status: 'authorized' });
    const enqueueDeadline = vi.fn().mockResolvedValue({});
    const service = new EngineeringService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);

    vi.spyOn(await import('./engineering.repository.js'), 'createEngineeringRepository').mockReturnValue({
      findJob: vi.fn().mockResolvedValue({
        id: jobId,
        title: 'Warehouse Design',
        status: 'awaiting_designer',
        leadId,
        opportunityId,
        designerUserId: null,
        designHeadUserId: headId,
        rowVersion: 3,
      }),
      reassignAssignees,
      enqueueDeadline,
    } as never);
    vi.spyOn(await import('../crm/crm.repository.js'), 'createCrmRepository').mockReturnValue({
      findEligibleUser: vi.fn().mockResolvedValue({ id: designerId, name: 'Designer', email: 'd@test' }),
    } as never);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      createMany: vi.fn().mockResolvedValue([]),
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    const updated = await service.reassignJob(
      adminPrincipal,
      jobId,
      { designHeadUserId: headId, designerUserId: designerId, expectedVersion: 3 },
      'req-reassign-admin',
    );
    expect(updated.rowVersion).toBe(4);
    expect(reassignAssignees).toHaveBeenCalledOnce();
    expect(enqueueDeadline).toHaveBeenCalledOnce();
  });
});
