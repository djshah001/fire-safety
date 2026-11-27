import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  not,
  or,
  sql,
} from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import {
  customerAddresses,
  customerContacts,
  customerMembers,
  customers,
  crmActivities,
  crmImportBatches,
  crmImportRows,
  documentCounters,
  designJobs,
  leadAttachments,
  leadMembers,
  leadPurposes,
  leads,
  marketSectors,
  opportunities,
  opportunityAttachments,
  opportunityMembers,
  outboxJobs,
  reminderOccurrences,
  reminderRules,
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

    async findServiceCategoryByCode(companyId: string, code: string) {
      const [category] = await executor.select().from(serviceCategories).where(and(
        eq(serviceCategories.companyId, companyId),
        eq(serviceCategories.code, code),
        eq(serviceCategories.status, 'active'),
      )).limit(1);
      return category;
    },

    async createServiceCategory(input: typeof serviceCategories.$inferInsert) {
      const [category] = await executor.insert(serviceCategories).values(input).returning();
      return category;
    },

    listLeadPurposes(companyId: string, includeInactive = false) {
      return executor.select().from(leadPurposes).where(and(
        eq(leadPurposes.companyId, companyId),
        includeInactive ? undefined : eq(leadPurposes.status, 'active'),
      )).orderBy(asc(leadPurposes.name));
    },

    listMarketSectors(companyId: string, includeInactive = false) {
      return executor.select().from(marketSectors).where(and(
        eq(marketSectors.companyId, companyId),
        includeInactive ? undefined : eq(marketSectors.status, 'active'),
      )).orderBy(asc(marketSectors.name));
    },

    async findLeadPurpose(companyId: string, id: string) {
      const [row] = await executor.select().from(leadPurposes).where(and(
        eq(leadPurposes.companyId, companyId), eq(leadPurposes.id, id),
      )).limit(1);
      return row;
    },

    async findMarketSector(companyId: string, id: string) {
      const [row] = await executor.select().from(marketSectors).where(and(
        eq(marketSectors.companyId, companyId), eq(marketSectors.id, id),
      )).limit(1);
      return row;
    },

    async findLeadPurposeByCode(companyId: string, code: string) {
      const [row] = await executor.select().from(leadPurposes).where(and(
        eq(leadPurposes.companyId, companyId), eq(leadPurposes.code, code), eq(leadPurposes.status, 'active'),
      )).limit(1);
      return row;
    },

    async findMarketSectorByCode(companyId: string, code: string) {
      const [row] = await executor.select().from(marketSectors).where(and(
        eq(marketSectors.companyId, companyId), eq(marketSectors.code, code), eq(marketSectors.status, 'active'),
      )).limit(1);
      return row;
    },

    async createLeadPurpose(input: typeof leadPurposes.$inferInsert) {
      const [row] = await executor.insert(leadPurposes).values(input).returning();
      return row!;
    },

    async createMarketSector(input: typeof marketSectors.$inferInsert) {
      const [row] = await executor.insert(marketSectors).values(input).returning();
      return row!;
    },

    async deactivateLeadPurpose(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(leadPurposes).set({
        status: 'inactive', rowVersion: sql`${leadPurposes.rowVersion} + 1`, updatedAt: now,
      }).where(and(eq(leadPurposes.companyId, companyId), eq(leadPurposes.id, id),
        eq(leadPurposes.rowVersion, expectedVersion), eq(leadPurposes.status, 'active'))).returning();
      return row;
    },

    async deactivateMarketSector(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(marketSectors).set({
        status: 'inactive', rowVersion: sql`${marketSectors.rowVersion} + 1`, updatedAt: now,
      }).where(and(eq(marketSectors.companyId, companyId), eq(marketSectors.id, id),
        eq(marketSectors.rowVersion, expectedVersion), eq(marketSectors.status, 'active'))).returning();
      return row;
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
      sort: 'name' | 'status' | 'updatedAt'; direction: 'asc' | 'desc';
    }) {
      const scope = customerAccessCondition(executor, access);
      const search = input.search ? or(
        ilike(customers.displayName, `%${input.search}%`),
        ilike(customers.legalName, `%${input.search}%`),
        ilike(customers.gstin, `%${input.search.toUpperCase()}%`),
        ilike(customers.pan, `%${input.search.toUpperCase()}%`),
      ) : undefined;
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
        customerType: customers.customerType,
        gstin: customers.gstin,
        pan: customers.pan,
        status: customers.status,
        rowVersion: customers.rowVersion,
        updatedAt: customers.updatedAt,
      };
      const sortColumn = { name: customers.displayName, status: customers.status, updatedAt: customers.updatedAt }[input.sort];
      const order = input.direction === 'asc' ? asc : desc;
      const [items, totals] = await Promise.all([
        executor.select(selection).from(customers).where(where)
          .orderBy(order(sortColumn), order(customers.id)).limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(customers).where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },

    async findCustomer(access: CrmAccess, customerId: string) {
      const [customer] = await executor.select({
        id: customers.id,
        displayName: customers.displayName,
        legalName: customers.legalName,
        customerType: customers.customerType,
        gstin: customers.gstin,
        pan: customers.pan,
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

    async findActiveUserByEmail(companyId: string, emailNormalized: string, now = new Date()) {
      const [user] = await executor.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(and(
          eq(users.companyId, companyId),
          eq(users.emailNormalized, emailNormalized),
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
        )).limit(1);
      return user;
    },

    async listAssignees(companyId: string, now = new Date()) {
      return executor.select({ id: users.id, name: users.name, email: users.email, isOnLeave: users.isOnLeave })
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

    async listEligibleUsers(companyId: string, permissionCode: string, now = new Date()) {
      return executor.select({ id: users.id, name: users.name, email: users.email, isOnLeave: users.isOnLeave })
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
              inArray(rolePermissions.permissionCode, [permissionCode, 'system.access.all']),
              lte(userRoleAssignments.validFrom, now),
              or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
            ))),
        )).orderBy(asc(users.name));
    },

    async findEligibleUser(companyId: string, userId: string, permissionCode: string, now = new Date()) {
      const [user] = await executor.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(and(
          eq(users.companyId, companyId),
          eq(users.id, userId),
          eq(users.status, 'active'),
          exists(executor.select({ value: sql`1` }).from(userRoleAssignments)
            .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
            .where(and(
              eq(userRoleAssignments.companyId, companyId),
              eq(userRoleAssignments.userId, users.id),
              eq(roles.companyId, companyId),
              eq(roles.isActive, true),
              inArray(rolePermissions.permissionCode, [permissionCode, 'system.access.all']),
              lte(userRoleAssignments.validFrom, now),
              or(isNull(userRoleAssignments.validUntil), gt(userRoleAssignments.validUntil, now)),
            ))),
        )).limit(1);
      return user;
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

    async changeLeadOwner(
      companyId: string,
      leadId: string,
      expectedVersion: number,
      ownerUserId: string,
      now: Date,
      updatedByUserId?: string,
    ) {
      const [lead] = await executor.update(leads).set({
        ownerUserId,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${leads.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(leads.companyId, companyId),
        eq(leads.id, leadId),
        eq(leads.rowVersion, expectedVersion),
      )).returning();
      return lead;
    },

    async touchLeadUpdatedBy(companyId: string, leadId: string, userId: string, now: Date) {
      await executor.update(leads).set({
        updatedByUserId: userId,
        updatedAt: now,
      }).where(and(eq(leads.companyId, companyId), eq(leads.id, leadId)));
    },

    async replaceLeadOwnerMember(companyId: string, leadId: string, ownerUserId: string) {
      await executor.delete(leadMembers).where(and(
        eq(leadMembers.companyId, companyId),
        eq(leadMembers.leadId, leadId),
        eq(leadMembers.role, 'owner'),
      ));
      await executor.insert(leadMembers).values({
        companyId,
        leadId,
        userId: ownerUserId,
        role: 'owner',
      }).onConflictDoUpdate({
        target: [leadMembers.leadId, leadMembers.userId],
        set: { role: 'owner' },
      });
    },

    async listLeadFilterOptions(access: CrmAccess) {
      const scope = leadAccessCondition(executor, access);
      const [sources, activeUsers] = await Promise.all([
        executor
          .select({ source: leads.source })
          .from(leads)
          .where(and(eq(leads.companyId, access.companyId), scope))
          .groupBy(leads.source)
          .orderBy(asc(leads.source)),
        executor
          .select({ id: users.id, name: users.name, email: users.email, isOnLeave: users.isOnLeave })
          .from(users)
          .where(and(eq(users.companyId, access.companyId), eq(users.status, 'active')))
          .orderBy(asc(users.name)),
      ]);
      return {
        sources: sources.map((row) => row.source).filter(Boolean),
        users: activeUsers,
      };
    },

    async listLeads(access: CrmAccess, input: {
      stage?: typeof leads.$inferSelect.stage;
      serviceCategoryId?: string;
      purposeId?: string;
      sectorId?: string;
      source?: string;
      ownerUserId?: string;
      updatedByUserId?: string;
      converted?: 'yes' | 'no';
      hasDesignJob?: 'yes' | 'no';
      createdFrom?: string;
      createdTo?: string;
      updatedFrom?: string;
      updatedTo?: string;
      search?: string;
      limit: number;
      offset: number;
      sort: 'leadNumber' | 'inquiryName' | 'stage' | 'ownerName' | 'source' | 'createdAt' | 'updatedAt';
      direction: 'asc' | 'desc';
    }) {
      const search = input.search ? or(
        ilike(leads.leadNumber, `%${input.search}%`),
        ilike(leads.inquiryName, `%${input.search}%`),
        ilike(leads.companyName, `%${input.search}%`),
        ilike(leads.contactName, `%${input.search}%`),
        ilike(leads.phone, `%${input.search}%`),
        ilike(leads.email, `%${input.search}%`),
        ilike(leads.source, `%${input.search}%`),
      ) : undefined;
      const convertedFilter = input.converted
        ? (input.converted === 'yes' ? exists : not)(
            executor.select({ value: sql`1` }).from(opportunities).where(and(
              eq(opportunities.companyId, leads.companyId),
              eq(opportunities.leadId, leads.id),
            )),
          )
        : undefined;
      const designJobFilter = input.hasDesignJob
        ? (input.hasDesignJob === 'yes' ? exists : not)(
            executor.select({ value: sql`1` }).from(designJobs).where(and(
              eq(designJobs.companyId, leads.companyId),
              eq(designJobs.leadId, leads.id),
            )),
          )
        : undefined;
      const dayAfter = (dateString: string) => {
        const d = new Date(`${dateString}T00:00:00.000Z`);
        return new Date(d.getTime() + 86_400_000);
      };
      const where = and(
        eq(leads.companyId, access.companyId),
        input.stage ? eq(leads.stage, input.stage) : undefined,
        input.serviceCategoryId ? eq(leads.serviceCategoryId, input.serviceCategoryId) : undefined,
        input.purposeId ? eq(leads.purposeId, input.purposeId) : undefined,
        input.sectorId ? eq(leads.sectorId, input.sectorId) : undefined,
        input.source ? ilike(leads.source, input.source) : undefined,
        input.ownerUserId ? eq(leads.ownerUserId, input.ownerUserId) : undefined,
        input.updatedByUserId
          ? sql`coalesce(${leads.updatedByUserId}, ${leads.createdByUserId}) = ${input.updatedByUserId}`
          : undefined,
        convertedFilter,
        designJobFilter,
        input.createdFrom ? gte(leads.createdAt, new Date(`${input.createdFrom}T00:00:00.000Z`)) : undefined,
        input.createdTo ? lt(leads.createdAt, dayAfter(input.createdTo)) : undefined,
        input.updatedFrom ? gte(leads.updatedAt, new Date(`${input.updatedFrom}T00:00:00.000Z`)) : undefined,
        input.updatedTo ? lt(leads.updatedAt, dayAfter(input.updatedTo)) : undefined,
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
        ownerName: sql<string>`owner_user.name`,
        ownerIsOnLeave: sql<boolean>`owner_user.is_on_leave`,
        createdByUserId: leads.createdByUserId,
        createdByName: sql<string>`created_user.name`,
        lastModifiedByUserId: sql<string>`coalesce(${leads.updatedByUserId}, ${leads.createdByUserId})`,
        lastModifiedByName: sql<string>`coalesce(updated_user.name, created_user.name)`,
        opportunityId: opportunities.id,
        designJobId: designJobs.id,
        designStatus: designJobs.status,
        rowVersion: leads.rowVersion,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        serviceCategoryId: leads.serviceCategoryId,
        serviceCategoryName: serviceCategories.name,
        purposeId: leads.purposeId,
        purposeName: leadPurposes.name,
        sectorId: leads.sectorId,
        sectorName: marketSectors.name,
      };
      const sortExpr = {
        leadNumber: leads.leadNumber,
        inquiryName: leads.inquiryName,
        stage: leads.stage,
        ownerName: sql`owner_user.name`,
        source: leads.source,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      }[input.sort];
      const order = input.direction === 'asc' ? asc : desc;
      const [items, totals] = await Promise.all([
        executor.select(selection).from(leads)
          .innerJoin(serviceCategories, eq(serviceCategories.id, leads.serviceCategoryId))
          .innerJoin(leadPurposes, eq(leadPurposes.id, leads.purposeId))
          .innerJoin(marketSectors, eq(marketSectors.id, leads.sectorId))
          .innerJoin(sql`${users} owner_user`, sql`owner_user.id = ${leads.ownerUserId}`)
          .innerJoin(sql`${users} created_user`, sql`created_user.id = ${leads.createdByUserId}`)
          .leftJoin(sql`${users} updated_user`, sql`updated_user.id = ${leads.updatedByUserId}`)
          .leftJoin(opportunities, and(eq(opportunities.companyId, leads.companyId), eq(opportunities.leadId, leads.id)))
          .leftJoin(designJobs, and(eq(designJobs.companyId, leads.companyId), eq(designJobs.leadId, leads.id)))
          .where(where).orderBy(order(sortExpr), order(leads.id)).limit(input.limit).offset(input.offset),
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
        serviceCategoryName: serviceCategories.name,
        purposeId: leads.purposeId,
        sectorId: leads.sectorId,
        purposeName: leadPurposes.name,
        sectorName: marketSectors.name,
        ownerUserId: leads.ownerUserId,
        ownerName: sql<string>`owner_user.name`,
        ownerIsOnLeave: sql<boolean>`owner_user.is_on_leave`,
        createdByUserId: leads.createdByUserId,
        createdByName: sql<string>`created_user.name`,
        lastModifiedByUserId: sql<string>`coalesce(${leads.updatedByUserId}, ${leads.createdByUserId})`,
        lastModifiedByName: sql<string>`coalesce(updated_user.name, created_user.name)`,
        customerId: leads.customerId,
        primaryContactId: leads.primaryContactId,
        siteId: leads.siteId,
        opportunityId: opportunities.id,
        designJobId: designJobs.id,
        designStatus: designJobs.status,
        stage: leads.stage,
        previousStage: leads.previousStage,
        lostReason: leads.lostReason,
        qualificationNotes: leads.qualificationNotes,
        rowVersion: leads.rowVersion,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      }).from(leads)
        .innerJoin(serviceCategories, eq(serviceCategories.id, leads.serviceCategoryId))
        .innerJoin(leadPurposes, eq(leadPurposes.id, leads.purposeId))
        .innerJoin(marketSectors, eq(marketSectors.id, leads.sectorId))
        .innerJoin(sql`${users} owner_user`, sql`owner_user.id = ${leads.ownerUserId}`)
        .innerJoin(sql`${users} created_user`, sql`created_user.id = ${leads.createdByUserId}`)
        .leftJoin(sql`${users} updated_user`, sql`updated_user.id = ${leads.updatedByUserId}`)
        .leftJoin(opportunities, and(eq(opportunities.companyId, leads.companyId), eq(opportunities.leadId, leads.id)))
        .leftJoin(designJobs, and(eq(designJobs.companyId, leads.companyId), eq(designJobs.leadId, leads.id)))
        .where(and(
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
      previousStage: typeof leads.$inferSelect.stage | null = null,
      updatedByUserId?: string,
    ) {
      const [lead] = await executor.update(leads).set({
        stage,
        previousStage,
        lostReason,
        ...(updatedByUserId ? { updatedByUserId } : {}),
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
      updatedByUserId?: string;
      now: Date;
    }) {
      const [lead] = await executor.update(leads).set({
        customerId: input.customerId,
        primaryContactId: input.primaryContactId,
        siteId: input.siteId,
        qualificationNotes: input.qualificationNotes,
        ...(input.updatedByUserId ? { updatedByUserId: input.updatedByUserId } : {}),
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

    async listActivities(companyId: string, leadId: string) {
      return executor.select({
        id: crmActivities.id,
        type: crmActivities.type,
        summary: crmActivities.summary,
        occurredAt: crmActivities.occurredAt,
        createdAt: crmActivities.createdAt,
        createdByUserId: crmActivities.createdByUserId,
        createdByName: users.name,
      }).from(crmActivities)
        .innerJoin(users, eq(users.id, crmActivities.createdByUserId))
        .where(and(eq(crmActivities.companyId, companyId), eq(crmActivities.leadId, leadId)))
        .orderBy(desc(crmActivities.occurredAt), desc(crmActivities.id))
        .limit(100);
    },

    async createActivity(input: typeof crmActivities.$inferInsert) {
      const [activity] = await executor.insert(crmActivities).values(input).returning();
      return activity;
    },

    async createReminderRule(input: typeof reminderRules.$inferInsert) {
      const [rule] = await executor.insert(reminderRules).values(input).returning();
      return rule;
    },

    async createReminderOccurrence(input: typeof reminderOccurrences.$inferInsert) {
      const [occurrence] = await executor.insert(reminderOccurrences).values(input).returning();
      return occurrence;
    },

    async enqueueReminderOccurrence(companyId: string, occurrenceId: string, dueAt: Date) {
      await executor.insert(outboxJobs).values({
        companyId,
        type: 'crm.reminder_due',
        payload: { occurrenceId },
        dedupKey: `reminder:${occurrenceId}`,
        dueAt,
      }).onConflictDoNothing();
    },

    async listLeadReminders(companyId: string, leadId: string) {
      return executor.select({
        id: reminderOccurrences.id,
        ruleId: reminderOccurrences.ruleId,
        title: reminderRules.title,
        assigneeUserId: reminderOccurrences.assigneeUserId,
        assigneeName: users.name,
        dueAt: reminderOccurrences.dueAt,
        timezone: reminderRules.timezone,
        recurrence: reminderRules.recurrence,
        status: reminderOccurrences.status,
        rowVersion: reminderOccurrences.rowVersion,
        completedAt: reminderOccurrences.completedAt,
      }).from(reminderOccurrences)
        .innerJoin(reminderRules, eq(reminderRules.id, reminderOccurrences.ruleId))
        .innerJoin(users, eq(users.id, reminderOccurrences.assigneeUserId))
        .where(and(eq(reminderOccurrences.companyId, companyId), eq(reminderOccurrences.leadId, leadId)))
        .orderBy(asc(reminderOccurrences.dueAt), asc(reminderOccurrences.id))
        .limit(100);
    },

    async listMyReminders(companyId: string, userId: string, input: {
      status?: 'pending' | 'completed' | 'cancelled'; search?: string; limit: number; offset: number;
      sort: 'dueAt' | 'title' | 'status'; direction: 'asc' | 'desc';
    }) {
      const where = and(
        eq(reminderOccurrences.companyId, companyId),
        eq(reminderOccurrences.assigneeUserId, userId),
        input.status ? eq(reminderOccurrences.status, input.status) : undefined,
        input.search ? or(
          ilike(reminderRules.title, `%${input.search}%`),
          ilike(leads.leadNumber, `%${input.search}%`),
          ilike(leads.inquiryName, `%${input.search}%`),
        ) : undefined,
      );
      const sortColumn = { dueAt: reminderOccurrences.dueAt, title: reminderRules.title, status: reminderOccurrences.status }[input.sort];
      const order = input.direction === 'asc' ? asc : desc;
      const selection = {
        id: reminderOccurrences.id,
        ruleId: reminderOccurrences.ruleId,
        leadId: reminderOccurrences.leadId,
        leadNumber: leads.leadNumber,
        leadName: leads.inquiryName,
        title: reminderRules.title,
        dueAt: reminderOccurrences.dueAt,
        timezone: reminderRules.timezone,
        recurrence: reminderRules.recurrence,
        status: reminderOccurrences.status,
        rowVersion: reminderOccurrences.rowVersion,
        completedAt: reminderOccurrences.completedAt,
      };
      const [items, totals] = await Promise.all([
        executor.select(selection).from(reminderOccurrences)
          .innerJoin(reminderRules, eq(reminderRules.id, reminderOccurrences.ruleId))
          .innerJoin(leads, eq(leads.id, reminderOccurrences.leadId))
          .where(where).orderBy(order(sortColumn), order(reminderOccurrences.id))
          .limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(reminderOccurrences)
          .innerJoin(reminderRules, eq(reminderRules.id, reminderOccurrences.ruleId))
          .innerJoin(leads, eq(leads.id, reminderOccurrences.leadId))
          .where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },

    async completeReminder(companyId: string, userId: string, occurrenceId: string, expectedVersion: number, now: Date) {
      const [occurrence] = await executor.update(reminderOccurrences).set({
        status: 'completed',
        completedAt: now,
        completedByUserId: userId,
        rowVersion: sql`${reminderOccurrences.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(reminderOccurrences.companyId, companyId),
        eq(reminderOccurrences.id, occurrenceId),
        eq(reminderOccurrences.assigneeUserId, userId),
        eq(reminderOccurrences.status, 'pending'),
        eq(reminderOccurrences.rowVersion, expectedVersion),
      )).returning();
      return occurrence;
    },

    async listAttachments(companyId: string, leadId: string) {
      return executor.select({
        id: leadAttachments.id,
        originalName: leadAttachments.originalName,
        mimeType: leadAttachments.mimeType,
        sizeBytes: leadAttachments.sizeBytes,
        checksumSha256: leadAttachments.checksumSha256,
        createdByUserId: leadAttachments.createdByUserId,
        createdByName: users.name,
        createdAt: leadAttachments.createdAt,
      }).from(leadAttachments)
        .innerJoin(users, eq(users.id, leadAttachments.createdByUserId))
        .where(and(eq(leadAttachments.companyId, companyId), eq(leadAttachments.leadId, leadId)))
        .orderBy(desc(leadAttachments.createdAt), desc(leadAttachments.id));
    },

    async createAttachment(input: typeof leadAttachments.$inferInsert) {
      const [attachment] = await executor.insert(leadAttachments).values(input).returning();
      return attachment;
    },

    async findAttachment(companyId: string, leadId: string, attachmentId: string) {
      const [attachment] = await executor.select().from(leadAttachments).where(and(
        eq(leadAttachments.companyId, companyId),
        eq(leadAttachments.leadId, leadId),
        eq(leadAttachments.id, attachmentId),
      )).limit(1);
      return attachment;
    },

    async createImportBatch(
      input: typeof crmImportBatches.$inferInsert,
      rows: Array<Omit<typeof crmImportRows.$inferInsert, 'batchId' | 'companyId'>>,
    ) {
      const [batch] = await executor.insert(crmImportBatches).values(input).returning();
      if (rows.length > 0) {
        await executor.insert(crmImportRows).values(rows.map((row) => ({
          ...row,
          companyId: input.companyId,
          batchId: batch!.id,
        })));
      }
      return batch;
    },

    async findImportBatch(companyId: string, batchId: string) {
      const [batch] = await executor.select().from(crmImportBatches).where(and(
        eq(crmImportBatches.companyId, companyId),
        eq(crmImportBatches.id, batchId),
      )).limit(1);
      return batch;
    },

    async listImportRows(companyId: string, batchId: string) {
      return executor.select().from(crmImportRows).where(and(
        eq(crmImportRows.companyId, companyId),
        eq(crmImportRows.batchId, batchId),
      )).orderBy(asc(crmImportRows.rowNumber));
    },

    async claimImportBatch(companyId: string, batchId: string, expectedVersion: number) {
      const [batch] = await executor.update(crmImportBatches).set({
        status: 'committing',
        rowVersion: sql`${crmImportBatches.rowVersion} + 1`,
      }).where(and(
        eq(crmImportBatches.companyId, companyId),
        eq(crmImportBatches.id, batchId),
        eq(crmImportBatches.rowVersion, expectedVersion),
        inArray(crmImportBatches.status, ['staged', 'committing']),
      )).returning();
      return batch;
    },

    async markImportRowCreated(companyId: string, rowId: string, recordId: string, now: Date) {
      const [row] = await executor.update(crmImportRows).set({
        status: 'created',
        createdRecordId: recordId,
        resultMessage: null,
        updatedAt: now,
      }).where(and(
        eq(crmImportRows.companyId, companyId),
        eq(crmImportRows.id, rowId),
        eq(crmImportRows.status, 'valid'),
      )).returning();
      return row;
    },

    async markImportRowFailed(companyId: string, rowId: string, message: string, now: Date) {
      await executor.update(crmImportRows).set({
        status: 'failed',
        resultMessage: message.slice(0, 500),
        updatedAt: now,
      }).where(and(
        eq(crmImportRows.companyId, companyId),
        eq(crmImportRows.id, rowId),
        eq(crmImportRows.status, 'valid'),
      ));
    },

    async completeImportBatch(companyId: string, batchId: string, expectedVersion: number, now: Date) {
      const [batch] = await executor.update(crmImportBatches).set({
        status: 'completed',
        committedAt: now,
        rowVersion: sql`${crmImportBatches.rowVersion} + 1`,
      }).where(and(
        eq(crmImportBatches.companyId, companyId),
        eq(crmImportBatches.id, batchId),
        eq(crmImportBatches.rowVersion, expectedVersion),
        eq(crmImportBatches.status, 'committing'),
      )).returning();
      return batch;
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

    async findOpportunity(companyId: string, opportunityId: string) {
      const [opportunity] = await executor.select().from(opportunities).where(and(
        eq(opportunities.companyId, companyId), eq(opportunities.id, opportunityId),
      )).limit(1);
      return opportunity;
    },

    async findOpportunityWithAccess(access: CrmAccess, opportunityId: string) {
      const [opportunity] = await executor.select().from(opportunities).where(and(
        eq(opportunities.companyId, access.companyId),
        eq(opportunities.id, opportunityId),
        opportunityAccessCondition(executor, access),
      )).limit(1);
      return opportunity;
    },

    async findDesignJobByOpportunity(companyId: string, opportunityId: string) {
      const [job] = await executor.select().from(designJobs).where(and(
        eq(designJobs.companyId, companyId), eq(designJobs.opportunityId, opportunityId),
      )).limit(1);
      return job;
    },

    async listOpportunityAttachments(companyId: string, opportunityId: string) {
      return executor.select({
        id: opportunityAttachments.id,
        opportunityId: opportunityAttachments.opportunityId,
        originalName: opportunityAttachments.originalName,
        mimeType: opportunityAttachments.mimeType,
        sizeBytes: opportunityAttachments.sizeBytes,
        checksumSha256: opportunityAttachments.checksumSha256,
        uploadedByUserId: opportunityAttachments.uploadedByUserId,
        uploadedByName: users.name,
        createdAt: opportunityAttachments.createdAt,
      }).from(opportunityAttachments)
        .innerJoin(users, eq(users.id, opportunityAttachments.uploadedByUserId))
        .where(and(
          eq(opportunityAttachments.companyId, companyId),
          eq(opportunityAttachments.opportunityId, opportunityId),
        ))
        .orderBy(desc(opportunityAttachments.createdAt), desc(opportunityAttachments.id));
    },

    async createOpportunityAttachments(values: Array<typeof opportunityAttachments.$inferInsert>) {
      if (values.length === 0) return [];
      return executor.insert(opportunityAttachments).values(values).returning();
    },

    async findOpportunityAttachment(companyId: string, opportunityId: string, attachmentId: string) {
      const [attachment] = await executor.select().from(opportunityAttachments).where(and(
        eq(opportunityAttachments.companyId, companyId),
        eq(opportunityAttachments.opportunityId, opportunityId),
        eq(opportunityAttachments.id, attachmentId),
      )).limit(1);
      return attachment;
    },

    async findDesignJobByLead(companyId: string, leadId: string) {
      const [job] = await executor.select().from(designJobs).where(and(
        eq(designJobs.companyId, companyId), eq(designJobs.leadId, leadId),
      )).limit(1);
      return job;
    },

    async updateOpportunityStateOnLeadChange(
      companyId: string,
      opportunityId: string,
      commercialState: typeof opportunities.$inferSelect.commercialState,
      previousCommercialState: typeof opportunities.$inferSelect.commercialState | null,
      now: Date,
    ) {
      const [updated] = await executor.update(opportunities).set({
        commercialState,
        previousCommercialState,
        rowVersion: sql`${opportunities.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(opportunities.companyId, companyId),
        eq(opportunities.id, opportunityId),
      )).returning();
      return updated;
    },

    async pauseDesignJob(companyId: string, jobId: string, previousStatus: string, now: Date, updatedByUserId?: string) {
      const [updated] = await executor.update(designJobs).set({
        status: 'paused',
        previousStatus,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
      )).returning();
      return updated;
    },

    async cancelDesignJob(companyId: string, jobId: string, closedReason: string, now: Date, updatedByUserId?: string) {
      const [updated] = await executor.update(designJobs).set({
        status: 'cancelled',
        previousStatus: null,
        closedReason,
        closedAt: now,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
      )).returning();
      return updated;
    },

    async resumeDesignJob(companyId: string, jobId: string, status: string, now: Date, updatedByUserId?: string) {
      const [updated] = await executor.update(designJobs).set({
        status,
        previousStatus: null,
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${designJobs.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(designJobs.companyId, companyId),
        eq(designJobs.id, jobId),
        eq(designJobs.status, 'paused'),
      )).returning();
      return updated;
    },

    async cancelPendingDesignDeadlines(companyId: string, jobId: string, now: Date) {
      await executor.update(outboxJobs).set({
        status: 'cancelled',
        updatedAt: now,
      }).where(and(
        eq(outboxJobs.companyId, companyId),
        eq(outboxJobs.type, 'engineering.design_deadline'),
        eq(outboxJobs.status, 'pending'),
        sql`${outboxJobs.payload}->>'jobId' = ${jobId}`,
      ));
    },

    async enqueueResumedDesignDeadline(companyId: string, jobId: string, dueAt: Date, now: Date) {
      const epoch = Math.floor(now.getTime() / 1_000);
      await executor.insert(outboxJobs).values({
        companyId,
        type: 'engineering.design_deadline',
        payload: { jobId, dueAt: dueAt.toISOString() },
        dedupKey: `design-deadline:${jobId}:resume:${epoch}`,
        dueAt,
      }).onConflictDoNothing();
    },

    async authorizeLeadForDesign(companyId: string, leadId: string, expectedVersion: number, now: Date, updatedByUserId?: string) {
      const [lead] = await executor.update(leads).set({
        stage: 'design_authorized',
        ...(updatedByUserId ? { updatedByUserId } : {}),
        rowVersion: sql`${leads.rowVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(leads.companyId, companyId),
        eq(leads.id, leadId),
        eq(leads.rowVersion, expectedVersion),
        eq(leads.stage, 'qualified'),
      )).returning();
      return lead;
    },

    async createDesignJob(input: typeof designJobs.$inferInsert) {
      const [job] = await executor.insert(designJobs).values(input).returning();
      return job;
    },

    async listOpportunities(access: CrmAccess, input: {
      state?: typeof opportunities.$inferSelect.commercialState; search?: string; limit: number; offset: number;
      sort: 'title' | 'customerName' | 'state' | 'updatedAt'; direction: 'asc' | 'desc';
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
        leadStage: leads.stage,
        title: opportunities.title,
        customerId: opportunities.customerId,
        customerName: customers.displayName,
        siteId: opportunities.siteId,
        siteName: sites.name,
        ownerName: sql<string>`owner_user.name`,
        designJobId: designJobs.id,
        designStatus: designJobs.status,
        attachmentCount: sql<number>`(select count(*)::int from ${opportunityAttachments} oa where oa.company_id = ${opportunities.companyId} and oa.opportunity_id = ${opportunities.id})`,
        commercialState: opportunities.commercialState,
        rowVersion: opportunities.rowVersion,
        createdAt: opportunities.createdAt,
        updatedAt: opportunities.updatedAt,
      };
      const sortColumn = {
        title: opportunities.title,
        customerName: customers.displayName,
        state: opportunities.commercialState,
        updatedAt: opportunities.updatedAt,
      }[input.sort];
      const order = input.direction === 'asc' ? asc : desc;
      const [items, totals] = await Promise.all([
        executor.select(selection).from(opportunities)
          .innerJoin(leads, eq(leads.id, opportunities.leadId))
          .innerJoin(customers, eq(customers.id, opportunities.customerId))
          .innerJoin(sql`${users} owner_user`, sql`owner_user.id = ${leads.ownerUserId}`)
          .leftJoin(sites, eq(sites.id, opportunities.siteId))
          .leftJoin(designJobs, and(eq(designJobs.companyId, opportunities.companyId), eq(designJobs.opportunityId, opportunities.id)))
          .where(where).orderBy(order(sortColumn), order(opportunities.id))
          .limit(input.limit).offset(input.offset),
        executor.select({ count: count() }).from(opportunities)
          .innerJoin(leads, eq(leads.id, opportunities.leadId))
          .innerJoin(customers, eq(customers.id, opportunities.customerId))
          .where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0 };
    },

    async findOpportunityDetail(access: CrmAccess, opportunityId: string) {
      const [item] = await executor.select({
        id: opportunities.id,
        leadId: opportunities.leadId,
        leadNumber: leads.leadNumber,
        leadStage: leads.stage,
        qualificationNotes: leads.qualificationNotes,
        title: opportunities.title,
        customerId: opportunities.customerId,
        customerName: customers.displayName,
        primaryContactId: opportunities.primaryContactId,
        contactName: customerContacts.name,
        contactPhone: customerContacts.phone,
        contactEmail: customerContacts.email,
        siteId: opportunities.siteId,
        siteName: sites.name,
        siteCity: sites.city,
        ownerName: sql<string>`owner_user.name`,
        designJobId: designJobs.id,
        designStatus: designJobs.status,
        commercialState: opportunities.commercialState,
        rowVersion: opportunities.rowVersion,
        createdAt: opportunities.createdAt,
        updatedAt: opportunities.updatedAt,
      }).from(opportunities)
        .innerJoin(leads, eq(leads.id, opportunities.leadId))
        .innerJoin(customers, eq(customers.id, opportunities.customerId))
        .innerJoin(customerContacts, eq(customerContacts.id, opportunities.primaryContactId))
        .innerJoin(sql`${users} owner_user`, sql`owner_user.id = ${leads.ownerUserId}`)
        .leftJoin(sites, eq(sites.id, opportunities.siteId))
        .leftJoin(designJobs, and(eq(designJobs.companyId, opportunities.companyId), eq(designJobs.opportunityId, opportunities.id)))
        .where(and(
          eq(opportunities.companyId, access.companyId),
          eq(opportunities.id, opportunityId),
          opportunityAccessCondition(executor, access),
        )).limit(1);
      return item;
    },
  };
}
