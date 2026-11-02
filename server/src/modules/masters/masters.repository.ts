import { and, asc, count, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import { brands, itemBrandOfferings, itemBrands, itemCategories, itemFamilies, itemFamilySpecifications, itemRateVersions, items, units, vendorContacts, vendors } from '../../infrastructure/database/schema/index.js';
import type { MasterListQuery } from './masters.schemas.js';

function direction(input: MasterListQuery) {
  return input.direction === 'desc' ? desc : asc;
}

function pageOffset(input: MasterListQuery) {
  return (input.page - 1) * input.pageSize;
}

export function createMastersRepository(executor: DatabaseExecutor) {
  return {
    async listUnits(companyId: string, input: MasterListQuery) {
      const where = and(
        eq(units.companyId, companyId),
        input.status ? eq(units.status, input.status) : undefined,
        input.search ? or(ilike(units.code, `%${input.search}%`), ilike(units.name, `%${input.search}%`), ilike(units.symbol, `%${input.search}%`)) : undefined,
      );
      const sortColumn = input.sort === 'code' ? units.code : input.sort === 'status' ? units.status : input.sort === 'updatedAt' ? units.updatedAt : units.name;
      const [rows, total] = await Promise.all([
        executor.select().from(units).where(where).orderBy(direction(input)(sortColumn), asc(units.id)).limit(input.pageSize).offset(pageOffset(input)),
        executor.select({ count: count() }).from(units).where(where),
      ]);
      return { items: rows, total: total[0]?.count ?? 0 };
    },

    async listItemCategories(companyId: string, input: MasterListQuery) {
      const where = and(
        eq(itemCategories.companyId, companyId),
        input.status ? eq(itemCategories.status, input.status) : undefined,
        input.search ? or(ilike(itemCategories.code, `%${input.search}%`), ilike(itemCategories.name, `%${input.search}%`)) : undefined,
      );
      const sortColumn = input.sort === 'code' ? itemCategories.code : input.sort === 'status' ? itemCategories.status : input.sort === 'updatedAt' ? itemCategories.updatedAt : itemCategories.name;
      const [rows, total] = await Promise.all([
        executor.select().from(itemCategories).where(where).orderBy(direction(input)(sortColumn), asc(itemCategories.id)).limit(input.pageSize).offset(pageOffset(input)),
        executor.select({ count: count() }).from(itemCategories).where(where),
      ]);
      return { items: rows, total: total[0]?.count ?? 0 };
    },

    async listBrands(companyId: string, input: MasterListQuery) {
      const where = and(
        eq(brands.companyId, companyId),
        input.status ? eq(brands.status, input.status) : undefined,
        input.search ? or(ilike(brands.code, `%${input.search}%`), ilike(brands.name, `%${input.search}%`)) : undefined,
      );
      const sortColumn = input.sort === 'code' ? brands.code : input.sort === 'status' ? brands.status : input.sort === 'updatedAt' ? brands.updatedAt : brands.name;
      const [rows, total] = await Promise.all([
        executor.select().from(brands).where(where).orderBy(direction(input)(sortColumn), asc(brands.id)).limit(input.pageSize).offset(pageOffset(input)),
        executor.select({ count: count() }).from(brands).where(where),
      ]);
      return { items: rows, total: total[0]?.count ?? 0 };
    },

    async listItemFamilies(companyId: string, input: MasterListQuery) {
      const where = and(
        eq(itemFamilies.companyId, companyId),
        input.status ? eq(itemFamilies.status, input.status) : undefined,
        input.search ? or(ilike(itemFamilies.code, `%${input.search}%`), ilike(itemFamilies.name, `%${input.search}%`), ilike(itemFamilies.scopeDescription, `%${input.search}%`)) : undefined,
      );
      const sortColumn = input.sort === 'code' ? itemFamilies.code : input.sort === 'status' ? itemFamilies.status : input.sort === 'updatedAt' ? itemFamilies.updatedAt : itemFamilies.name;
      const [rows, total] = await Promise.all([
        executor.select({
          id: itemFamilies.id, code: itemFamilies.code, name: itemFamilies.name,
          scopeDescription: itemFamilies.scopeDescription, categoryId: itemFamilies.categoryId,
          categoryName: itemCategories.name, defaultUnitId: itemFamilies.defaultUnitId,
          defaultUnitName: units.name, defaultUnitSymbol: units.symbol, status: itemFamilies.status,
          rowVersion: itemFamilies.rowVersion, updatedAt: itemFamilies.updatedAt,
        }).from(itemFamilies).innerJoin(itemCategories, eq(itemCategories.id, itemFamilies.categoryId))
          .leftJoin(units, eq(units.id, itemFamilies.defaultUnitId)).where(where)
          .orderBy(direction(input)(sortColumn), asc(itemFamilies.id)).limit(input.pageSize).offset(pageOffset(input)),
        executor.select({ count: count() }).from(itemFamilies).where(where),
      ]);
      const definitions = rows.length === 0 ? [] : await executor.select().from(itemFamilySpecifications).where(and(
        eq(itemFamilySpecifications.companyId, companyId), inArray(itemFamilySpecifications.familyId, rows.map((row) => row.id)),
      )).orderBy(asc(itemFamilySpecifications.sortOrder));
      return { items: rows.map((row) => ({ ...row, specifications: definitions.filter((item) => item.familyId === row.id) })), total: total[0]?.count ?? 0 };
    },

    async listItems(companyId: string, input: MasterListQuery) {
      const where = and(
        eq(items.companyId, companyId),
        input.status ? eq(items.status, input.status) : undefined,
        input.search ? or(ilike(items.code, `%${input.search}%`), ilike(items.name, `%${input.search}%`), ilike(items.specification, `%${input.search}%`)) : undefined,
      );
      const sortColumn = input.sort === 'code' ? items.code : input.sort === 'status' ? items.status : input.sort === 'updatedAt' ? items.updatedAt : items.name;
      const [rows, total] = await Promise.all([
        executor.select({
          id: items.id,
          code: items.code,
          name: items.name,
          specification: items.specification,
          familyId: items.familyId,
          familyName: itemFamilies.name,
          costingBrandId: items.costingBrandId,
          costingBrandName: brands.name,
          model: items.model,
          specificationValues: items.specificationValues,
          categoryId: items.categoryId,
          categoryName: itemCategories.name,
          unitId: items.unitId,
          unitName: units.name,
          unitSymbol: units.symbol,
          status: items.status,
          rowVersion: items.rowVersion,
          updatedAt: items.updatedAt,
        }).from(items)
          .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
          .innerJoin(units, eq(units.id, items.unitId))
          .leftJoin(itemFamilies, eq(itemFamilies.id, items.familyId))
          .leftJoin(brands, eq(brands.id, items.costingBrandId))
          .where(where).orderBy(direction(input)(sortColumn), asc(items.id)).limit(input.pageSize).offset(pageOffset(input)),
        executor.select({ count: count() }).from(items).where(where),
      ]);
      const assignments = rows.length === 0 ? [] : await executor.select({
        itemId: itemBrands.itemId,
        id: brands.id,
        code: brands.code,
        name: brands.name,
        status: brands.status,
      }).from(itemBrands).innerJoin(brands, eq(brands.id, itemBrands.brandId)).where(and(
        eq(itemBrands.companyId, companyId), inArray(itemBrands.itemId, rows.map((row) => row.id)),
      )).orderBy(asc(brands.name));
      return {
        items: rows.map((row) => ({ ...row, brands: assignments.filter((brand) => brand.itemId === row.id).map(({ itemId: _itemId, ...brand }) => brand) })),
        total: total[0]?.count ?? 0,
      };
    },

    async listVendors(companyId: string, input: MasterListQuery) {
      const where = and(
        eq(vendors.companyId, companyId),
        input.status ? eq(vendors.status, input.status) : undefined,
        input.search ? or(ilike(vendors.code, `%${input.search}%`), ilike(vendors.displayName, `%${input.search}%`), ilike(vendors.legalName, `%${input.search}%`), ilike(vendorContacts.name, `%${input.search}%`)) : undefined,
      );
      const sortColumn = input.sort === 'code' ? vendors.code : input.sort === 'status' ? vendors.status : input.sort === 'updatedAt' ? vendors.updatedAt : vendors.displayName;
      const contactJoin = and(eq(vendorContacts.vendorId, vendors.id), eq(vendorContacts.isPrimary, true), eq(vendorContacts.status, 'active'));
      const [rows, total] = await Promise.all([
        executor.select({
          id: vendors.id,
          code: vendors.code,
          displayName: vendors.displayName,
          legalName: vendors.legalName,
          taxIdentifier: vendors.taxIdentifier,
          addressLine1: vendors.addressLine1,
          addressLine2: vendors.addressLine2,
          city: vendors.city,
          state: vendors.state,
          postalCode: vendors.postalCode,
          country: vendors.country,
          status: vendors.status,
          rowVersion: vendors.rowVersion,
          updatedAt: vendors.updatedAt,
          primaryContact: {
            id: vendorContacts.id,
            name: vendorContacts.name,
            jobTitle: vendorContacts.jobTitle,
            phone: vendorContacts.phone,
            email: vendorContacts.email,
          },
        }).from(vendors).leftJoin(vendorContacts, contactJoin).where(where)
          .orderBy(direction(input)(sortColumn), asc(vendors.id)).limit(input.pageSize).offset(pageOffset(input)),
        executor.select({ count: count() }).from(vendors).leftJoin(vendorContacts, contactJoin).where(where),
      ]);
      return { items: rows, total: total[0]?.count ?? 0 };
    },

    async findUnit(companyId: string, id: string) {
      const [row] = await executor.select().from(units).where(and(eq(units.companyId, companyId), eq(units.id, id))).limit(1);
      return row;
    },
    async findItemCategory(companyId: string, id: string) {
      const [row] = await executor.select().from(itemCategories).where(and(eq(itemCategories.companyId, companyId), eq(itemCategories.id, id))).limit(1);
      return row;
    },
    async findItemFamily(companyId: string, id: string) {
      const [row] = await executor.select().from(itemFamilies).where(and(eq(itemFamilies.companyId, companyId), eq(itemFamilies.id, id))).limit(1);
      return row;
    },
    listItemFamilySpecifications(companyId: string, familyId: string) {
      return executor.select().from(itemFamilySpecifications).where(and(
        eq(itemFamilySpecifications.companyId, companyId), eq(itemFamilySpecifications.familyId, familyId),
      )).orderBy(asc(itemFamilySpecifications.sortOrder));
    },
    async findItem(companyId: string, id: string) {
      const [row] = await executor.select().from(items).where(and(eq(items.companyId, companyId), eq(items.id, id))).limit(1);
      return row;
    },
    listItemOfferings(companyId: string, itemId: string) {
      return executor.select({
        id: itemBrandOfferings.id, itemId: itemBrandOfferings.itemId, brandId: itemBrandOfferings.brandId,
        brandCode: brands.code, brandName: brands.name, manufacturerModel: itemBrandOfferings.manufacturerModel,
        manufacturerSku: itemBrandOfferings.manufacturerSku, isPreferred: itemBrandOfferings.isPreferred,
        status: itemBrandOfferings.status, rowVersion: itemBrandOfferings.rowVersion, updatedAt: itemBrandOfferings.updatedAt,
      }).from(itemBrandOfferings).leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId)).where(and(
        eq(itemBrandOfferings.companyId, companyId), eq(itemBrandOfferings.itemId, itemId),
      )).orderBy(desc(itemBrandOfferings.isPreferred), asc(brands.name), asc(itemBrandOfferings.manufacturerModel));
    },
    async findItemOffering(companyId: string, itemId: string, offeringId: string) {
      const [row] = await executor.select().from(itemBrandOfferings).where(and(
        eq(itemBrandOfferings.companyId, companyId), eq(itemBrandOfferings.itemId, itemId), eq(itemBrandOfferings.id, offeringId),
      )).limit(1);
      return row;
    },
    async findBrands(companyId: string, ids: string[]) {
      if (ids.length === 0) return [];
      return executor.select().from(brands).where(and(eq(brands.companyId, companyId), inArray(brands.id, ids)));
    },
    async hasActiveItemsForUnit(companyId: string, unitId: string) {
      const [result] = await executor.select({ count: count() }).from(items).where(and(eq(items.companyId, companyId), eq(items.unitId, unitId), eq(items.status, 'active')));
      return (result?.count ?? 0) > 0;
    },
    async hasActiveItemsForCategory(companyId: string, categoryId: string) {
      const [result] = await executor.select({ count: count() }).from(items).where(and(eq(items.companyId, companyId), eq(items.categoryId, categoryId), eq(items.status, 'active')));
      return (result?.count ?? 0) > 0;
    },

    async createUnit(input: typeof units.$inferInsert) {
      const [row] = await executor.insert(units).values(input).returning();
      return row;
    },
    async updateUnit(companyId: string, id: string, expectedVersion: number, values: Pick<typeof units.$inferInsert, 'code' | 'name' | 'nameNormalized' | 'symbol' | 'allowFractional'>, now: Date) {
      const [row] = await executor.update(units).set({ ...values, rowVersion: sql`${units.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(units.companyId, companyId), eq(units.id, id), eq(units.rowVersion, expectedVersion))).returning();
      return row;
    },
    async deactivateUnit(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(units).set({ status: 'inactive', rowVersion: sql`${units.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(units.companyId, companyId), eq(units.id, id), eq(units.rowVersion, expectedVersion), eq(units.status, 'active'))).returning();
      return row;
    },

    async createItemCategory(input: typeof itemCategories.$inferInsert) {
      const [row] = await executor.insert(itemCategories).values(input).returning();
      return row;
    },

    async createBrand(input: typeof brands.$inferInsert) {
      const [row] = await executor.insert(brands).values(input).returning();
      return row;
    },

    async createItemFamily(input: typeof itemFamilies.$inferInsert) {
      const [row] = await executor.insert(itemFamilies).values(input).returning();
      return row;
    },
    async updateItemFamily(companyId: string, id: string, expectedVersion: number, values: Pick<typeof itemFamilies.$inferInsert, 'code' | 'name' | 'nameNormalized' | 'scopeDescription' | 'categoryId' | 'defaultUnitId'>, now: Date) {
      const [row] = await executor.update(itemFamilies).set({ ...values, rowVersion: sql`${itemFamilies.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(itemFamilies.companyId, companyId), eq(itemFamilies.id, id), eq(itemFamilies.rowVersion, expectedVersion))).returning();
      return row;
    },
    async replaceItemFamilySpecifications(companyId: string, familyId: string, values: Array<{ key: string; label: string; valueType: 'text' | 'number' | 'boolean'; unitLabel?: string; isRequired: boolean }>) {
      await executor.delete(itemFamilySpecifications).where(and(eq(itemFamilySpecifications.companyId, companyId), eq(itemFamilySpecifications.familyId, familyId)));
      if (values.length > 0) await executor.insert(itemFamilySpecifications).values(values.map((value, index) => ({ ...value, companyId, familyId, sortOrder: index + 1 })));
    },
    async deactivateItemFamily(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(itemFamilies).set({ status: 'inactive', rowVersion: sql`${itemFamilies.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(itemFamilies.companyId, companyId), eq(itemFamilies.id, id), eq(itemFamilies.rowVersion, expectedVersion), eq(itemFamilies.status, 'active'))).returning();
      return row;
    },
    async updateBrand(companyId: string, id: string, expectedVersion: number, values: Pick<typeof brands.$inferInsert, 'code' | 'name' | 'nameNormalized'>, now: Date) {
      const [row] = await executor.update(brands).set({ ...values, rowVersion: sql`${brands.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(brands.companyId, companyId), eq(brands.id, id), eq(brands.rowVersion, expectedVersion))).returning();
      return row;
    },
    async deactivateBrand(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(brands).set({ status: 'inactive', rowVersion: sql`${brands.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(brands.companyId, companyId), eq(brands.id, id), eq(brands.rowVersion, expectedVersion), eq(brands.status, 'active'))).returning();
      return row;
    },
    async updateItemCategory(companyId: string, id: string, expectedVersion: number, values: Pick<typeof itemCategories.$inferInsert, 'code' | 'name' | 'nameNormalized'>, now: Date) {
      const [row] = await executor.update(itemCategories).set({ ...values, rowVersion: sql`${itemCategories.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(itemCategories.companyId, companyId), eq(itemCategories.id, id), eq(itemCategories.rowVersion, expectedVersion))).returning();
      return row;
    },
    async deactivateItemCategory(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(itemCategories).set({ status: 'inactive', rowVersion: sql`${itemCategories.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(itemCategories.companyId, companyId), eq(itemCategories.id, id), eq(itemCategories.rowVersion, expectedVersion), eq(itemCategories.status, 'active'))).returning();
      return row;
    },

    async createItem(input: typeof items.$inferInsert) {
      const [row] = await executor.insert(items).values(input).returning();
      return row;
    },
    async clearPreferredOffering(companyId: string, itemId: string) {
      await executor.update(itemBrandOfferings).set({ isPreferred: false, rowVersion: sql`${itemBrandOfferings.rowVersion} + 1`, updatedAt: new Date() })
        .where(and(eq(itemBrandOfferings.companyId, companyId), eq(itemBrandOfferings.itemId, itemId), eq(itemBrandOfferings.isPreferred, true)));
    },
    async createItemOffering(input: typeof itemBrandOfferings.$inferInsert) {
      const [row] = await executor.insert(itemBrandOfferings).values(input).returning();
      return row;
    },
    async updateItemOffering(companyId: string, itemId: string, offeringId: string, expectedVersion: number, values: Pick<typeof itemBrandOfferings.$inferInsert, 'brandId' | 'manufacturerModel' | 'manufacturerSku' | 'isPreferred'>) {
      const [row] = await executor.update(itemBrandOfferings).set({ ...values, rowVersion: sql`${itemBrandOfferings.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(itemBrandOfferings.companyId, companyId), eq(itemBrandOfferings.itemId, itemId), eq(itemBrandOfferings.id, offeringId), eq(itemBrandOfferings.rowVersion, expectedVersion),
      )).returning();
      return row;
    },
    async deactivateItemOffering(companyId: string, itemId: string, offeringId: string, expectedVersion: number) {
      const [row] = await executor.update(itemBrandOfferings).set({ status: 'inactive', isPreferred: false, rowVersion: sql`${itemBrandOfferings.rowVersion} + 1`, updatedAt: new Date() }).where(and(
        eq(itemBrandOfferings.companyId, companyId), eq(itemBrandOfferings.itemId, itemId), eq(itemBrandOfferings.id, offeringId), eq(itemBrandOfferings.rowVersion, expectedVersion), eq(itemBrandOfferings.status, 'active'),
      )).returning();
      return row;
    },
    async updateItem(companyId: string, id: string, expectedVersion: number, values: Pick<typeof items.$inferInsert, 'code' | 'name' | 'nameNormalized' | 'specification' | 'familyId' | 'costingBrandId' | 'model' | 'specificationValues' | 'categoryId' | 'unitId'>, now: Date) {
      const [row] = await executor.update(items).set({ ...values, rowVersion: sql`${items.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(items.companyId, companyId), eq(items.id, id), eq(items.rowVersion, expectedVersion))).returning();
      return row;
    },
    async replaceItemBrands(companyId: string, itemId: string, brandIds: string[], createdByUserId: string) {
      await executor.delete(itemBrands).where(and(eq(itemBrands.companyId, companyId), eq(itemBrands.itemId, itemId)));
      if (brandIds.length > 0) await executor.insert(itemBrands).values(brandIds.map((brandId) => ({ companyId, itemId, brandId, createdByUserId })));
    },
    async addItemBrand(companyId: string, itemId: string, brandId: string, createdByUserId: string) {
      await executor.insert(itemBrands).values({ companyId, itemId, brandId, createdByUserId }).onConflictDoNothing();
    },
    async deactivateItem(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(items).set({ status: 'inactive', rowVersion: sql`${items.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(items.companyId, companyId), eq(items.id, id), eq(items.rowVersion, expectedVersion), eq(items.status, 'active'))).returning();
      return row;
    },

    listItemRates(companyId: string, itemId: string, offeringId?: string) {
      return executor.select().from(itemRateVersions).where(and(eq(itemRateVersions.companyId, companyId), eq(itemRateVersions.itemId, itemId), offeringId ? eq(itemRateVersions.offeringId, offeringId) : undefined))
        .orderBy(desc(itemRateVersions.effectiveFrom), desc(itemRateVersions.createdAt));
    },
    async findEffectiveOfferingRate(companyId: string, itemId: string, offeringId: string, currency: string, costingDate: string) {
      const [row] = await executor.select().from(itemRateVersions).where(and(
        eq(itemRateVersions.companyId, companyId), eq(itemRateVersions.itemId, itemId),
        eq(itemRateVersions.offeringId, offeringId),
        eq(itemRateVersions.currency, currency), lte(itemRateVersions.effectiveFrom, costingDate),
      )).orderBy(desc(itemRateVersions.effectiveFrom), desc(itemRateVersions.createdAt)).limit(1);
      return row;
    },
    async listEffectiveOfferingRates(companyId: string, itemId: string, currency: string, costingDate: string) {
      const offerings = await executor.select({ offering: itemBrandOfferings, brandCode: brands.code, brandName: brands.name })
        .from(itemBrandOfferings).leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId)).where(and(
          eq(itemBrandOfferings.companyId, companyId), eq(itemBrandOfferings.itemId, itemId), eq(itemBrandOfferings.status, 'active'),
        )).orderBy(desc(itemBrandOfferings.isPreferred), asc(brands.name), asc(itemBrandOfferings.manufacturerModel));
      return Promise.all(offerings.map(async (entry) => ({
        ...entry,
        rate: await (async () => {
          const [rate] = await executor.select().from(itemRateVersions).where(and(
            eq(itemRateVersions.companyId, companyId), eq(itemRateVersions.itemId, itemId),
            eq(itemRateVersions.offeringId, entry.offering.id), eq(itemRateVersions.currency, currency),
            lte(itemRateVersions.effectiveFrom, costingDate),
          )).orderBy(desc(itemRateVersions.effectiveFrom), desc(itemRateVersions.createdAt)).limit(1);
          return rate;
        })(),
      })));
    },
    async createItemRate(input: typeof itemRateVersions.$inferInsert) {
      const [row] = await executor.insert(itemRateVersions).values(input).returning();
      return row;
    },

    async createVendor(input: typeof vendors.$inferInsert) {
      const [row] = await executor.insert(vendors).values(input).returning();
      return row;
    },
    async createVendorContact(input: typeof vendorContacts.$inferInsert) {
      const [row] = await executor.insert(vendorContacts).values(input).returning();
      return row;
    },
    async updateVendor(companyId: string, id: string, expectedVersion: number, values: Omit<Partial<typeof vendors.$inferInsert>, 'id' | 'companyId' | 'createdByUserId'>, now: Date) {
      const [row] = await executor.update(vendors).set({ ...values, rowVersion: sql`${vendors.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(vendors.companyId, companyId), eq(vendors.id, id), eq(vendors.rowVersion, expectedVersion))).returning();
      return row;
    },
    async updatePrimaryVendorContact(companyId: string, vendorId: string, values: Omit<Partial<typeof vendorContacts.$inferInsert>, 'id' | 'companyId' | 'vendorId' | 'createdByUserId'>, now: Date) {
      const [row] = await executor.update(vendorContacts).set({ ...values, rowVersion: sql`${vendorContacts.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(vendorContacts.companyId, companyId), eq(vendorContacts.vendorId, vendorId), eq(vendorContacts.isPrimary, true), eq(vendorContacts.status, 'active'))).returning();
      return row;
    },
    async deactivateVendor(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(vendors).set({ status: 'inactive', rowVersion: sql`${vendors.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(vendors.companyId, companyId), eq(vendors.id, id), eq(vendors.rowVersion, expectedVersion), eq(vendors.status, 'active'))).returning();
      return row;
    },
  };
}
