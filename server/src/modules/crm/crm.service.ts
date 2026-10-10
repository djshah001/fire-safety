import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { normalizeEmail, normalizeName, normalizePhone } from '../../core/text/normalize.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasExplicitCompanyGrant, hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createCrmRepository, type CrmAccess } from './crm.repository.js';
import type {
  addressInputSchema,
  contactInputSchema,
  customerInputSchema,
  leadInputSchema,
  qualifyLeadInputSchema,
  siteInputSchema,
} from './crm.schemas.js';
import type { z } from 'zod';

type CustomerInput = z.infer<typeof customerInputSchema>;
type ContactInput = z.infer<typeof contactInputSchema>;
type AddressInput = z.infer<typeof addressInputSchema>;
type SiteInput = z.infer<typeof siteInputSchema>;
type LeadInput = z.infer<typeof leadInputSchema>;
type QualifyLeadInput = z.infer<typeof qualifyLeadInputSchema>;

function validationError(message: string, details?: unknown) {
  return new AppError('VALIDATION_ERROR', message, 422, details);
}

function normalizedContact(input: ContactInput) {
  const phoneNormalized = normalizePhone(input.phone);
  const emailNormalized = normalizeEmail(input.email);
  if (!phoneNormalized && !emailNormalized) {
    throw validationError('Provide a valid phone number or email address.');
  }
  return { ...input, phoneNormalized, emailNormalized };
}

function crmAccess(principal: AuthenticatedPrincipal): CrmAccess {
  return {
    companyId: principal.companyId,
    userId: principal.userId,
    unrestrictedCustomers:
      hasExplicitCompanyGrant(principal, 'crm.customer.read') ||
      hasExplicitCompanyGrant(principal, 'crm.customer_master.manage'),
    unrestrictedLeads:
      hasExplicitCompanyGrant(principal, 'crm.lead.read') ||
      hasExplicitCompanyGrant(principal, 'crm.lead.write'),
    unrestrictedOpportunities: hasExplicitCompanyGrant(principal, 'crm.opportunity.read'),
  };
}

export class CrmService {
  constructor(private readonly database: Database = db) {}

  listServiceCategories(principal: AuthenticatedPrincipal, includeInactive: boolean) {
    return createCrmRepository(this.database).listServiceCategories(principal.companyId, includeInactive);
  }

  async createServiceCategory(
    principal: AuthenticatedPrincipal,
    input: { code: string; name: string },
    requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const category = await createCrmRepository(transaction).createServiceCategory({
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        createdByUserId: principal.userId,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.service_category_created',
        targetType: 'service_category',
        targetId: category!.id,
        requestId,
      });
      return category!;
    });
  }

  async deactivateServiceCategory(
    principal: AuthenticatedPrincipal,
    id: string,
    expectedVersion: number,
    reason: string,
    requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const category = await createCrmRepository(transaction)
        .deactivateServiceCategory(principal.companyId, id, expectedVersion, new Date());
      if (!category) throw new ConflictError('The service category changed or is already inactive. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.service_category_deactivated',
        targetType: 'service_category',
        targetId: id,
        requestId,
        metadata: { reason },
      });
      return category;
    });
  }

  listCustomers(principal: AuthenticatedPrincipal, input: {
    status?: 'active' | 'inactive'; search?: string; page: number; pageSize: number;
  }) {
    return createCrmRepository(this.database).listCustomers(crmAccess(principal), {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }).then((result) => ({ ...result, page: input.page, pageSize: input.pageSize }));
  }

  async getCustomer(principal: AuthenticatedPrincipal, customerId: string) {
    const repository = createCrmRepository(this.database);
    const customer = await repository.findCustomer(crmAccess(principal), customerId);
    if (!customer) throw new NotFoundError('Customer not found.');
    return { ...customer, ...await repository.listCustomerChildren(principal.companyId, customerId) };
  }

  async createCustomer(principal: AuthenticatedPrincipal, input: CustomerInput, requestId: string) {
    const contacts = input.contacts.map(normalizedContact);
    if (contacts.filter((contact) => contact.isPrimary).length > 1) {
      throw validationError('Only one primary contact may be selected.');
    }
    if (!contacts.some((contact) => contact.isPrimary)) contacts[0]!.isPrimary = true;

    const duplicateHints = await createCrmRepository(this.database).findDuplicateHints(crmAccess(principal), {
      phoneNormalized: contacts[0]!.phoneNormalized,
      emailNormalized: contacts[0]!.emailNormalized,
      name: input.displayName,
    });

    const customerId = await this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const customer = await repository.createCustomer({
        companyId: principal.companyId,
        displayName: input.displayName,
        displayNameNormalized: normalizeName(input.displayName),
        legalName: input.legalName,
        createdByUserId: principal.userId,
      });
      await repository.addCustomerMember(principal.companyId, customer!.id, principal.userId, 'owner');
      await repository.createContacts(contacts.map((contact) => ({
        companyId: principal.companyId,
        customerId: customer!.id,
        name: contact.name,
        jobTitle: contact.jobTitle,
        phone: contact.phone,
        phoneNormalized: contact.phoneNormalized,
        email: contact.email,
        emailNormalized: contact.emailNormalized,
        isPrimary: contact.isPrimary,
        createdByUserId: principal.userId,
      })));
      await repository.createAddresses(input.addresses.map((address: AddressInput) => ({
        ...address,
        companyId: principal.companyId,
        customerId: customer!.id,
        createdByUserId: principal.userId,
      })));
      await repository.createSites(input.sites.map((site: SiteInput) => ({
        ...site,
        companyId: principal.companyId,
        customerId: customer!.id,
        createdByUserId: principal.userId,
      })));
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.customer_created',
        targetType: 'customer',
        targetId: customer!.id,
        requestId,
        metadata: { contactCount: contacts.length, siteCount: input.sites.length },
      });
      return customer!.id;
    });
    return { customer: await this.getCustomer(principal, customerId), duplicateHints };
  }

  async addContact(principal: AuthenticatedPrincipal, customerId: string, input: ContactInput, requestId: string) {
    const access = crmAccess(principal);
    const contact = normalizedContact(input);
    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const customer = await repository.findCustomer(access, customerId);
      if (!customer || customer.status !== 'active') throw new NotFoundError('Active customer not found.');
      const [created] = await repository.createContacts([{
        companyId: principal.companyId,
        customerId,
        name: contact.name,
        jobTitle: contact.jobTitle,
        phone: contact.phone,
        phoneNormalized: contact.phoneNormalized,
        email: contact.email,
        emailNormalized: contact.emailNormalized,
        isPrimary: contact.isPrimary,
        createdByUserId: principal.userId,
      }]);
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.customer_contact_created',
        targetType: 'customer',
        targetId: customerId,
        requestId,
        metadata: { contactId: created!.id },
      });
      return created!;
    });
  }

  async addSite(principal: AuthenticatedPrincipal, customerId: string, input: SiteInput, requestId: string) {
    const access = crmAccess(principal);
    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const customer = await repository.findCustomer(access, customerId);
      if (!customer || customer.status !== 'active') throw new NotFoundError('Active customer not found.');
      const [created] = await repository.createSites([{
        ...input,
        companyId: principal.companyId,
        customerId,
        createdByUserId: principal.userId,
      }]);
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.customer_site_created',
        targetType: 'customer',
        targetId: customerId,
        requestId,
        metadata: { siteId: created!.id },
      });
      return created!;
    });
  }

  async deactivateCustomer(
    principal: AuthenticatedPrincipal,
    customerId: string,
    expectedVersion: number,
    reason: string,
    requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const customer = await createCrmRepository(transaction)
        .deactivateCustomer(crmAccess(principal), customerId, expectedVersion, new Date());
      if (!customer) throw new ConflictError('The customer changed, is unavailable, or is already inactive.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.customer_deactivated',
        targetType: 'customer',
        targetId: customerId,
        requestId,
        metadata: { reason },
      });
      return customer;
    });
  }

  listAssignees(principal: AuthenticatedPrincipal) {
    return createCrmRepository(this.database).listAssignees(principal.companyId);
  }

  listLeads(principal: AuthenticatedPrincipal, input: {
    stage?: 'new' | 'contacted' | 'qualified' | 'design_authorized' | 'commercial_negotiation' | 'won' | 'lost' | 'on_hold';
    search?: string; page: number; pageSize: number;
  }) {
    return createCrmRepository(this.database).listLeads(crmAccess(principal), {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }).then((result) => ({ ...result, page: input.page, pageSize: input.pageSize }));
  }

  async getLead(principal: AuthenticatedPrincipal, leadId: string) {
    const lead = await createCrmRepository(this.database).findLead(crmAccess(principal), leadId);
    if (!lead) throw new NotFoundError('Lead not found.');
    return lead;
  }

  async createLead(principal: AuthenticatedPrincipal, input: LeadInput, requestId: string) {
    const phoneNormalized = normalizePhone(input.phone);
    const emailNormalized = normalizeEmail(input.email);
    if (!phoneNormalized && !emailNormalized) throw validationError('Provide a valid phone number or email address.');
    const ownerUserId = input.ownerUserId ?? principal.userId;
    if (ownerUserId !== principal.userId && !hasPermission(principal, 'crm.lead.assign')) {
      throw new ForbiddenError('You cannot assign this lead to another employee.');
    }
    const access = crmAccess(principal);
    const repository = createCrmRepository(this.database);
    const [category, owner] = await Promise.all([
      repository.findServiceCategory(principal.companyId, input.serviceCategoryId),
      repository.findActiveUser(principal.companyId, ownerUserId),
    ]);
    if (!category || category.status !== 'active') throw validationError('Choose an active service category.');
    if (!owner) throw validationError('Choose an active employee as lead owner.');

    if (input.customerId) {
      const customer = await repository.findCustomer(access, input.customerId);
      if (!customer || customer.status !== 'active') throw new NotFoundError('Active customer not found.');
      if (input.primaryContactId && !await repository.findContact(principal.companyId, input.customerId, input.primaryContactId)) {
        throw validationError('The selected contact does not belong to the customer.');
      }
      if (input.siteId && !await repository.findSite(principal.companyId, input.customerId, input.siteId)) {
        throw validationError('The selected site does not belong to the customer.');
      }
    }

    const duplicateHints = await repository.findDuplicateHints(access, {
      phoneNormalized,
      emailNormalized,
      name: input.inquiryName,
    });
    const leadId = await this.database.transaction(async (transaction) => {
      const transactionalRepository = createCrmRepository(transaction);
      const now = new Date();
      const leadNumber = await transactionalRepository.allocateLeadNumber(principal.companyId, now);
      const lead = await transactionalRepository.createLead({
        companyId: principal.companyId,
        leadNumber,
        inquiryName: input.inquiryName,
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        phoneNormalized,
        email: input.email,
        emailNormalized,
        address: input.address,
        source: input.source,
        serviceCategoryId: input.serviceCategoryId,
        ownerUserId,
        customerId: input.customerId,
        primaryContactId: input.primaryContactId,
        siteId: input.siteId,
        createdByUserId: principal.userId,
      });
      const memberIds = [...new Set([principal.userId, ownerUserId])];
      await transactionalRepository.addLeadMembers(memberIds.map((userId) => ({
        companyId: principal.companyId,
        leadId: lead!.id,
        userId,
        role: userId === ownerUserId ? 'owner' : 'collaborator',
      })));
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.lead_created',
        targetType: 'lead',
        targetId: lead!.id,
        requestId,
        metadata: { leadNumber, ownerUserId },
      });
      return lead!.id;
    });
    return { lead: await this.getLead(principal, leadId), duplicateHints };
  }

  async changeLeadStage(
    principal: AuthenticatedPrincipal,
    leadId: string,
    input: { expectedVersion: number; stage: 'contacted' | 'on_hold' | 'lost'; reason?: string },
    requestId: string,
  ) {
    const current = await this.getLead(principal, leadId);
    const allowedFrom: Record<typeof input.stage, Array<typeof current.stage>> = {
      contacted: ['new', 'on_hold'],
      on_hold: ['new', 'contacted'],
      lost: ['new', 'contacted', 'on_hold'],
    };
    if (!allowedFrom[input.stage].includes(current.stage)) {
      throw new ConflictError(`A ${current.stage} lead cannot move to ${input.stage}.`);
    }
    return this.database.transaction(async (transaction) => {
      const lead = await createCrmRepository(transaction).changeLeadStage(
        principal.companyId,
        leadId,
        input.expectedVersion,
        allowedFrom[input.stage],
        input.stage,
        input.stage === 'lost' ? input.reason! : null,
        new Date(),
      );
      if (!lead) throw new ConflictError('The lead changed before this action. Refresh and review it.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.lead_stage_changed',
        targetType: 'lead',
        targetId: leadId,
        requestId,
        metadata: { from: current.stage, to: input.stage, reason: input.reason },
      });
      return lead;
    });
  }

  async qualifyLead(principal: AuthenticatedPrincipal, leadId: string, input: QualifyLeadInput, requestId: string) {
    const access = crmAccess(principal);
    const repository = createCrmRepository(this.database);
    const lead = await repository.findLead(access, leadId);
    if (!lead) throw new NotFoundError('Lead not found.');
    if (lead.stage === 'qualified') {
      const existing = await repository.findOpportunityByLead(principal.companyId, leadId);
      if (
        existing && existing.customerId === input.customerId &&
        existing.primaryContactId === input.primaryContactId &&
        existing.siteId === (input.siteId ?? null) && existing.title === input.title
      ) return { opportunity: existing, replayed: true };
      throw new ConflictError('This lead has already been qualified with a different opportunity context.');
    }
    const customer = await repository.findCustomer(access, input.customerId);
    if (!customer || customer.status !== 'active') throw new NotFoundError('Active customer not found.');
    if (!await repository.findContact(principal.companyId, input.customerId, input.primaryContactId)) {
      throw validationError('The selected contact does not belong to the customer.');
    }
    if (input.siteId && !await repository.findSite(principal.companyId, input.customerId, input.siteId)) {
      throw validationError('The selected site does not belong to the customer.');
    }

    return this.database.transaction(async (transaction) => {
      const transactionalRepository = createCrmRepository(transaction);
      const now = new Date();
      const updatedLead = await transactionalRepository.qualifyLead({
        companyId: principal.companyId,
        leadId,
        expectedVersion: input.expectedVersion,
        customerId: input.customerId,
        primaryContactId: input.primaryContactId,
        siteId: input.siteId,
        qualificationNotes: input.qualificationNotes,
        now,
      });
      if (!updatedLead) throw new ConflictError('The lead changed or is no longer eligible for qualification.');
      const opportunity = await transactionalRepository.createOpportunity({
        companyId: principal.companyId,
        leadId,
        customerId: input.customerId,
        primaryContactId: input.primaryContactId,
        siteId: input.siteId,
        title: input.title,
        createdByUserId: principal.userId,
      });
      const members = await transactionalRepository.listLeadMembers(principal.companyId, leadId);
      await transactionalRepository.addOpportunityMembers(members.map((member) => ({
        companyId: principal.companyId,
        opportunityId: opportunity!.id,
        userId: member.userId,
        role: member.role === 'owner' ? 'owner' : 'sales',
      })));
      await Promise.all(members.map((member) => transactionalRepository.addCustomerMember(
        principal.companyId,
        input.customerId,
        member.userId,
        member.role === 'owner' ? 'owner' : 'viewer',
      )));
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.lead_qualified',
        targetType: 'opportunity',
        targetId: opportunity!.id,
        requestId,
        metadata: { leadId, customerId: input.customerId, siteId: input.siteId ?? null },
      });
      return { opportunity: opportunity!, replayed: false };
    });
  }

  listOpportunities(principal: AuthenticatedPrincipal, input: {
    state?: 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold';
    search?: string; page: number; pageSize: number;
  }) {
    return createCrmRepository(this.database).listOpportunities(crmAccess(principal), {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }).then((result) => ({ ...result, page: input.page, pageSize: input.pageSize }));
  }
}

export const crmService = new CrmService();
