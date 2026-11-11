import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { isAdministrator } from '../../core/security/administrator.js';
import { normalizeEmail, normalizeName, normalizePhone } from '../../core/text/normalize.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { type MasterImportIssue } from '../../infrastructure/database/schema/index.js';
import { msg91WhatsAppService } from '../../infrastructure/notifications/msg91.js';
import { removePrivateFile, resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { hasPermission } from '../auth/auth.middleware.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { buildMasterImportTemplate, readMasterImportWorkbook, type MasterImportType } from './masters.imports.js';
import { createMastersRepository } from './masters.repository.js';
import type {
  BrandCreateInput,
  BrandUpdateInput,
  CreateVendorInvitationInput,
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
  VendorDuplicateCheckInput,
  VendorPriceListCreateInput,
  VendorPriceListUpdateInput,
  VendorUpdateInput,
} from './masters.schemas.js';

function validationError(message: string) {
  return new AppError('VALIDATION_ERROR', message, 422);
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function safeOriginalName(name: string) {
  return Array.from(name)
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126 ? '_' : c))
    .join('')
    .slice(0, 255);
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

function contactValues(input: {
  name: string;
  jobTitle?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  isPrimary?: boolean;
}) {
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : undefined;
  const emailNormalized = input.email ? normalizeEmail(input.email) : undefined;
  if (!phoneNormalized && !emailNormalized) {
    throw new AppError('VALIDATION_ERROR', 'Provide a valid contact phone number or email address.', 422);
  }
  return {
    name: input.name,
    jobTitle: input.jobTitle,
    phone: input.phone,
    phoneNormalized,
    alternatePhone: input.alternatePhone,
    email: input.email,
    emailNormalized,
    isPrimary: input.isPrimary ?? false,
    status: 'active' as const,
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

  async getVendor(principal: AuthenticatedPrincipal, id: string) {
    const detail = await createMastersRepository(this.database).getVendorDetail(principal.companyId, id);
    if (!detail) throw new NotFoundError('Vendor not found.');
    return detail;
  }

  async checkVendorDuplicates(principal: AuthenticatedPrincipal, input: VendorDuplicateCheckInput) {
    const repository = createMastersRepository(this.database);
    const result = await repository.findVendorDuplicates(
      principal.companyId,
      input.gstin,
      input.displayName ? normalizeName(input.displayName) : undefined,
      input.phone ? (normalizePhone(input.phone) ?? undefined) : undefined,
      input.excludeVendorId,
    );
    const hasWarnings = Boolean(result.nameMatches.length || result.phoneMatches.length);
    const hasBlockingDuplicate = Boolean(result.gstinMatch);
    return {
      ...result,
      hasWarnings,
      hasBlockingDuplicate,
    };
  }

  async createVendor(principal: AuthenticatedPrincipal, input: VendorCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const {
        primaryContact,
        additionalContacts = [],
        additionalAddresses = [],
        bankAccounts = [],
        code: inputCode,
        ...vendorInput
      } = input;

      const code = inputCode || await repository.getNextVendorCode(principal.companyId);

      if (input.gstStatus === 'registered' && input.gstin) {
        const existingGstin = await repository.findVendorByGstin(principal.companyId, input.gstin);
        if (existingGstin) {
          throw new ConflictError(`A vendor with GSTIN ${input.gstin} already exists: ${existingGstin.displayName} (${existingGstin.code})`);
        }
      }

      const vendor = await repository.createVendor({
        ...vendorInput,
        code,
        companyId: principal.companyId,
        displayNameNormalized: normalizeName(input.displayName),
        createdByUserId: principal.userId,
      });

      await repository.createVendorContact({
        ...contactValues({ ...primaryContact, isPrimary: true }),
        companyId: principal.companyId,
        vendorId: vendor!.id,
        createdByUserId: principal.userId,
      });

      for (const contact of additionalContacts) {
        await repository.createVendorContact({
          ...contactValues({ ...contact, isPrimary: false }),
          companyId: principal.companyId,
          vendorId: vendor!.id,
          createdByUserId: principal.userId,
        });
      }

      await repository.createVendorAddress({
        companyId: principal.companyId,
        vendorId: vendor!.id,
        addressType: 'registered',
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country || 'India',
        isDefault: true,
      });

      for (const addr of additionalAddresses) {
        await repository.createVendorAddress({
          companyId: principal.companyId,
          vendorId: vendor!.id,
          addressType: addr.addressType || 'office',
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: addr.country || 'India',
          isDefault: addr.isDefault || false,
        });
      }

      for (const bank of bankAccounts) {
        await repository.createVendorBankAccount({
          companyId: principal.companyId,
          vendorId: vendor!.id,
          accountHolderName: bank.accountHolderName,
          accountNumber: bank.accountNumber,
          ifscCode: bank.ifscCode.toUpperCase(),
          bankName: bank.bankName,
          branch: bank.branch,
          upiId: bank.upiId,
          isDefault: bank.isDefault ?? true,
        });
      }

      await this.audit(transaction, principal, requestId, 'master.vendor_created', 'vendor', vendor!.id);
      return vendor!;
    });
  }

  async updateVendor(principal: AuthenticatedPrincipal, id: string, input: VendorUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const {
        primaryContact,
        additionalContacts,
        additionalAddresses,
        bankAccounts,
        expectedVersion,
        code: _code,
        ...vendorInput
      } = input;

      if (input.gstStatus === 'registered' && input.gstin) {
        const existingGstin = await repository.findVendorByGstin(principal.companyId, input.gstin, id);
        if (existingGstin) {
          throw new ConflictError(`A vendor with GSTIN ${input.gstin} already exists: ${existingGstin.displayName} (${existingGstin.code})`);
        }
      }

      const now = new Date();
      const vendor = await repository.updateVendor(principal.companyId, id, expectedVersion, {
        ...vendorInput,
        displayNameNormalized: normalizeName(input.displayName),
      }, now);
      if (!vendor) throw new ConflictError('The vendor changed before this update. Refresh and try again.');

      const contact = await repository.updatePrimaryVendorContact(principal.companyId, id, contactValues({ ...primaryContact, isPrimary: true }), now);
      if (!contact) {
        await repository.createVendorContact({
          ...contactValues({ ...primaryContact, isPrimary: true }),
          companyId: principal.companyId,
          vendorId: id,
          createdByUserId: principal.userId,
        });
      }

      if (additionalContacts !== undefined) {
        await repository.deleteVendorContacts(id);
        await repository.createVendorContact({
          ...contactValues({ ...primaryContact, isPrimary: true }),
          companyId: principal.companyId,
          vendorId: id,
          createdByUserId: principal.userId,
        });
        for (const c of additionalContacts) {
          await repository.createVendorContact({
            ...contactValues({ ...c, isPrimary: false }),
            companyId: principal.companyId,
            vendorId: id,
            createdByUserId: principal.userId,
          });
        }
      }

      if (additionalAddresses !== undefined || input.addressLine1) {
        await repository.deleteVendorAddresses(id);
        await repository.createVendorAddress({
          companyId: principal.companyId,
          vendorId: id,
          addressType: 'registered',
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          country: input.country || 'India',
          isDefault: true,
        });
        if (additionalAddresses) {
          for (const addr of additionalAddresses) {
            await repository.createVendorAddress({
              companyId: principal.companyId,
              vendorId: id,
              addressType: addr.addressType || 'office',
              addressLine1: addr.addressLine1,
              addressLine2: addr.addressLine2,
              city: addr.city,
              state: addr.state,
              postalCode: addr.postalCode,
              country: addr.country || 'India',
              isDefault: addr.isDefault || false,
            });
          }
        }
      }

      if (bankAccounts !== undefined) {
        await repository.deleteVendorBankAccounts(id);
        for (const bank of bankAccounts) {
          await repository.createVendorBankAccount({
            companyId: principal.companyId,
            vendorId: id,
            accountHolderName: bank.accountHolderName,
            accountNumber: bank.accountNumber,
            ifscCode: bank.ifscCode.toUpperCase(),
            bankName: bank.bankName,
            branch: bank.branch,
            upiId: bank.upiId,
            isDefault: bank.isDefault ?? true,
          });
        }
      }

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

  async archiveVendor(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, reason: string | undefined, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const vendor = await createMastersRepository(transaction).archiveVendor(principal.companyId, id, expectedVersion, new Date());
      if (!vendor) throw new ConflictError('The vendor changed or is already archived. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.vendor_archived', 'vendor', id, { reason });
      return vendor;
    });
  }

  async approveVendor(principal: AuthenticatedPrincipal, id: string, expectedVersion: number, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const vendor = await createMastersRepository(transaction).approveVendor(principal.companyId, id, expectedVersion, principal.userId, new Date());
      if (!vendor) throw new ConflictError('The vendor changed before approval. Refresh and try again.');
      await this.audit(transaction, principal, requestId, 'master.vendor_approved', 'vendor', id);
      return vendor;
    });
  }

  async listVendorPriceList(principal: AuthenticatedPrincipal, vendorId: string) {
    return createMastersRepository(this.database).listVendorPriceList(principal.companyId, vendorId);
  }

  async createVendorPriceListItem(principal: AuthenticatedPrincipal, vendorId: string, input: VendorPriceListCreateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const vendor = await repository.findVendor(principal.companyId, vendorId);
      if (!vendor) throw new NotFoundError('Vendor not found.');

      const item = await repository.createVendorPriceListItem({
        companyId: principal.companyId,
        vendorId,
        itemId: input.itemId,
        vendorProductCode: input.vendorProductCode,
        vendorProductName: input.vendorProductName,
        description: input.description,
        unitRate: input.unitRate,
        currency: input.currency,
        leadTimeDays: input.leadTimeDays,
        minimumOrderQuantity: input.minimumOrderQuantity,
        effectiveFrom: input.effectiveFrom,
      });

      await this.audit(transaction, principal, requestId, 'master.vendor_price_list_created', 'vendor_price_list', item!.id, { vendorId, productName: input.vendorProductName });
      return item!;
    });
  }

  async updateVendorPriceListItem(principal: AuthenticatedPrincipal, vendorId: string, priceListId: string, input: VendorPriceListUpdateInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const item = await repository.updateVendorPriceListItem(principal.companyId, vendorId, priceListId, {
        itemId: input.itemId,
        vendorProductCode: input.vendorProductCode,
        vendorProductName: input.vendorProductName,
        description: input.description,
        unitRate: input.unitRate,
        currency: input.currency,
        leadTimeDays: input.leadTimeDays,
        minimumOrderQuantity: input.minimumOrderQuantity,
        effectiveFrom: input.effectiveFrom,
      }, new Date());
      if (!item) throw new NotFoundError('Price list item not found.');
      await this.audit(transaction, principal, requestId, 'master.vendor_price_list_updated', 'vendor_price_list', priceListId, { vendorId });
      return item;
    });
  }

  async deleteVendorPriceListItem(principal: AuthenticatedPrincipal, vendorId: string, priceListId: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const item = await repository.deleteVendorPriceListItem(principal.companyId, vendorId, priceListId);
      if (!item) throw new NotFoundError('Price list item not found.');
      await this.audit(transaction, principal, requestId, 'master.vendor_price_list_deleted', 'vendor_price_list', priceListId, { vendorId });
      return item;
    });
  }

  async uploadVendorDocument(principal: AuthenticatedPrincipal, vendorId: string, documentType: string, file: Express.Multer.File, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const vendor = await repository.findVendor(principal.companyId, vendorId);
      if (!vendor) throw new NotFoundError('Vendor not found.');

      const fileBuffer = await readFile(file.path);
      const checksumSha256 = createHash('sha256').update(fileBuffer).digest('hex');

      const doc = await repository.createVendorDocument({
        companyId: principal.companyId,
        vendorId,
        documentType,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageName: file.filename,
        checksumSha256,
      });

      await this.audit(transaction, principal, requestId, 'master.vendor_document_uploaded', 'vendor', vendorId, { documentId: doc!.id, documentType });
      return doc!;
    });
  }

  async deleteVendorDocument(principal: AuthenticatedPrincipal, vendorId: string, documentId: string, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const doc = await repository.deleteVendorDocument(principal.companyId, documentId);
      if (!doc) throw new NotFoundError('Document not found.');
      try {
        await removePrivateFile(doc.storageName);
      } catch {
        // file might already be removed
      }
      await this.audit(transaction, principal, requestId, 'master.vendor_document_deleted', 'vendor', vendorId, { documentId });
      return doc;
    });
  }

  async createOnboardingInvitation(principal: AuthenticatedPrincipal, input: CreateVendorInvitationInput, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const token = randomBytes(24).toString('hex');
      const phoneNormalized = normalizePhone(input.whatsappNumber);
      if (!phoneNormalized) throw new AppError('VALIDATION_ERROR', 'Provide a valid WhatsApp mobile number.', 422);

      const expiresAt = new Date(Date.now() + (input.validDays || 14) * 24 * 60 * 60 * 1000);

      const invitation = await repository.createVendorOnboardingInvitation({
        companyId: principal.companyId,
        token,
        whatsappNumber: input.whatsappNumber,
        whatsappNumberNormalized: phoneNormalized,
        contactName: input.contactName,
        companyName: input.companyName,
        status: 'pending',
        expiresAt,
        invitedByUserId: principal.userId,
      });

      const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';
      const registrationUrl = `${appOrigin}/vendor-registration/${token}`;
      const cleanPhoneForWa = phoneNormalized.replace(/\D/g, '');
      const messageText = `Hello ${input.contactName}, please complete your vendor registration for Fire Safety by opening this link: ${registrationUrl}\nThank you!`;
      const whatsappUrl = `https://wa.me/${cleanPhoneForWa}?text=${encodeURIComponent(messageText)}`;

      let msg91Delivery: { success: boolean; status: string; messageId?: string; error?: string } | undefined;
      if (input.sendViaMsg91 || msg91WhatsAppService.isConfigured()) {
        msg91Delivery = await msg91WhatsAppService.sendVendorInvitation({
          to: phoneNormalized,
          contactName: input.contactName,
          companyName: input.companyName,
          registrationUrl,
        });
      }

      await this.audit(transaction, principal, requestId, 'master.vendor_invitation_created', 'vendor_onboarding_invitation', invitation!.id, {
        whatsappNumber: input.whatsappNumber,
        msg91Status: msg91Delivery?.status,
        msg91MessageId: msg91Delivery?.messageId,
      });

      return {
        ...invitation!,
        registrationUrl,
        whatsappUrl,
        messageText,
        msg91Delivery,
      };
    });
  }

  async sendVendorInvitationViaMsg91(principal: AuthenticatedPrincipal, invitationId: string, requestId: string) {
    const repository = createMastersRepository(this.database);
    const invitation = await repository.findVendorOnboardingInvitationById(principal.companyId, invitationId);
    if (!invitation) throw new NotFoundError('Invitation not found.');
    if (new Date() > new Date(invitation.expiresAt)) throw new AppError('EXPIRED_INVITATION', 'This registration link has expired.', 410);

    const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';
    const registrationUrl = `${appOrigin}/vendor-registration/${invitation.token}`;

    const result = await msg91WhatsAppService.sendVendorInvitation({
      to: invitation.whatsappNumberNormalized,
      contactName: invitation.contactName,
      companyName: invitation.companyName,
      registrationUrl,
    });

    await this.database.transaction(async (transaction) => {
      await this.audit(transaction, principal, requestId, 'master.vendor_invitation_msg91_sent', 'vendor_onboarding_invitation', invitation.id, {
        status: result.status,
        messageId: result.messageId,
        error: result.error,
      });
    });

    return result;
  }

  async getPublicOnboardingInvitation(token: string) {
    const invitation = await createMastersRepository(this.database).findVendorOnboardingInvitationByToken(token);
    if (!invitation) throw new NotFoundError('Registration link not found or invalid.');
    if (invitation.status === 'submitted') {
      return {
        status: 'submitted',
        invitation: {
          contactName: invitation.contactName,
          companyName: invitation.companyName,
          whatsappNumber: invitation.whatsappNumber,
        },
      };
    }
    if (new Date() > new Date(invitation.expiresAt)) {
      return {
        status: 'expired',
        invitation: {
          contactName: invitation.contactName,
          companyName: invitation.companyName,
          whatsappNumber: invitation.whatsappNumber,
        },
      };
    }
    return {
      status: 'pending',
      invitation: {
        contactName: invitation.contactName,
        companyName: invitation.companyName,
        whatsappNumber: invitation.whatsappNumber,
      },
    };
  }

  async submitPublicOnboarding(token: string, input: VendorCreateInput, _requestId: string) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const invitation = await repository.findVendorOnboardingInvitationByToken(token);
      if (!invitation) throw new NotFoundError('Invalid registration link.');
      if (invitation.status === 'submitted') throw new ConflictError('This registration has already been submitted.');
      if (new Date() > new Date(invitation.expiresAt)) throw new AppError('EXPIRED_INVITATION', 'This registration link has expired.', 410);

      if (input.gstStatus === 'registered' && input.gstin) {
        const existingGstin = await repository.findVendorByGstin(invitation.companyId, input.gstin);
        if (existingGstin) {
          throw new ConflictError(`A vendor with GSTIN ${input.gstin} already exists in the system.`);
        }
      }

      const code = input.code || await repository.getNextVendorCode(invitation.companyId);
      const {
        primaryContact,
        additionalContacts = [],
        additionalAddresses = [],
        bankAccounts = [],
        code: _c,
        ...vendorFields
      } = input;

      const vendor = await repository.createVendor({
        ...vendorFields,
        code,
        companyId: invitation.companyId,
        displayNameNormalized: normalizeName(input.displayName),
        approvalStatus: 'pending_approval',
        status: 'inactive',
        createdByUserId: invitation.invitedByUserId!,
      });

      await repository.createVendorContact({
        ...contactValues({ ...primaryContact, isPrimary: true }),
        companyId: invitation.companyId,
        vendorId: vendor!.id,
        createdByUserId: vendor!.createdByUserId,
      });

      for (const contact of additionalContacts) {
        await repository.createVendorContact({
          ...contactValues({ ...contact, isPrimary: false }),
          companyId: invitation.companyId,
          vendorId: vendor!.id,
          createdByUserId: vendor!.createdByUserId,
        });
      }

      await repository.createVendorAddress({
        companyId: invitation.companyId,
        vendorId: vendor!.id,
        addressType: 'registered',
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country || 'India',
        isDefault: true,
      });

      for (const addr of additionalAddresses) {
        await repository.createVendorAddress({
          companyId: invitation.companyId,
          vendorId: vendor!.id,
          addressType: addr.addressType || 'office',
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: addr.country || 'India',
          isDefault: addr.isDefault || false,
        });
      }

      for (const bank of bankAccounts) {
        await repository.createVendorBankAccount({
          companyId: invitation.companyId,
          vendorId: vendor!.id,
          accountHolderName: bank.accountHolderName,
          accountNumber: bank.accountNumber,
          ifscCode: bank.ifscCode.toUpperCase(),
          bankName: bank.bankName,
          branch: bank.branch,
          upiId: bank.upiId,
          isDefault: bank.isDefault ?? true,
        });
      }

      await repository.updateVendorOnboardingInvitation(token, {
        status: 'submitted',
        vendorId: vendor!.id,
        submittedAt: new Date(),
      }, new Date());

      return {
        success: true,
        vendorId: vendor!.id,
        code: vendor!.code,
        displayName: vendor!.displayName,
      };
    });
  }

  async uploadPublicOnboardingDocument(token: string, documentType: string, file: Express.Multer.File) {
    return this.database.transaction(async (transaction) => {
      const repository = createMastersRepository(transaction);
      const invitation = await repository.findVendorOnboardingInvitationByToken(token);
      if (!invitation) throw new NotFoundError('Invalid registration link.');
      if (!invitation.vendorId) {
        throw new AppError('PRECONDITION_FAILED', 'Submit the vendor form before uploading documents.', 400);
      }

      const fileBuffer = await readFile(file.path);
      const checksumSha256 = createHash('sha256').update(fileBuffer).digest('hex');

      const doc = await repository.createVendorDocument({
        companyId: invitation.companyId,
        vendorId: invitation.vendorId,
        documentType,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageName: file.filename,
        checksumSha256,
      });

      return doc!;
    });
  }

  assertImportPermission(principal: AuthenticatedPrincipal, type: MasterImportType) {
    if (isAdministrator(principal)) return;
    const permission = type === 'items' ? 'procurement.item.manage' : 'procurement.vendor.manage';
    if (!hasPermission(principal, permission)) {
      throw new ForbiddenError(`You do not have permission to manage ${type}.`);
    }
  }

  async getImportTemplate(type: MasterImportType) {
    return buildMasterImportTemplate(type);
  }

  async stageImport(
    principal: AuthenticatedPrincipal,
    type: MasterImportType,
    file: Express.Multer.File,
    requestId: string,
  ) {
    this.assertImportPermission(principal, type);
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      await removePrivateFile(file.filename);
      throw validationError('Upload the .xlsx template without changing its file type.');
    }

    try {
      const parsedRows = await readMasterImportWorkbook(type, resolvePrivateFile(file.filename));
      const repository = createMastersRepository(this.database);

      const stagedRows: Array<{
        rowNumber: number;
        payload: Record<string, string | null>;
        issues: MasterImportIssue[];
        warnings: MasterImportIssue[];
        status: 'valid' | 'invalid';
      }> = [];

      if (type === 'items') {
        const [categories, unitsList, families, brandsList] = await Promise.all([
          repository.listActiveCategories(principal.companyId),
          repository.listActiveUnits(principal.companyId),
          repository.listActiveFamilies(principal.companyId),
          repository.listActiveBrands(principal.companyId),
        ]);

        const categoryLookup = new Map<string, typeof categories[0]>();
        for (const cat of categories) {
          categoryLookup.set(cat.code.toUpperCase(), cat);
          categoryLookup.set(cat.nameNormalized.toUpperCase(), cat);
        }

        const unitLookup = new Map<string, typeof unitsList[0]>();
        for (const u of unitsList) {
          unitLookup.set(u.symbol.toUpperCase(), u);
          unitLookup.set(u.code.toUpperCase(), u);
          unitLookup.set(u.nameNormalized.toUpperCase(), u);
        }

        const familyLookup = new Map<string, typeof families[0]>();
        for (const fam of families) {
          familyLookup.set(fam.code.toUpperCase(), fam);
          familyLookup.set(fam.nameNormalized.toUpperCase(), fam);
        }

        const brandLookup = new Map<string, typeof brandsList[0]>();
        for (const br of brandsList) {
          brandLookup.set(br.code.toUpperCase(), br);
          brandLookup.set(br.nameNormalized.toUpperCase(), br);
        }

        const seenCodesInBatch = new Set<string>();

        for (const row of parsedRows) {
          const issues: MasterImportIssue[] = [];
          const warnings: MasterImportIssue[] = [];
          const code = (row.payload.code ?? '').trim().toUpperCase();
          const name = (row.payload.name ?? '').trim();
          const categoryStr = (row.payload.category ?? '').trim();
          const unitStr = (row.payload.unit ?? '').trim();
          const familyStr = (row.payload.family ?? '').trim();
          const costingBrandStr = (row.payload.costing_brand ?? '').trim();
          const initialRateStr = (row.payload.initial_rate ?? '').trim();

          if (!code) {
            issues.push({ field: 'code', message: 'Item code is required.' });
          } else if (code.length > 50 || !/^[A-Za-z0-9_-]+$/.test(code)) {
            issues.push({ field: 'code', message: 'Use up to 50 letters, numbers, hyphens, or underscores only.' });
          } else if (seenCodesInBatch.has(code)) {
            issues.push({ field: 'code', message: `Duplicate item code '${code}' in this import file.` });
          } else {
            seenCodesInBatch.add(code);
            const existingItem = await repository.findActiveItemByCode(principal.companyId, code);
            if (existingItem) {
              issues.push({ field: 'code', message: `An item with code '${code}' already exists.` });
            }
          }

          if (!name) {
            issues.push({ field: 'name', message: 'Item name is required.' });
          } else if (name.length < 2 || name.length > 160) {
            issues.push({ field: 'name', message: 'Item name must be between 2 and 160 characters.' });
          }

          if (!categoryStr) {
            issues.push({ field: 'category', message: 'Category code or name is required.' });
          } else {
            const category = categoryLookup.get(categoryStr.toUpperCase());
            if (!category) {
              issues.push({ field: 'category', message: `Active category not found for '${categoryStr}'.` });
            }
          }

          if (!unitStr) {
            issues.push({ field: 'unit', message: 'Unit symbol or code is required.' });
          } else {
            const unit = unitLookup.get(unitStr.toUpperCase());
            if (!unit) {
              issues.push({ field: 'unit', message: `Active unit not found for '${unitStr}'.` });
            }
          }

          if (familyStr) {
            const family = familyLookup.get(familyStr.toUpperCase());
            if (!family) {
              issues.push({ field: 'family', message: `Active item family not found for '${familyStr}'.` });
            }
          }

          if (costingBrandStr) {
            const brand = brandLookup.get(costingBrandStr.toUpperCase());
            if (!brand) {
              issues.push({ field: 'costing_brand', message: `Active brand not found for '${costingBrandStr}'.` });
            }
          }

          if (initialRateStr) {
            const rateNum = Number(initialRateStr);
            if (Number.isNaN(rateNum) || rateNum < 0 || !/^\d+(\.\d{1,4})?$/.test(initialRateStr)) {
              issues.push({ field: 'initial_rate', message: 'Initial rate must be a valid non-negative number.' });
            }
          }

          stagedRows.push({
            rowNumber: row.rowNumber,
            payload: row.payload,
            issues,
            warnings,
            status: issues.length === 0 ? 'valid' : 'invalid',
          });
        }
      } else {
        const seenCodesInBatch = new Set<string>();
        const seenGstinsInBatch = new Set<string>();
        const validVendorTypes = new Set([
          'material_supplier',
          'manufacturer',
          'distributor_dealer',
          'service_provider',
          'installation_contractor',
          'labour_contractor',
          'transport_logistics',
          'other',
        ]);

        for (const row of parsedRows) {
          const issues: MasterImportIssue[] = [];
          const warnings: MasterImportIssue[] = [];
          const displayName = (row.payload.display_name ?? '').trim();
          const code = (row.payload.code ?? '').trim().toUpperCase();
          const vendorType = (row.payload.vendor_type ?? '').trim();
          const gstin = (row.payload.gstin ?? '').trim().toUpperCase();
          const pan = (row.payload.pan ?? '').trim().toUpperCase();
          const contactName = (row.payload.contact_name ?? '').trim();
          const contactPhone = (row.payload.contact_phone ?? '').trim();
          const contactEmail = (row.payload.contact_email ?? '').trim();

          if (!displayName) {
            issues.push({ field: 'display_name', message: 'Vendor display name is required.' });
          } else if (displayName.length < 2 || displayName.length > 160) {
            issues.push({ field: 'display_name', message: 'Display name must be between 2 and 160 characters.' });
          } else {
            const existingByName = await repository.findVendorByDisplayName(
              principal.companyId,
              normalizeName(displayName),
            );
            if (existingByName) {
              warnings.push({
                field: 'display_name',
                message: `Possible duplicate vendor: '${existingByName.displayName}' (${existingByName.code}) already exists.`,
              });
            }
          }

          if (code) {
            if (code.length > 50 || !/^[A-Za-z0-9_-]+$/.test(code)) {
              issues.push({ field: 'code', message: 'Use up to 50 letters, numbers, hyphens, or underscores only.' });
            } else if (seenCodesInBatch.has(code)) {
              issues.push({ field: 'code', message: `Duplicate vendor code '${code}' in this import file.` });
            } else {
              seenCodesInBatch.add(code);
              const existingByCode = await repository.findVendorByCode(principal.companyId, code);
              if (existingByCode) {
                issues.push({ field: 'code', message: `A vendor with code '${code}' already exists.` });
              }
            }
          }

          if (vendorType && !validVendorTypes.has(vendorType)) {
            issues.push({
              field: 'vendor_type',
              message: `Choose a valid vendor type (e.g., material_supplier, manufacturer, distributor_dealer).`,
            });
          }

          if (gstin) {
            if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
              issues.push({ field: 'gstin', message: 'Provide a valid 15-character GSTIN format.' });
            } else if (seenGstinsInBatch.has(gstin)) {
              issues.push({ field: 'gstin', message: `Duplicate GSTIN '${gstin}' in this import file.` });
            } else {
              seenGstinsInBatch.add(gstin);
              const existingByGstin = await repository.findVendorByGstin(principal.companyId, gstin);
              if (existingByGstin) {
                issues.push({ field: 'gstin', message: `A vendor with GSTIN '${gstin}' already exists.` });
              }
            }
          }

          if (pan) {
            if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
              issues.push({ field: 'pan', message: 'Provide a valid 10-character PAN format.' });
            }
          }

          if (contactName) {
            if (contactPhone && (contactPhone.length < 7 || contactPhone.length > 30)) {
              issues.push({ field: 'contact_phone', message: 'Contact phone must be between 7 and 30 characters.' });
            }
            if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
              issues.push({ field: 'contact_email', message: 'Provide a valid contact email.' });
            }
            if (!contactPhone && !contactEmail) {
              issues.push({
                field: 'contact_phone',
                message: 'Provide at least a phone number or email for the primary contact.',
              });
            }
          }

          stagedRows.push({
            rowNumber: row.rowNumber,
            payload: row.payload,
            issues,
            warnings,
            status: issues.length === 0 ? 'valid' : 'invalid',
          });
        }
      }

      const validRows = stagedRows.filter((row) => row.status === 'valid').length;
      const checksumSha256 = await sha256File(resolvePrivateFile(file.filename));
      const originalName = safeOriginalName(file.originalname);

      const batch = await this.database.transaction(async (transaction) => {
        const repo = createMastersRepository(transaction);
        const created = await repo.createImportBatch(
          {
            companyId: principal.companyId,
            type,
            originalName,
            storageName: file.filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            checksumSha256,
            totalRows: stagedRows.length,
            validRows,
            invalidRows: stagedRows.length - validRows,
            createdByUserId: principal.userId,
          },
          stagedRows.map((row) => ({
            ...row,
            companyId: principal.companyId,
          })),
        );
        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'master.import_staged',
          targetType: 'master_import_batch',
          targetId: created!.id,
          requestId,
          metadata: { type, totalRows: stagedRows.length, validRows },
        });
        return created!;
      });

      return this.getImportBatch(principal, batch.id);
    } catch (error) {
      await removePrivateFile(file.filename);
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : 'The workbook could not be read.';
      throw validationError(message);
    }
  }

  async getImportBatch(principal: AuthenticatedPrincipal, batchId: string) {
    const repository = createMastersRepository(this.database);
    const batch = await repository.findImportBatch(principal.companyId, batchId);
    if (!batch || (!isAdministrator(principal) && batch.createdByUserId !== principal.userId)) {
      throw new NotFoundError('Import batch not found.');
    }
    this.assertImportPermission(principal, batch.type);
    const rows = await repository.listImportRows(principal.companyId, batchId);
    return {
      id: batch.id,
      type: batch.type,
      status: batch.status,
      originalName: batch.originalName,
      checksumSha256: batch.checksumSha256,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      rowVersion: batch.rowVersion,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
      rows: rows.map((row) => ({
        id: row.id,
        rowNumber: row.rowNumber,
        payload: row.payload,
        issues: row.issues,
        warnings: row.warnings,
        status: row.status,
        createdRecordId: row.createdRecordId,
        resultMessage: row.resultMessage,
      })),
    };
  }

  async commitImport(
    principal: AuthenticatedPrincipal,
    batchId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    const repository = createMastersRepository(this.database);
    const existing = await repository.findImportBatch(principal.companyId, batchId);
    if (!existing || (!isAdministrator(principal) && existing.createdByUserId !== principal.userId)) {
      throw new NotFoundError('Import batch not found.');
    }
    this.assertImportPermission(principal, existing.type);
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new ConflictError('This import batch is already closed.');
    }
    const claimed = await repository.claimImportBatch(principal.companyId, batchId, expectedVersion);
    if (!claimed) {
      throw new ConflictError('This import batch changed or is being committed elsewhere. Refresh it.');
    }
    const rows = await repository.listImportRows(principal.companyId, batchId);

    for (const row of rows.filter((item) => item.status === 'valid')) {
      try {
        if (claimed.type === 'items') {
          await this.commitItemImportRow(principal, row.id, row.payload, requestId);
        } else {
          await this.commitVendorImportRow(principal, row.id, row.payload, requestId);
        }
      } catch (error) {
        const message = error instanceof AppError ? error.message : 'The row could not be committed.';
        await repository.markImportRowFailed(principal.companyId, row.id, message, new Date());
      }
    }

    await this.database.transaction(async (transaction) => {
      const completed = await createMastersRepository(transaction).completeImportBatch(
        principal.companyId,
        claimed.id,
        claimed.rowVersion,
        new Date(),
      );
      if (!completed) throw new ConflictError('The import batch changed before completion. Refresh it.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'master.import_completed',
        targetType: 'master_import_batch',
        targetId: claimed.id,
        requestId,
        metadata: { type: claimed.type },
      });
    });

    return this.getImportBatch(principal, batchId);
  }

  private async commitItemImportRow(
    principal: AuthenticatedPrincipal,
    rowId: string,
    payload: Record<string, string | null>,
    requestId: string,
  ) {
    const code = (payload.code ?? '').trim().toUpperCase();
    const name = (payload.name ?? '').trim();
    const categoryStr = (payload.category ?? '').trim();
    const unitStr = (payload.unit ?? '').trim();
    const familyStr = (payload.family ?? '').trim();
    const costingBrandStr = (payload.costing_brand ?? '').trim();
    const model = (payload.model ?? '').trim() || null;
    const specification = (payload.specification ?? '').trim() || null;
    const initialRate = (payload.initial_rate ?? '').trim() || null;

    return this.database.transaction(async (transaction) => {
      const repo = createMastersRepository(transaction);
      const [categories, unitsList, families, brandsList] = await Promise.all([
        repo.listActiveCategories(principal.companyId),
        repo.listActiveUnits(principal.companyId),
        repo.listActiveFamilies(principal.companyId),
        repo.listActiveBrands(principal.companyId),
      ]);

      const category = categories.find(
        (c) => c.code.toUpperCase() === categoryStr.toUpperCase() || c.nameNormalized.toUpperCase() === categoryStr.toUpperCase(),
      );
      if (!category) throw validationError(`Category '${categoryStr}' not found.`);

      const unit = unitsList.find(
        (u) => u.symbol.toUpperCase() === unitStr.toUpperCase() || u.code.toUpperCase() === unitStr.toUpperCase() || u.nameNormalized.toUpperCase() === unitStr.toUpperCase(),
      );
      if (!unit) throw validationError(`Unit '${unitStr}' not found.`);

      const family = familyStr
        ? families.find((f) => f.code.toUpperCase() === familyStr.toUpperCase() || f.nameNormalized.toUpperCase() === familyStr.toUpperCase())
        : undefined;

      const brand = costingBrandStr
        ? brandsList.find((b) => b.code.toUpperCase() === costingBrandStr.toUpperCase() || b.nameNormalized.toUpperCase() === costingBrandStr.toUpperCase())
        : undefined;

      const item = await repo.createItem({
        companyId: principal.companyId,
        code,
        name,
        nameNormalized: normalizeName(name),
        specification,
        categoryId: category.id,
        unitId: unit.id,
        familyId: family?.id ?? null,
        costingBrandId: brand?.id ?? null,
        model,
        specificationValues: {},
        createdByUserId: principal.userId,
      });

      if (!item) throw validationError('Item creation failed.');

      if (brand) {
        await repo.replaceItemBrands(principal.companyId, item.id, [brand.id], principal.userId);
      }

      if (brand || model || initialRate) {
        const offering = await repo.createItemOffering({
          companyId: principal.companyId,
          itemId: item.id,
          brandId: brand?.id ?? null,
          manufacturerModel: model || 'Standard',
          isPreferred: true,
          status: 'active',
          createdByUserId: principal.userId,
        });

        if (offering && initialRate) {
          await repo.createItemRate({
            companyId: principal.companyId,
            itemId: item.id,
            offeringId: offering.id,
            currency: 'INR',
            effectiveFrom: new Date().toISOString().slice(0, 10),
            supplyRate: initialRate,
            labourRate: '0.00',
            miscellaneousRate: '0.00',
            miscellaneousNote: 'Imported via Excel catalogue onboarding',
            createdByUserId: principal.userId,
          });
        }
      }

      await this.audit(transaction, principal, requestId, 'master.item_imported', 'item', item.id, {
        code: item.code,
        name: item.name,
      });

      await repo.markImportRowCreated(principal.companyId, rowId, item.id, new Date());
      return item;
    });
  }

  private async commitVendorImportRow(
    principal: AuthenticatedPrincipal,
    rowId: string,
    payload: Record<string, string | null>,
    requestId: string,
  ) {
    const displayName = (payload.display_name ?? '').trim();
    const inputCode = (payload.code ?? '').trim().toUpperCase();
    const legalName = (payload.legal_name ?? '').trim() || null;
    const vendorType = (payload.vendor_type ?? '').trim() || 'material_supplier';
    const gstin = (payload.gstin ?? '').trim().toUpperCase() || null;
    const pan = (payload.pan ?? '').trim().toUpperCase() || null;
    const gstStatus = (payload.gst_status ?? '').trim() || (gstin ? 'registered' : 'unregistered');
    const contactName = (payload.contact_name ?? '').trim() || null;
    const contactPhone = (payload.contact_phone ?? '').trim() || null;
    const contactEmail = (payload.contact_email ?? '').trim() || null;
    const addressLine1 = (payload.address_line_1 ?? '').trim() || null;
    const city = (payload.city ?? '').trim() || null;
    const state = (payload.state ?? '').trim() || null;
    const postalCode = (payload.postal_code ?? '').trim() || null;
    const paymentTerms = (payload.payment_terms ?? '').trim() || null;

    return this.database.transaction(async (transaction) => {
      const repo = createMastersRepository(transaction);
      const code = inputCode || await repo.getNextVendorCode(principal.companyId);

      const vendor = await repo.createVendor({
        companyId: principal.companyId,
        code,
        displayName,
        displayNameNormalized: normalizeName(displayName),
        legalName,
        vendorType,
        supplierCategories: ['General'],
        gstStatus,
        gstin,
        pan,
        addressLine1: addressLine1 || undefined,
        city: city || undefined,
        state: state || undefined,
        postalCode: postalCode || undefined,
        paymentTerms: paymentTerms || undefined,
        approvalStatus: 'active',
        status: 'active',
        createdByUserId: principal.userId,
      });

      if (!vendor) throw validationError('Vendor creation failed.');

      if (contactName && (contactPhone || contactEmail)) {
        await repo.createVendorContact({
          companyId: principal.companyId,
          vendorId: vendor.id,
          name: contactName,
          phone: contactPhone,
          phoneNormalized: contactPhone ? normalizePhone(contactPhone) : null,
          email: contactEmail,
          emailNormalized: contactEmail ? normalizeEmail(contactEmail) : null,
          isPrimary: true,
          status: 'active',
          createdByUserId: principal.userId,
        });
      }

      if (addressLine1 && city && state && postalCode) {
        await repo.createVendorAddress({
          companyId: principal.companyId,
          vendorId: vendor.id,
          addressType: 'office',
          addressLine1,
          city,
          state,
          postalCode,
          country: 'India',
          isDefault: true,
        });
      }

      await this.audit(transaction, principal, requestId, 'master.vendor_imported', 'vendor', vendor.id, {
        code: vendor.code,
        displayName: vendor.displayName,
      });

      await repo.markImportRowCreated(principal.companyId, rowId, vendor.id, new Date());
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
