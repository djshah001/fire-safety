import { AppError, ConflictError, NotFoundError } from '../../core/errors/appError.js';
import { normalizeEmail, normalizeName, normalizePhone } from '../../core/text/normalize.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createMastersRepository } from './masters.repository.js';
import type {
  BrandCreateInput,
  BrandUpdateInput,
  ItemCategoryCreateInput,
  ItemCategoryUpdateInput,
  ItemCreateInput,
  ItemFamilyCreateInput,
  ItemFamilyUpdateInput,
  ItemOfferingCreateInput,
  ItemOfferingUpdateInput,
  ItemRateCreateInput,
  ItemUpdateInput,
  MasterListQuery,
  UnitCreateInput,
  UnitUpdateInput,
  VendorCreateInput,
  VendorUpdateInput,
} from './masters.schemas.js';

function validationError(message: string) {
  return new AppError('VALIDATION_ERROR', message, 422);
}

type SpecificationDefinition = {
  key: string;
  label: string;
  valueType: string;
  isRequired: boolean;
};

export function normalizeSpecificationValues(
  definitions: SpecificationDefinition[],
  values: Record<string, string | number | boolean>,
) {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const unknown = Object.keys(values).filter((key) => !byKey.has(key));
  if (unknown.length > 0) throw validationError(`Unknown family specification keys: ${unknown.join(', ')}.`);

  const normalized: Record<string, string | number | boolean> = {};
  for (const definition of definitions) {
    const value = values[definition.key];
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      if (definition.isRequired) throw validationError(`${definition.label} is required.`);
      continue;
    }
    if (definition.valueType === 'text') {
      // HTML forms and imports may infer numeric-looking values. Text specifications
      // such as extinguisher capacity still preserve their exact scalar as text.
      normalized[definition.key] = String(value).trim();
      continue;
    }
    if (definition.valueType === 'number') {
      const number = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(number)) throw validationError(`${definition.label} must be a finite number.`);
      normalized[definition.key] = number;
      continue;
    }
    if (definition.valueType === 'boolean') {
      if (typeof value === 'boolean') normalized[definition.key] = value;
      else if (value === 'true' || value === 'false') normalized[definition.key] = value === 'true';
      else throw validationError(`${definition.label} must be a boolean value.`);
      continue;
    }
    throw validationError(`${definition.label} has an unsupported specification type.`);
  }
  return normalized;
}

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
  async listBrands(principal: AuthenticatedPrincipal, input: MasterListQuery) {
    return page(await createMastersRepository(this.database).listBrands(principal.companyId, input), input);
  }
  async listItemFamilies(principal: AuthenticatedPrincipal, input: MasterListQuery) {
    return page(await createMastersRepository(this.database).listItemFamilies(principal.companyId, input), input);
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
        allowFractional: input.allowFractional,
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
        allowFractional: input.allowFractional,
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

  async createBrand(principal: AuthenticatedPrincipal, input: BrandCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const brand = await createMastersRepository(transaction).createBrand({ companyId: principal.companyId, code: input.code, name: input.name, nameNormalized: normalizeName(input.name), createdByUserId: principal.userId });
      await this.audit(transaction, principal, requestId, 'master.brand_created', 'brand', brand!.id);
      return brand!;
    });
  }

  async updateBrand(principal: AuthenticatedPrincipal, id: string, input: BrandUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const brand = await createMastersRepository(transaction).updateBrand(principal.companyId, id, input.expectedVersion, { code: input.code, name: input.name, nameNormalized: normalizeName(input.name) }, new Date());
      if (!brand) throw new ConflictError('The brand/make changed before this update. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.brand_updated', 'brand', id);
      return brand;
    });
  }

  async deactivateBrand(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const brand = await createMastersRepository(transaction).deactivateBrand(principal.companyId, id, expectedVersion, new Date());
      if (!brand) throw new ConflictError('The brand/make changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.brand_deactivated', 'brand', id, { reason });
      return brand;
    });
  }

  async createItemFamily(principal: AuthenticatedPrincipal, input: ItemFamilyCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const [category, defaultUnit] = await Promise.all([
        repository.findItemCategory(principal.companyId, input.categoryId),
        input.defaultUnitId ? repository.findUnit(principal.companyId, input.defaultUnitId) : undefined,
      ]);
      if (!category || category.status !== 'active') throw new NotFoundError('Active item category not found.');
      if (input.defaultUnitId && (!defaultUnit || defaultUnit.status !== 'active')) throw new NotFoundError('Active default unit not found.');
      const family = await repository.createItemFamily({
        companyId: principal.companyId, categoryId: input.categoryId, code: input.code,
        name: input.name, nameNormalized: normalizeName(input.name), scopeDescription: input.scopeDescription,
        defaultUnitId: input.defaultUnitId, createdByUserId: principal.userId,
      });
      await repository.replaceItemFamilySpecifications(principal.companyId, family!.id, input.specifications);
      await this.audit(transaction, principal, requestId, 'master.item_family_created', 'item_family', family!.id);
      return family!;
    });
  }

  async updateItemFamily(principal: AuthenticatedPrincipal, id: string, input: ItemFamilyUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const [category, defaultUnit] = await Promise.all([
        repository.findItemCategory(principal.companyId, input.categoryId),
        input.defaultUnitId ? repository.findUnit(principal.companyId, input.defaultUnitId) : undefined,
      ]);
      if (!category || category.status !== 'active') throw new NotFoundError('Active item category not found.');
      if (input.defaultUnitId && (!defaultUnit || defaultUnit.status !== 'active')) throw new NotFoundError('Active default unit not found.');
      const family = await repository.updateItemFamily(principal.companyId, id, input.expectedVersion, {
        code: input.code, name: input.name, nameNormalized: normalizeName(input.name),
        scopeDescription: input.scopeDescription, categoryId: input.categoryId, defaultUnitId: input.defaultUnitId,
      }, new Date());
      if (!family) throw new ConflictError('The item family changed before this update. Refresh and try again.');
      await repository.replaceItemFamilySpecifications(principal.companyId, id, input.specifications);
      await this.audit(transaction, principal, requestId, 'master.item_family_updated', 'item_family', id);
      return family;
    });
  }

  async deactivateItemFamily(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const family = await createMastersRepository(transaction).deactivateItemFamily(principal.companyId, id, expectedVersion, new Date());
      if (!family) throw new ConflictError('The item family changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.item_family_deactivated', 'item_family', id, { reason });
      return family;
    });
  }

  private async assertActiveItemReferences(repository: ReturnType<typeof createMastersRepository>, companyId: string, unitId: string, familyId: string) {
    const [unit, family] = await Promise.all([
      repository.findUnit(companyId, unitId),
      repository.findItemFamily(companyId, familyId),
    ]);
    if (!unit || unit.status !== 'active') throw new NotFoundError('Active unit not found.');
    if (!family || family.status !== 'active') throw new NotFoundError('Choose an active item family.');
    return family;
  }

  private async normalizeSpecificationValues(repository: ReturnType<typeof createMastersRepository>, companyId: string, familyId: string, values: Record<string, string | number | boolean>) {
    const definitions = await repository.listItemFamilySpecifications(companyId, familyId);
    return normalizeSpecificationValues(definitions, values);
  }

  private async assertActiveBrands(repository: ReturnType<typeof createMastersRepository>, companyId: string, brandIds: string[]) {
    const selected = await repository.findBrands(companyId, brandIds);
    if (selected.length !== brandIds.length || selected.some((brand) => brand.status !== 'active')) {
      throw new NotFoundError('One or more active brands/makes were not found.');
    }
  }

  async createItem(principal: AuthenticatedPrincipal, input: ItemCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const family = await this.assertActiveItemReferences(repository, principal.companyId, input.unitId, input.familyId);
      const specificationValues = await this.normalizeSpecificationValues(repository, principal.companyId, input.familyId, input.specificationValues);
      await this.assertActiveBrands(repository, principal.companyId, input.brandIds);
      const item = await repository.createItem({
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        specification: input.specification,
        familyId: input.familyId,
        model: input.model,
        specificationValues,
        categoryId: family.categoryId,
        unitId: input.unitId,
        createdByUserId: principal.userId,
      });
      await repository.replaceItemBrands(principal.companyId, item!.id, input.brandIds, principal.userId);
      await this.audit(transaction, principal, requestId, 'master.item_created', 'item', item!.id);
      return item!;
    });
  }

  async updateItem(principal: AuthenticatedPrincipal, id: string, input: ItemUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const family = await this.assertActiveItemReferences(repository, principal.companyId, input.unitId, input.familyId);
      const specificationValues = await this.normalizeSpecificationValues(repository, principal.companyId, input.familyId, input.specificationValues);
      await this.assertActiveBrands(repository, principal.companyId, input.brandIds);
      const item = await repository.updateItem(principal.companyId, id, input.expectedVersion, {
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        specification: input.specification,
        familyId: input.familyId,
        model: input.model,
        specificationValues,
        categoryId: family.categoryId,
        unitId: input.unitId,
      }, new Date());
      if (!item) throw new ConflictError('The item changed before this update. Refresh and try again.');
      await repository.replaceItemBrands(principal.companyId, id, input.brandIds, principal.userId);
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

  async listItemOfferings(principal: AuthenticatedPrincipal, itemId: string) {
    const repository = createMastersRepository(this.database);
    if (!await repository.findItem(principal.companyId, itemId)) throw new NotFoundError('Catalogue variant not found.');
    return repository.listItemOfferings(principal.companyId, itemId);
  }

  async createItemOffering(principal: AuthenticatedPrincipal, itemId: string, input: ItemOfferingCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const item = await repository.findItem(principal.companyId, itemId);
      if (!item || item.status !== 'active') throw new NotFoundError('Active catalogue variant not found.');
      if (input.brandId) await this.assertActiveBrands(repository, principal.companyId, [input.brandId]);
      const existing = await repository.listItemOfferings(principal.companyId, itemId);
      const isPreferred = input.isPreferred || existing.every((offering) => offering.status !== 'active');
      if (isPreferred) await repository.clearPreferredOffering(principal.companyId, itemId);
      const offering = await repository.createItemOffering({
        companyId: principal.companyId, itemId, brandId: input.brandId,
        manufacturerModel: input.manufacturerModel, manufacturerSku: input.manufacturerSku,
        isPreferred, createdByUserId: principal.userId,
      });
      if (input.brandId) await repository.addItemBrand(principal.companyId, itemId, input.brandId, principal.userId);
      await this.audit(transaction, principal, requestId, 'master.item_offering_created', 'item_brand_offering', offering!.id, { itemId, brandId: input.brandId, isPreferred });
      return offering!;
    });
  }

  async updateItemOffering(principal: AuthenticatedPrincipal, itemId: string, offeringId: string, input: ItemOfferingUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const current = await repository.findItemOffering(principal.companyId, itemId, offeringId);
      if (!current) throw new NotFoundError('Brand offering not found.');
      if (input.brandId) await this.assertActiveBrands(repository, principal.companyId, [input.brandId]);
      if (current.isPreferred && !input.isPreferred) {
        throw validationError('Choose another offering as preferred instead of leaving this item without a preferred costing option.');
      }
      if (input.isPreferred) await repository.clearPreferredOffering(principal.companyId, itemId);
      const offering = await repository.updateItemOffering(principal.companyId, itemId, offeringId, input.expectedVersion, {
        brandId: input.brandId, manufacturerModel: input.manufacturerModel,
        manufacturerSku: input.manufacturerSku, isPreferred: input.isPreferred,
      });
      if (!offering) throw new ConflictError('The brand offering changed. Refresh and try again.');
      if (input.brandId) await repository.addItemBrand(principal.companyId, itemId, input.brandId, principal.userId);
      await this.audit(transaction, principal, requestId, 'master.item_offering_updated', 'item_brand_offering', offeringId, { itemId, brandId: input.brandId });
      return offering;
    });
  }

  async deactivateItemOffering(principal: AuthenticatedPrincipal, itemId: string, offeringId: string, expectedVersion: number, reason: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const current = await repository.findItemOffering(principal.companyId, itemId, offeringId);
      if (!current) throw new NotFoundError('Brand offering not found.');
      if (current.isPreferred && (await repository.listItemOfferings(principal.companyId, itemId)).some((entry) => entry.id !== offeringId && entry.status === 'active')) {
        throw validationError('Choose another active offering as preferred before deactivating this one.');
      }
      const offering = await repository.deactivateItemOffering(principal.companyId, itemId, offeringId, expectedVersion);
      if (!offering) throw new ConflictError('The brand offering changed or is already inactive. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.item_offering_deactivated', 'item_brand_offering', offeringId, { itemId, reason });
      return offering;
    });
  }

  async listItemRates(principal: AuthenticatedPrincipal, itemId: string, offeringId: string) {
    const repository = createMastersRepository(this.database);
    if (!await repository.findItemOffering(principal.companyId, itemId, offeringId)) throw new NotFoundError('Brand offering not found.');
    return repository.listItemRates(principal.companyId, itemId, offeringId);
  }

  async createItemRate(principal: AuthenticatedPrincipal, itemId: string, offeringId: string, input: ItemRateCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const item = await repository.findItem(principal.companyId, itemId);
      const offering = await repository.findItemOffering(principal.companyId, itemId, offeringId);
      if (!item || item.status !== 'active' || !offering || offering.status !== 'active') throw new NotFoundError('Active catalogue brand offering not found.');
      const rate = await repository.createItemRate({
        companyId: principal.companyId, itemId, offeringId, currency: input.currency, effectiveFrom: input.effectiveFrom,
        supplyRate: input.supplyRate, labourRate: input.labourRate, miscellaneousRate: input.miscellaneousRate,
        miscellaneousNote: input.miscellaneousNote, createdByUserId: principal.userId,
      });
      await this.audit(transaction, principal, requestId, 'master.item_rate_created', 'item_rate_version', rate!.id, { itemId, offeringId, effectiveFrom: input.effectiveFrom, currency: input.currency });
      return rate!;
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
