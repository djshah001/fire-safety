import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  customerAddresses,
  customerContacts,
  customerMembers,
  customers,
  documentCounters,
  leadMembers,
  leads,
  opportunities,
  opportunityMembers,
  rolePermissions,
  roles,
  serviceCategories,
  sites,
  userRoleAssignments,
  users,
} from '../../infrastructure/database/schema/index.js';

export type CrmAccess = {
  companyId: string;
  userId: string;
  unrestrictedCustomers: boolean;
  unrestrictedLeads: boolean;
  unrestrictedOpportunities: boolean;
};

function customerAccessCondition(executor: DatabaseExecutor, access: CrmAccess) {
  if (access.unrestrictedCustomers) return undefined;
  return or(
    exists(executor.select({ value: sql`1` }).from(customerMembers).where(and(
      eq(customerMembers.customerId, customers.id),
      eq(customerMembers.userId, access.userId),
      eq(customerMembers.companyId, access.companyId),
    ))),
    exists(executor.select({ value: sql`1` }).from(leads)
      .innerJoin(leadMembers, eq(leadMembers.leadId, leads.id))
      .where(and(
        eq(leads.customerId, customers.id),
        eq(leadMembers.userId, access.userId),
        eq(leadMembers.companyId, access.companyId),
      ))),
    exists(executor.select({ value: sql`1` }).from(opportunities)
      .innerJoin(opportunityMembers, eq(opportunityMembers.opportunityId, opportunities.id))
      .where(and(
        eq(opportunities.customerId, customers.id),
        eq(opportunityMembers.userId, access.userId),
        eq(opportunityMembers.companyId, access.companyId),
      ))),
  );
}

function leadAccessCondition(executor: DatabaseExecutor, access: CrmAccess) {
  if (access.unrestrictedLeads) return undefined;
  return or(
    eq(leads.ownerUserId, access.userId),
    exists(executor.select({ value: sql`1` }).from(leadMembers).where(and(
      eq(leadMembers.leadId, leads.id),
      eq(leadMembers.userId, access.userId),
      eq(leadMembers.companyId, access.companyId),
    ))),
  );
}

function opportunityAccessCondition(executor: DatabaseExecutor, access: CrmAccess) {
  if (access.unrestrictedOpportunities) return undefined;
  return exists(executor.select({ value: sql`1` }).from(opportunityMembers).where(and(
    eq(opportunityMembers.opportunityId, opportunities.id),
    eq(opportunityMembers.userId, access.userId),
    eq(opportunityMembers.companyId, access.companyId),
  )));
}

export function createCrmRepository(executor: DatabaseExecutor) {
  return {
    async listServiceCategories(companyId: string, includeInactive = false) {
      return executor.select({
        id: serviceCategories.id,
        code: serviceCategories.code,
        name: serviceCategories.name,
        status: serviceCategories.status,
        rowVersion: serviceCategories.rowVersion,
      }).from(serviceCategories).where(and(
        eq(serviceCategories.companyId, companyId),
        includeInactive ? undefined : eq(serviceCategories.status, 'active'),
      )).orderBy(asc(serviceCategories.name));
    },

    async findServiceCategory(companyId: string, id: string) {
      const [category] = await executor.select().from(serviceCategories).where(and(
        eq(serviceCategories.companyId, companyId), eq(serviceCategories.id, id),
      )).limit(1);
      return category;
    },

    async createServiceCategory(input: typeof serviceCategories.$inferInsert) {
      const [category] = await executor.insert(serviceCategories).values(input).returning();
      return category;
    },

    async deactivateServiceCategory(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [category] = await executor.update(serviceCategories).set({
        status: 'inactive',
        rowVersion: sql`${serviceCategories.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(serviceCategories.companyId, companyId),
        eq(serviceCategories.id, id),
        eq(serviceCategories.rowVersion, expectedVersion),
        eq(serviceCategories.status, 'active'),
      )).returning();
      return category;
    },

    async listCustomers(access: CrmAccess, input: {
      status?: 'active' | 'inactive'; search?: string; limit: number; offset: number;
    }) {
      const scope = customerAccessCondition(executor, access);
      const search = input.search ? ilike(customers.displayName, `%${input.search}%`) : undefined;
      const where = and(
        eq(customers.companyId, access.companyId),
        input.status ? eq(customers.status, input.status) : undefined,
        search,
        scope,
      );
      const selection = {
        id: customers.id,
        displayName: customers.displayName,
        legalName: customers.legalName,
        status: customers.status,
        rowVersion: customers.rowVersion,
        updatedAt: customers.updatedAt,
      };
      const [items, totals] = await Promise.all([
        executor.select(selection).from(customers).where(where)
          .orderBy(asc(customers.displayName), asc(customers.id)).limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(customers).where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },

    async findCustomer(access: CrmAccess, customerId: string) {
      const [customer] = await executor.select({
        id: customers.id,
        displayName: customers.displayName,
        legalName: customers.legalName,
        status: customers.status,
        rowVersion: customers.rowVersion,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      }).from(customers).where(and(
        eq(customers.companyId, access.companyId),
        eq(customers.id, customerId),
        customerAccessCondition(executor, access),
      )).limit(1);
      return customer;
    },

    async listCustomerChildren(companyId: string, customerId: string) {
      const [contacts, addresses, customerSites] = await Promise.all([
        executor.select({
          id: customerContacts.id,
          name: customerContacts.name,
          jobTitle: customerContacts.jobTitle,
          phone: customerContacts.phone,
          email: customerContacts.email,
          isPrimary: customerContacts.isPrimary,
          status: customerContacts.status,
          rowVersion: customerContacts.rowVersion,
        }).from(customerContacts).where(and(
          eq(customerContacts.companyId, companyId), eq(customerContacts.customerId, customerId),
        )).orderBy(desc(customerContacts.isPrimary), asc(customerContacts.name)),
        executor.select({
          id: customerAddresses.id,
          label: customerAddresses.label,
          addressLine1: customerAddresses.addressLine1,
          addressLine2: customerAddresses.addressLine2,
          city: customerAddresses.city,
          state: customerAddresses.state,
          postalCode: customerAddresses.postalCode,
          country: customerAddresses.country,
          status: customerAddresses.status,
          rowVersion: customerAddresses.rowVersion,
        }).from(customerAddresses).where(and(
          eq(customerAddresses.companyId, companyId), eq(customerAddresses.customerId, customerId),
        )).orderBy(asc(customerAddresses.label)),
        executor.select({
          id: sites.id,
          name: sites.name,
          addressLine1: sites.addressLine1,
          addressLine2: sites.addressLine2,
          city: sites.city,
          state: sites.state,
          postalCode: sites.postalCode,
          country: sites.country,
          status: sites.status,
          rowVersion: sites.rowVersion,
        }).from(sites).where(and(
          eq(sites.companyId, companyId), eq(sites.customerId, customerId),
        )).orderBy(asc(sites.name)),
      ]);
      return { contacts, addresses, sites: customerSites };
    },

    async createCustomer(input: typeof customers.$inferInsert) {
      const [customer] = await executor.insert(customers).values(input).returning();
      return customer;
    },

    async addCustomerMember(companyId: string, customerId: string, userId: string, role: string) {
      await executor.insert(customerMembers).values({ companyId, customerId, userId, role })
        .onConflictDoNothing();
    },

    async createContacts(values: Array<typeof customerContacts.$inferInsert>) {
      if (values.length === 0) return [];
      return executor.insert(customerContacts).values(values).returning();
    },

    async createAddresses(values: Array<typeof customerAddresses.$inferInsert>) {
      if (values.length === 0) return [];
      return executor.insert(customerAddresses).values(values).returning();
    },

    async createSites(values: Array<typeof sites.$inferInsert>) {
      if (values.length === 0) return [];
      return executor.insert(sites).values(values).returning();
    },

    async findContact(companyId: string, customerId: string, contactId: string) {
      const [contact] = await executor.select().from(customerContacts).where(and(
        eq(customerContacts.companyId, companyId),
        eq(customerContacts.customerId, customerId),
        eq(customerContacts.id, contactId),
        eq(customerContacts.status, 'active'),
      )).limit(1);
      return contact;
    },

    async findSite(companyId: string, customerId: string, siteId: string) {
      const [site] = await executor.select().from(sites).where(and(
        eq(sites.companyId, companyId),
        eq(sites.customerId, customerId),
        eq(sites.id, siteId),
        eq(sites.status, 'active'),
      )).limit(1);
      return site;
    },

    async deactivateCustomer(access: CrmAccess, customerId: string, expectedVersion: number, now: Date) {
      const visible = await this.findCustomer(access, customerId);
      if (!visible) return undefined;
      const [customer] = await executor.update(customers).set({
        status: 'inactive',
        rowVersion: sql`${customers.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(customers.companyId, access.companyId),
        eq(customers.id, customerId),
        eq(customers.rowVersion, expectedVersion),
        eq(customers.status, 'active'),
      )).returning();
      return customer;
    },

    async allocateLeadNumber(companyId: string, now: Date) {
      const periodKey = String(now.getUTCFullYear());
      const [counter] = await executor.insert(documentCounters).values({
        companyId,
        documentType: 'LEAD',
        periodKey,
        nextValue: 2,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [documentCounters.companyId, documentCounters.documentType, documentCounters.periodKey],
        set: { nextValue: sql`${documentCounters.nextValue} + 1`, updatedAt: now },
      }).returning({ allocated: sql<number>`${documentCounters.nextValue} - 1` });
      return `FS-LEAD-${periodKey}-${String(counter!.allocated).padStart(6, '0')}`;
    },

    async findActiveUser(companyId: string, userId: string, now = new Date()) {
      const [user] = await executor.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(and(
          eq(users.companyId, companyId), eq(users.id, userId), eq(users.status, 'active'),
          exists(executor.select({ value: sql`1` }).from(userRoleAssignments)
            .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
            .where(and(
              eq(userRoleAssignments.companyId, companyId),
              eq(userRoleAssignments.userId, users.id),
              eq(roles.companyId, companyId),
              eq(roles.isActive, true),
              eq(rolePermissions.permissionCode, 'crm.lead.write'),
              lte(userRoleAssignments.validFrom, now),
              or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
            ))),
        )).limit(1);
      return user;
    },

    async listAssignees(companyId: string, now = new Date()) {
      return executor.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(and(
          eq(users.companyId, companyId),
          eq(users.status, 'active'),
          exists(executor.select({ value: sql`1` }).from(userRoleAssignments)
            .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
            .where(and(
              eq(userRoleAssignments.companyId, companyId),
              eq(userRoleAssignments.userId, users.id),
              eq(roles.companyId, companyId),
              eq(roles.isActive, true),
              eq(rolePermissions.permissionCode, 'crm.lead.write'),
              lte(userRoleAssignments.validFrom, now),
              or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
            ))),
        ))
        .orderBy(asc(users.name));
    },

    async createLead(input: typeof leads.$inferInsert) {
      const [lead] = await executor.insert(leads).values(input).returning();
      return lead;
    },

    async findDuplicateHints(access: CrmAccess, input: {
      phoneNormalized: string | null;
      emailNormalized: string | null;
      name: string;
    }) {
      const methodMatch = or(
        input.phoneNormalized ? eq(customerContacts.phoneNormalized, input.phoneNormalized) : undefined,
        input.emailNormalized ? eq(customerContacts.emailNormalized, input.emailNormalized) : undefined,
      );
      const leadMethodMatch = or(
        input.phoneNormalized ? eq(leads.phoneNormalized, input.phoneNormalized) : undefined,
        input.emailNormalized ? eq(leads.emailNormalized, input.emailNormalized) : undefined,
        ilike(leads.inquiryName, input.name),
      );
      const [customerMatches, leadMatches] = await Promise.all([
        executor.select({
          type: sql<'customer'>`'customer'`,
          id: customers.id,
          label: customers.displayName,
          reason: sql<string>`case
            when ${customerContacts.emailNormalized} = ${input.emailNormalized ?? ''} then 'matching email'
            when ${customerContacts.phoneNormalized} = ${input.phoneNormalized ?? ''} then 'matching phone'
            else 'similar name' end`,
        }).from(customers)
          .leftJoin(customerContacts, eq(customerContacts.customerId, customers.id))
          .where(and(
            eq(customers.companyId, access.companyId),
            customerAccessCondition(executor, access),
            or(methodMatch, ilike(customers.displayName, input.name)),
          )).limit(5),
        executor.select({
          type: sql<'lead'>`'lead'`,
          id: leads.id,
          label: leads.inquiryName,
          reason: sql<string>`case
            when ${leads.emailNormalized} = ${input.emailNormalized ?? ''} then 'matching email'
            when ${leads.phoneNormalized} = ${input.phoneNormalized ?? ''} then 'matching phone'
            else 'similar name' end`,
        }).from(leads).where(and(
          eq(leads.companyId, access.companyId),
          leadAccessCondition(executor, access),
          leadMethodMatch,
        )).limit(5),
      ]);
      return [...customerMatches, ...leadMatches];
    },

    async addLeadMembers(values: Array<typeof leadMembers.$inferInsert>) {
      if (values.length === 0) return;
      await executor.insert(leadMembers).values(values).onConflictDoNothing();
    },

    async listLeads(access: CrmAccess, input: {
      stage?: typeof leads.$inferSelect.stage; search?: string; limit: number; offset: number;
    }) {
      const search = input.search ? or(
        ilike(leads.leadNumber, `%${input.search}%`),
        ilike(leads.inquiryName, `%${input.search}%`),
        ilike(leads.companyName, `%${input.search}%`),
        ilike(leads.contactName, `%${input.search}%`),
      ) : undefined;
      const where = and(
        eq(leads.companyId, access.companyId),
        input.stage ? eq(leads.stage, input.stage) : undefined,
        search,
        leadAccessCondition(executor, access),
      );
      const selection = {
        id: leads.id,
        leadNumber: leads.leadNumber,
        inquiryName: leads.inquiryName,
        companyName: leads.companyName,
        contactName: leads.contactName,
        phone: leads.phone,
        email: leads.email,
        source: leads.source,
        stage: leads.stage,
        ownerUserId: leads.ownerUserId,
        rowVersion: leads.rowVersion,
        updatedAt: leads.updatedAt,
        serviceCategoryName: serviceCategories.name,
      };
      const [items, totals] = await Promise.all([
        executor.select(selection).from(leads)
          .innerJoin(serviceCategories, eq(serviceCategories.id, leads.serviceCategoryId))
          .where(where).orderBy(desc(leads.updatedAt), desc(leads.id)).limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(leads).where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },

    async findLead(access: CrmAccess, leadId: string) {
      const [lead] = await executor.select({
        id: leads.id,
        leadNumber: leads.leadNumber,
        inquiryName: leads.inquiryName,
        companyName: leads.companyName,
        contactName: leads.contactName,
        phone: leads.phone,
        email: leads.email,
        address: leads.address,
        source: leads.source,
        serviceCategoryId: leads.serviceCategoryId,
        ownerUserId: leads.ownerUserId,
        customerId: leads.customerId,
        primaryContactId: leads.primaryContactId,
        siteId: leads.siteId,
        stage: leads.stage,
        lostReason: leads.lostReason,
        qualificationNotes: leads.qualificationNotes,
        rowVersion: leads.rowVersion,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      }).from(leads).where(and(
        eq(leads.companyId, access.companyId),
        eq(leads.id, leadId),
        leadAccessCondition(executor, access),
      )).limit(1);
      return lead;
    },

    async listLeadMembers(companyId: string, leadId: string) {
      return executor.select({ userId: leadMembers.userId, role: leadMembers.role })
        .from(leadMembers).where(and(
          eq(leadMembers.companyId, companyId), eq(leadMembers.leadId, leadId),
        ));
    },

    async changeLeadStage(
      companyId: string,
      leadId: string,
      expectedVersion: number,
      fromStages: Array<typeof leads.$inferSelect.stage>,
      stage: typeof leads.$inferSelect.stage,
      lostReason: string | null,
      now: Date,
    ) {
      const [lead] = await executor.update(leads).set({
        stage,
        lostReason,
        rowVersion: sql`${leads.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(leads.companyId, companyId),
        eq(leads.id, leadId),
        eq(leads.rowVersion, expectedVersion),
        inArray(leads.stage, fromStages),
      )).returning();
      return lead;
    },

    async qualifyLead(input: {
      companyId: string;
      leadId: string;
      expectedVersion: number;
      customerId: string;
      primaryContactId: string;
      siteId?: string;
      qualificationNotes: string;
      now: Date;
    }) {
      const [lead] = await executor.update(leads).set({
        customerId: input.customerId,
        primaryContactId: input.primaryContactId,
        siteId: input.siteId,
        qualificationNotes: input.qualificationNotes,
        stage: 'qualified',
        rowVersion: sql`${leads.rowVersion} + 1`,
        updatedAt: input.now,
      }).where(and(
        eq(leads.companyId, input.companyId),
        eq(leads.id, input.leadId),
        eq(leads.rowVersion, input.expectedVersion),
        inArray(leads.stage, ['new', 'contacted', 'on_hold']),
      )).returning();
      return lead;
    },

    async createOpportunity(input: typeof opportunities.$inferInsert) {
      const [opportunity] = await executor.insert(opportunities).values(input).returning();
      return opportunity;
    },

    async addOpportunityMembers(values: Array<typeof opportunityMembers.$inferInsert>) {
      if (values.length === 0) return;
      await executor.insert(opportunityMembers).values(values).onConflictDoNothing();
    },

    async findOpportunityByLead(companyId: string, leadId: string) {
      const [opportunity] = await executor.select().from(opportunities).where(and(
        eq(opportunities.companyId, companyId), eq(opportunities.leadId, leadId),
      )).limit(1);
      return opportunity;
    },

    async listOpportunities(access: CrmAccess, input: {
      state?: typeof opportunities.$inferSelect.commercialState; search?: string; limit: number; offset: number;
    }) {
      const search = input.search ? or(
        ilike(opportunities.title, `%${input.search}%`),
        ilike(customers.displayName, `%${input.search}%`),
        ilike(leads.leadNumber, `%${input.search}%`),
      ) : undefined;
      const where = and(
        eq(opportunities.companyId, access.companyId),
        input.state ? eq(opportunities.commercialState, input.state) : undefined,
        search,
        opportunityAccessCondition(executor, access),
      );
      const selection = {
        id: opportunities.id,
        leadId: opportunities.leadId,
        leadNumber: leads.leadNumber,
        title: opportunities.title,
        customerId: opportunities.customerId,
        customerName: customers.displayName,
        siteId: opportunities.siteId,
        commercialState: opportunities.commercialState,
        rowVersion: opportunities.rowVersion,
        updatedAt: opportunities.updatedAt,
      };
      const [items, totals] = await Promise.all([
        executor.select(selection).from(opportunities)
          .innerJoin(leads, eq(leads.id, opportunities.leadId))
          .innerJoin(customers, eq(customers.id, opportunities.customerId))
          .where(where).orderBy(desc(opportunities.updatedAt), desc(opportunities.id))
          .limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(opportunities)
          .innerJoin(leads, eq(leads.id, opportunities.leadId))
          .innerJoin(customers, eq(customers.id, opportunities.customerId))
          .where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },
  };
}
