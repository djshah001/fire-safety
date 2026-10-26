import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../infrastructure/database/db.js';
import { brands, itemBrands, itemCategories, items, units, vendorContacts, vendors } from '../../infrastructure/database/schema/index.js';
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
    async updateUnit(companyId: string, id: string, expectedVersion: number, values: Pick<typeof units.$inferInsert, 'code' | 'name' | 'nameNormalized' | 'symbol'>, now: Date) {
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
    async updateItem(companyId: string, id: string, expectedVersion: number, values: Pick<typeof items.$inferInsert, 'code' | 'name' | 'nameNormalized' | 'specification' | 'categoryId' | 'unitId'>, now: Date) {
      const [row] = await executor.update(items).set({ ...values, rowVersion: sql`${items.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(items.companyId, companyId), eq(items.id, id), eq(items.rowVersion, expectedVersion))).returning();
      return row;
    },
    async replaceItemBrands(companyId: string, itemId: string, brandIds: string[], createdByUserId: string) {
      await executor.delete(itemBrands).where(and(eq(itemBrands.companyId, companyId), eq(itemBrands.itemId, itemId)));
      await executor.insert(itemBrands).values(brandIds.map((brandId) => ({ companyId, itemId, brandId, createdByUserId })));
    },
    async deactivateItem(companyId: string, id: string, expectedVersion: number, now: Date) {
      const [row] = await executor.update(items).set({ status: 'inactive', rowVersion: sql`${items.rowVersion} + 1`, updatedAt: now })
        .where(and(eq(items.companyId, companyId), eq(items.id, id), eq(items.rowVersion, expectedVersion), eq(items.status, 'active'))).returning();
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
