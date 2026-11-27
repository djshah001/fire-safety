import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { qualifyLeadInputSchema } from './crm.schemas.js';
import { CrmService } from './crm.service.js';

describe('CRM Conversion, Opportunity Attachments & Lead Loopbacks', () => {
  const companyId = 'b0000000-0000-4000-8000-000000000001';
  const opportunityId = 'd0000000-0000-4000-8000-000000000001';
  const leadId = 'c0000000-0000-4000-8000-000000000001';
  const designHeadId = 'a0000000-0000-4000-8000-000000000021';
  const designerId = 'a0000000-0000-4000-8000-000000000022';
  const outsiderId = 'a0000000-0000-4000-8000-000000000023';

  it('validates unified conversion payload with pre-filled new customer and optional site', () => {
    const parsed = qualifyLeadInputSchema.parse({
      expectedVersion: 1,
      title: 'Apex Plant Fire Protection',
      qualificationNotes: 'Confirmed budget and timeline',
      newCustomer: {
        displayName: 'Apex Manufacturing Pvt Ltd',
        customerType: 'business',
        contact: {
          name: 'Ravi Patel',
          phone: '+91 9876543210',
          email: 'ravi@apex.test',
          isPrimary: true,
        },
        site: {
          name: 'Plant Unit 2',
          addressLine1: 'Plot 14 GIDC',
          city: 'Ahmedabad',
        },
      },
    });
    expect(parsed.newCustomer?.displayName).toBe('Apex Manufacturing Pvt Ltd');
    expect(parsed.newCustomer?.site?.city).toBe('Ahmedabad');

    expect(() =>
      qualifyLeadInputSchema.parse({
        expectedVersion: 1,
        title: 'Invalid Dual Mode',
        qualificationNotes: 'Both customerId and newCustomer provided',
        customerId: 'e0000000-0000-4000-8000-000000000001',
        primaryContactId: 'e1000000-0000-4000-8000-000000000001',
        newCustomer: {
          displayName: 'Duplicate',
          customerType: 'business',
          contact: { name: 'A', phone: '9876543210', isPrimary: true },
        },
      }),
    ).toThrow();
  });

  it('grants assigned Design Head & Engineer read access to opportunity attachments and blocks unassigned users', async () => {
    const service = new CrmService({} as never);
    const mockAttachments = [
      {
        id: 'att-1',
        opportunityId,
        originalName: 'site-plan.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksumSha256: 'abc',
        uploadedByUserId: outsiderId,
        uploadedByName: 'Sales User',
        createdAt: new Date(),
      },
    ];
    vi.spyOn(await import('./crm.repository.js'), 'createCrmRepository').mockReturnValue({
      findOpportunity: vi.fn().mockResolvedValue({ id: opportunityId, companyId }),
      findOpportunityWithAccess: vi.fn().mockResolvedValue(undefined),
      findDesignJobByOpportunity: vi.fn().mockResolvedValue({
        id: 'job-1',
        designHeadUserId: designHeadId,
        designerUserId: designerId,
      }),
      listOpportunityAttachments: vi.fn().mockResolvedValue(mockAttachments),
    } as never);

    const headPrincipal: AuthenticatedPrincipal = {
      sessionId: 's-head',
      userId: designHeadId,
      companyId,
      name: 'Design Head',
      email: 'head@test',
      mustChangePassword: false,
      grants: [{ permissionCode: 'engineering.design.review', scopeKind: 'company', scopeId: null, source: 'role' }],
    };
    const designerPrincipal: AuthenticatedPrincipal = {
      sessionId: 's-des',
      userId: designerId,
      companyId,
      name: 'Designer',
      email: 'designer@test',
      mustChangePassword: false,
      grants: [{ permissionCode: 'engineering.design.write', scopeKind: 'company', scopeId: null, source: 'role' }],
    };
    const outsiderPrincipal: AuthenticatedPrincipal = {
      sessionId: 's-out',
      userId: outsiderId,
      companyId,
      name: 'Other Engineer',
      email: 'other@test',
      mustChangePassword: false,
      grants: [{ permissionCode: 'engineering.design.write', scopeKind: 'company', scopeId: null, source: 'role' }],
    };

    expect(await service.listOpportunityAttachments(headPrincipal, opportunityId)).toHaveLength(1);
    expect(await service.listOpportunityAttachments(designerPrincipal, opportunityId)).toHaveLength(1);
    await expect(service.listOpportunityAttachments(outsiderPrincipal, opportunityId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('cancels active design job & deadline outbox when lead moves to lost, and pauses/resumes on on_hold/resume', async () => {
    const cancelDesignJob = vi.fn().mockResolvedValue({});
    const pauseDesignJob = vi.fn().mockResolvedValue({});
    const resumeDesignJob = vi.fn().mockResolvedValue({});
    const cancelPendingDesignDeadlines = vi.fn().mockResolvedValue(undefined);
    const enqueueResumedDesignDeadline = vi.fn().mockResolvedValue(undefined);
    const updateOpportunityStateOnLeadChange = vi.fn().mockResolvedValue({});
    const notifyCreateMany = vi.fn().mockResolvedValue([]);

    const salesPrincipal: AuthenticatedPrincipal = {
      sessionId: 's-sales',
      userId: outsiderId,
      companyId,
      name: 'Sales Exec',
      email: 'sales@test',
      mustChangePassword: false,
      grants: [
        { permissionCode: 'crm.lead.read', scopeKind: 'company', scopeId: null, source: 'role' },
        { permissionCode: 'crm.lead.write', scopeKind: 'company', scopeId: null, source: 'role' },
      ],
    };

    const service = new CrmService({
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as never);

    const mockRepo = {
      findLead: vi.fn().mockResolvedValue({
        id: leadId,
        leadNumber: 'FS-LD-001',
        stage: 'design_authorized',
        previousStage: null,
        rowVersion: 2,
      }),
      changeLeadStage: vi.fn().mockResolvedValue({
        id: leadId,
        leadNumber: 'FS-LD-001',
        stage: 'on_hold',
        rowVersion: 3,
      }),
      findOpportunityByLead: vi.fn().mockResolvedValue({ id: opportunityId, commercialState: 'unawarded', previousCommercialState: null }),
      findDesignJobByLead: vi.fn().mockResolvedValue({
        id: 'job-1',
        title: 'Apex Design',
        status: 'draft',
        previousStatus: null,
        designerUserId: designerId,
        designHeadUserId: designHeadId,
        designerCompletedAt: null,
        designDueAt: new Date('2026-12-05T10:00:00Z'),
      }),
      updateOpportunityStateOnLeadChange,
      pauseDesignJob,
      cancelDesignJob,
      resumeDesignJob,
      cancelPendingDesignDeadlines,
      enqueueResumedDesignDeadline,
    };

    vi.spyOn(await import('./crm.repository.js'), 'createCrmRepository').mockReturnValue(mockRepo as never);
    vi.spyOn(await import('../notifications/notification.repository.js'), 'createNotificationRepository').mockReturnValue({
      createMany: notifyCreateMany,
    } as never);
    vi.spyOn(await import('../auth/auth.repository.js'), 'createAuthRepository').mockReturnValue({
      appendAuditEvent: vi.fn().mockResolvedValue({}),
    } as never);

    await service.changeLeadStage(salesPrincipal, leadId, { expectedVersion: 2, stage: 'on_hold' }, 'req-hold');
    expect(pauseDesignJob).toHaveBeenCalledWith(companyId, 'job-1', 'draft', expect.any(Date), outsiderId);
    expect(cancelPendingDesignDeadlines).toHaveBeenCalledTimes(1);
    expect(updateOpportunityStateOnLeadChange).toHaveBeenCalledWith(companyId, opportunityId, 'on_hold', 'unawarded', expect.any(Date));

    // Resume from on_hold
    mockRepo.findLead.mockResolvedValueOnce({
      id: leadId,
      leadNumber: 'FS-LD-001',
      stage: 'on_hold',
      previousStage: 'design_authorized',
      rowVersion: 3,
    });
    mockRepo.changeLeadStage.mockResolvedValueOnce({
      id: leadId,
      leadNumber: 'FS-LD-001',
      stage: 'design_authorized',
      rowVersion: 4,
    });
    mockRepo.findOpportunityByLead.mockResolvedValueOnce({
      id: opportunityId,
      commercialState: 'on_hold',
      previousCommercialState: 'unawarded',
    });
    mockRepo.findDesignJobByLead.mockResolvedValueOnce({
      id: 'job-1',
      title: 'Apex Design',
      status: 'paused',
      previousStatus: 'draft',
      designerUserId: designerId,
      designHeadUserId: designHeadId,
      designerCompletedAt: null,
      designDueAt: new Date('2026-12-05T10:00:00Z'),
    });

    await service.changeLeadStage(salesPrincipal, leadId, { expectedVersion: 3, stage: 'resume' }, 'req-resume');
    expect(resumeDesignJob).toHaveBeenCalledWith(companyId, 'job-1', 'draft', expect.any(Date), outsiderId);
    expect(enqueueResumedDesignDeadline).toHaveBeenCalledTimes(1);

    // Lost cancels design job
    mockRepo.findLead.mockResolvedValueOnce({
      id: leadId,
      leadNumber: 'FS-LD-001',
      stage: 'design_authorized',
      previousStage: null,
      rowVersion: 4,
    });
    mockRepo.changeLeadStage.mockResolvedValueOnce({
      id: leadId,
      leadNumber: 'FS-LD-001',
      stage: 'lost',
      rowVersion: 5,
    });
    await service.changeLeadStage(
      salesPrincipal,
      leadId,
      { expectedVersion: 4, stage: 'lost', reason: 'Client cancelled' },
      'req-lost',
    );
    expect(cancelDesignJob).toHaveBeenCalledWith(companyId, 'job-1', 'Client cancelled', expect.any(Date), outsiderId);
  });
});
