import { AppError, ConflictError, NotFoundError } from '../../core/errors/appError.js';
import { normalizeEmail, normalizeName, normalizePhone } from '../../core/text/normalize.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createMastersRepository } from './masters.repository.js';
import type {
  ItemCategoryCreateInput,
  ItemCategoryUpdateInput,
  ItemCreateInput,
  ItemUpdateInput,
  MasterListQuery,
  UnitCreateInput,
  UnitUpdateInput,
  VendorCreateInput,
  VendorUpdateInput,
} from './masters.schemas.js';

function contactValues(input: VendorCreateInput['primaryContact']) {
  const phoneNormalized = normalizePhone(input.phone);
  const emailNormalized = normalizeEmail(input.email);
  if (!phoneNormalized && !emailNormalized) {
    throw new AppError('VALIDATION_ERROR', 'Provide a valid primary-contact phone number or email address.', 422);
  }
  return {
    name: input.name,
    jobTitle: input.jobTitle,
    phone: input.phone,
    phoneNormalized,
    email: input.email,
    emailNormalized,
    isPrimary: true,
  };
}

function page<T>(result: { items: T[]; total: number }, input: MasterListQuery) {
  return { ...result, page: input.page, pageSize: input.pageSize };
}

export class MastersService {
  constructor(private readonly database: Database = db) {}

  async listUnits(principal: AuthenticatedPrincipal, input: MasterListQuery) {
    return page(await createMastersRepository(this.database).listUnits(principal.companyId, input), input);
  }
  async listItemCategories(principal: AuthenticatedPrincipal, input: MasterListQuery) {
    return page(await createMastersRepository(this.database).listItemCategories(principal.companyId, input), input);
  }
  async listItems(principal: AuthenticatedPrincipal, input: MasterListQuery) {
    return page(await createMastersRepository(this.database).listItems(principal.companyId, input), input);
  }
  async listVendors(principal: AuthenticatedPrincipal, input: MasterListQuery) {
    return page(await createMastersRepository(this.database).listVendors(principal.companyId, input), input);
  }

  async createUnit(principal: AuthenticatedPrincipal, input: UnitCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const unit = await createMastersRepository(transaction).createUnit({
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        symbol: input.symbol,
        createdByUserId: principal.userId,
      });
      await this.audit(transaction, principal, requestId, 'master.unit_created', 'unit', unit!.id);
      return unit!;
    });
  }

  async updateUnit(principal: AuthenticatedPrincipal, id: string, input: UnitUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const unit = await createMastersRepository(transaction).updateUnit(principal.companyId, id, input.expectedVersion, {
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        symbol: input.symbol,
      }, new Date());
      if (!unit) throw new ConflictError('The unit changed before this update. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.unit_updated', 'unit', id);
      return unit;
    });
  }

  async deactivateUnit(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      if (await repository.hasActiveItemsForUnit(principal.companyId, id)) {
        throw new ConflictError('Deactivate or reassign active items that use this unit first.');
      }
      const unit = await repository.deactivateUnit(principal.companyId, id, expectedVersion, new Date());
      if (!unit) throw new ConflictError('The unit changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.unit_deactivated', 'unit', id, { reason });
      return unit;
    });
  }

  async createItemCategory(principal: AuthenticatedPrincipal, input: ItemCategoryCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const category = await createMastersRepository(transaction).createItemCategory({
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        createdByUserId: principal.userId,
      });
      await this.audit(transaction, principal, requestId, 'master.item_category_created', 'item_category', category!.id);
      return category!;
    });
  }

  async updateItemCategory(principal: AuthenticatedPrincipal, id: string, input: ItemCategoryUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const category = await createMastersRepository(transaction).updateItemCategory(principal.companyId, id, input.expectedVersion, {
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
      }, new Date());
      if (!category) throw new ConflictError('The category changed before this update. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.item_category_updated', 'item_category', id);
      return category;
    });
  }

  async deactivateItemCategory(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      if (await repository.hasActiveItemsForCategory(principal.companyId, id)) {
        throw new ConflictError('Deactivate or reassign active items in this category first.');
      }
      const category = await repository.deactivateItemCategory(principal.companyId, id, expectedVersion, new Date());
      if (!category) throw new ConflictError('The category changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.item_category_deactivated', 'item_category', id, { reason });
      return category;
    });
  }

  private async assertActiveItemReferences(repository: ReturnType<typeof createMastersRepository>, companyId: string, categoryId: string, unitId: string) {
    const [category, unit] = await Promise.all([
      repository.findItemCategory(companyId, categoryId),
      repository.findUnit(companyId, unitId),
    ]);
    if (!category || category.status !== 'active') throw new NotFoundError('Active item category not found.');
    if (!unit || unit.status !== 'active') throw new NotFoundError('Active unit not found.');
  }

  async createItem(principal: AuthenticatedPrincipal, input: ItemCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      await this.assertActiveItemReferences(repository, principal.companyId, input.categoryId, input.unitId);
      const item = await repository.createItem({
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        specification: input.specification,
        categoryId: input.categoryId,
        unitId: input.unitId,
        createdByUserId: principal.userId,
      });
      await this.audit(transaction, principal, requestId, 'master.item_created', 'item', item!.id);
      return item!;
    });
  }

  async updateItem(principal: AuthenticatedPrincipal, id: string, input: ItemUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      await this.assertActiveItemReferences(repository, principal.companyId, input.categoryId, input.unitId);
      const item = await repository.updateItem(principal.companyId, id, input.expectedVersion, {
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        specification: input.specification,
        categoryId: input.categoryId,
        unitId: input.unitId,
      }, new Date());
      if (!item) throw new ConflictError('The item changed before this update. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.item_updated', 'item', id);
      return item;
    });
  }

  async deactivateItem(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const item = await createMastersRepository(transaction).deactivateItem(principal.companyId, id, expectedVersion, new Date());
      if (!item) throw new ConflictError('The item changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.item_deactivated', 'item', id, { reason });
      return item;
    });
  }

  async createVendor(principal: AuthenticatedPrincipal, input: VendorCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const { primaryContact, ...vendorInput } = input;
      const vendor = await repository.createVendor({
        ...vendorInput,
        companyId: principal.companyId,
        displayNameNormalized: normalizeName(input.displayName),
        createdByUserId: principal.userId,
      });
      await repository.createVendorContact({
        ...contactValues(primaryContact),
        companyId: principal.companyId,
        vendorId: vendor!.id,
        createdByUserId: principal.userId,
      });
      await this.audit(transaction, principal, requestId, 'master.vendor_created', 'vendor', vendor!.id);
      return vendor!;
    });
  }

  async updateVendor(principal: AuthenticatedPrincipal, id: string, input: VendorUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const { primaryContact, expectedVersion, ...vendorInput } = input;
      const now = new Date();
      const vendor = await repository.updateVendor(principal.companyId, id, expectedVersion, {
        ...vendorInput,
        displayNameNormalized: normalizeName(input.displayName),
      }, now);
      if (!vendor) throw new ConflictError('The vendor changed before this update. Refresh and try again.');
      const contact = await repository.updatePrimaryVendorContact(principal.companyId, id, contactValues(primaryContact), now);
      if (!contact) throw new ConflictError('The vendor primary contact is missing. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.vendor_updated', 'vendor', id);
      return vendor;
    });
  }

  async deactivateVendor(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const vendor = await createMastersRepository(transaction).deactivateVendor(principal.companyId, id, expectedVersion, new Date());
      if (!vendor) throw new ConflictError('The vendor changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.vendor_deactivated', 'vendor', id, { reason });
      return vendor;
    });
  }

  private audit(
    transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
    principal: AuthenticatedPrincipal,
    requestId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
  ) {
    return createAuthRepository(transaction).appendAuditEvent({
      companyId: principal.companyId,
      actorUserId: principal.userId,
      action,
      targetType,
      targetId,
      requestId,
      metadata,
    });
  }
}

export const mastersService = new MastersService();
