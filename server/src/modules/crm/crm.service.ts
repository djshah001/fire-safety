import { isAdministrator } from '../../core/security/administrator.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/appError.js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { normalizeEmail, normalizeName, normalizePhone } from '../../core/text/normalize.js';
import { db, type Database } from '../../infrastructure/database/db.js';
import { removePrivateFile, resolvePrivateFile } from '../../infrastructure/storage/localFileStorage.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import { hasExplicitCompanyGrant, hasPermission } from '../auth/auth.middleware.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { createNotificationRepository } from '../notifications/notification.repository.js';
import { createCrmRepository, type CrmAccess } from './crm.repository.js';
import { readImportWorkbook, type CrmImportType } from './crm.imports.js';
import { customerInputSchema, leadInputSchema } from './crm.schemas.js';
import type {
  addressInputSchema,
  contactInputSchema,
  activityInputSchema,
  reminderInputSchema,
  bulkLeadAssignmentSchema,
  bulkReminderInputSchema,
  authorizeDesignInputSchema,
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
type ActivityInput = z.infer<typeof activityInputSchema>;
type ReminderInput = z.infer<typeof reminderInputSchema>;
type BulkLeadAssignmentInput = z.infer<typeof bulkLeadAssignmentSchema>;
type BulkReminderInput = z.infer<typeof bulkReminderInputSchema>;
type AuthorizeDesignInput = z.infer<typeof authorizeDesignInputSchema>;

type ImportIssue = { field?: string; message: string };

function zodIssues(error: z.ZodError): ImportIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : undefined,
    message: issue.message,
  }));
}

function importValue(payload: Record<string, string | null>, key: string) {
  return payload[key] || undefined;
}

function safeOriginalName(value: string) {
  return Array.from(path.basename(value))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? '_' : character;
    })
    .join('')
    .slice(0, 255);
}

function customerInputFromImport(payload: Record<string, string | null>) {
  const hasSite = ['site_name', 'site_address', 'city', 'state', 'postal_code', 'country']
    .some((key) => Boolean(importValue(payload, key)));
  return {
    displayName: importValue(payload, 'display_name') ?? '',
    legalName: importValue(payload, 'legal_name'),
    customerType: importValue(payload, 'customer_type') ?? 'business',
    gstin: importValue(payload, 'gstin'),
    pan: importValue(payload, 'pan'),
    contacts: [{
      name: importValue(payload, 'contact_name') ?? '',
      jobTitle: importValue(payload, 'job_title'),
      phone: importValue(payload, 'phone'),
      email: importValue(payload, 'email'),
      isPrimary: true,
    }],
    addresses: importValue(payload, 'billing_address') ? [{
      label: 'Billing',
      addressLine1: importValue(payload, 'billing_address') ?? '',
      city: importValue(payload, 'billing_city') ?? '',
      state: importValue(payload, 'billing_state'),
      postalCode: importValue(payload, 'billing_postal_code'),
      country: importValue(payload, 'billing_country'),
    }] : [],
    sites: hasSite ? [{
      name: importValue(payload, 'site_name') ?? '',
      addressLine1: importValue(payload, 'site_address') ?? '',
      city: importValue(payload, 'city') ?? '',
      state: importValue(payload, 'state'),
      postalCode: importValue(payload, 'postal_code'),
      country: importValue(payload, 'country'),
    }] : [],
  };
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

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

  assertImportPermission(principal: AuthenticatedPrincipal, type: CrmImportType) {
    const permission = type === 'customers' ? 'crm.customer_master.manage' : 'crm.lead.write';
    if (!hasPermission(principal, permission)) {
      throw new ForbiddenError(`You cannot import ${type === 'customers' ? 'customers' : 'leads'}.`);
    }
  }

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

  listClassifications(
    principal: AuthenticatedPrincipal,
    type: 'lead-purposes' | 'market-sectors',
    includeInactive: boolean,
  ) {
    const repository = createCrmRepository(this.database);
    return type === 'lead-purposes'
      ? repository.listLeadPurposes(principal.companyId, includeInactive)
      : repository.listMarketSectors(principal.companyId, includeInactive);
  }

  async createClassification(
    principal: AuthenticatedPrincipal,
    type: 'lead-purposes' | 'market-sectors',
    input: { code: string; name: string },
    requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const values = {
        companyId: principal.companyId,
        code: input.code,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        createdByUserId: principal.userId,
      };
      const classification = type === 'lead-purposes'
        ? await repository.createLeadPurpose(values)
        : await repository.createMarketSector(values);
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: `crm.${type === 'lead-purposes' ? 'lead_purpose' : 'market_sector'}_created`,
        targetType: type === 'lead-purposes' ? 'lead_purpose' : 'market_sector',
        targetId: classification.id,
        requestId,
      });
      return classification;
    });
  }

  async deactivateClassification(
    principal: AuthenticatedPrincipal,
    type: 'lead-purposes' | 'market-sectors',
    id: string,
    expectedVersion: number,
    reason: string,
    requestId: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const classification = type === 'lead-purposes'
        ? await repository.deactivateLeadPurpose(principal.companyId, id, expectedVersion, new Date())
        : await repository.deactivateMarketSector(principal.companyId, id, expectedVersion, new Date());
      if (!classification) throw new ConflictError('The classification changed or is already inactive. Refresh and try again.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: `crm.${type === 'lead-purposes' ? 'lead_purpose' : 'market_sector'}_deactivated`,
        targetType: type === 'lead-purposes' ? 'lead_purpose' : 'market_sector',
        targetId: id,
        requestId,
        metadata: { reason },
      });
      return classification;
    });
  }

  listCustomers(principal: AuthenticatedPrincipal, input: {
    status?: 'active' | 'inactive'; search?: string; page: number; pageSize: number;
    sort: 'name' | 'status' | 'updatedAt'; direction: 'asc' | 'desc';
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
        customerType: input.customerType,
        gstin: input.gstin,
        pan: input.pan,
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

  checkDuplicateHints(
    principal: AuthenticatedPrincipal,
    input: { name: string; phone?: string; email?: string },
  ) {
    return createCrmRepository(this.database).findDuplicateHints(crmAccess(principal), {
      phoneNormalized: normalizePhone(input.phone),
      emailNormalized: normalizeEmail(input.email),
      name: input.name,
    });
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

  async stageImport(
    principal: AuthenticatedPrincipal,
    type: CrmImportType,
    file: Express.Multer.File,
    requestId: string,
  ) {
    this.assertImportPermission(principal, type);
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      await removePrivateFile(file.filename);
      throw validationError('Upload the .xlsx template without changing its file type.');
    }

    try {
      const parsedRows = await readImportWorkbook(type, resolvePrivateFile(file.filename));
      const repository = createCrmRepository(this.database);
      const access = crmAccess(principal);
      const stagedRows: Array<{
        rowNumber: number;
        payload: Record<string, string | null>;
        issues: ImportIssue[];
        warnings: ImportIssue[];
        status: 'valid' | 'invalid';
      }> = [];

      for (const row of parsedRows) {
        const issues: ImportIssue[] = [];
        const warnings: ImportIssue[] = [];
        if (type === 'customers') {
          const parsed = customerInputSchema.safeParse(customerInputFromImport(row.payload));
          if (!parsed.success) {
            issues.push(...zodIssues(parsed.error));
          } else {
            const primary = normalizedContact(parsed.data.contacts[0]!);
            const duplicates = await repository.findDuplicateHints(access, {
              phoneNormalized: primary.phoneNormalized,
              emailNormalized: primary.emailNormalized,
              name: parsed.data.displayName,
            });
            warnings.push(...duplicates.map((duplicate) => ({
              message: `Possible ${duplicate.type} duplicate: ${duplicate.label} (${duplicate.reason}).`,
            })));
          }
        } else {
          const categoryCode = importValue(row.payload, 'service_category_code')?.toUpperCase();
          const category = categoryCode
            ? await repository.findServiceCategoryByCode(principal.companyId, categoryCode)
            : undefined;
          if (!category) issues.push({ field: 'service_category_code', message: 'Choose an active service category code.' });
          const purposeCode = importValue(row.payload, 'purpose_code')?.toUpperCase();
          const sectorCode = importValue(row.payload, 'sector_code')?.toUpperCase();
          const [purpose, sector] = await Promise.all([
            purposeCode ? repository.findLeadPurposeByCode(principal.companyId, purposeCode) : undefined,
            sectorCode ? repository.findMarketSectorByCode(principal.companyId, sectorCode) : undefined,
          ]);
          if (!purpose) issues.push({ field: 'purpose_code', message: 'Choose an active lead purpose code.' });
          if (!sector) issues.push({ field: 'sector_code', message: 'Choose an active market sector code.' });
          const ownerEmail = normalizeEmail(importValue(row.payload, 'owner_email'));
          const owner = ownerEmail
            ? await repository.findActiveUserByEmail(principal.companyId, ownerEmail)
            : await repository.findActiveUser(principal.companyId, principal.userId);
          if (!owner) issues.push({ field: 'owner_email', message: 'Choose an active CRM employee email.' });
          if (owner && owner.id !== principal.userId && !hasPermission(principal, 'crm.lead.assign')) {
            issues.push({ field: 'owner_email', message: 'You cannot import a lead assigned to another employee.' });
          }
          const parsed = leadInputSchema.safeParse({
            inquiryName: importValue(row.payload, 'inquiry_name') ?? '',
            companyName: importValue(row.payload, 'company_name'),
            contactName: importValue(row.payload, 'contact_name') ?? '',
            phone: importValue(row.payload, 'phone'),
            email: importValue(row.payload, 'email'),
            address: importValue(row.payload, 'address'),
            source: importValue(row.payload, 'source') ?? '',
            serviceCategoryId: category?.id ?? 'invalid',
            purposeId: purpose?.id ?? 'invalid',
            sectorId: sector?.id ?? 'invalid',
            ownerUserId: owner?.id,
          });
          if (!parsed.success) issues.push(...zodIssues(parsed.error));
          if (parsed.success) {
            const duplicates = await repository.findDuplicateHints(access, {
              phoneNormalized: normalizePhone(parsed.data.phone),
              emailNormalized: normalizeEmail(parsed.data.email),
              name: parsed.data.inquiryName,
            });
            warnings.push(...duplicates.map((duplicate) => ({
              message: `Possible ${duplicate.type} duplicate: ${duplicate.label} (${duplicate.reason}).`,
            })));
          }
        }
        stagedRows.push({
          rowNumber: row.rowNumber,
          payload: row.payload,
          issues,
          warnings,
          status: issues.length === 0 ? 'valid' as const : 'invalid' as const,
        });
      }

      const validRows = stagedRows.filter((row) => row.status === 'valid').length;
      const checksumSha256 = await sha256File(resolvePrivateFile(file.filename));
      const originalName = safeOriginalName(file.originalname);
      const batch = await this.database.transaction(async (transaction) => {
        const created = await createCrmRepository(transaction).createImportBatch({
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
        }, stagedRows);
        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'crm.import_staged',
          targetType: 'crm_import_batch',
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
    const repository = createCrmRepository(this.database);
    const batch = await repository.findImportBatch(principal.companyId, batchId);
    if (!batch || (!isAdministrator(principal) && batch.createdByUserId !== principal.userId)) throw new NotFoundError('Import batch not found.');
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
    const existing = await createCrmRepository(this.database).findImportBatch(principal.companyId, batchId);
    if (!existing || (!isAdministrator(principal) && existing.createdByUserId !== principal.userId)) throw new NotFoundError('Import batch not found.');
    this.assertImportPermission(principal, existing.type);
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new ConflictError('This import batch is already closed.');
    }
    const claimed = await createCrmRepository(this.database)
      .claimImportBatch(principal.companyId, batchId, expectedVersion);
    if (!claimed) throw new ConflictError('This import batch changed or is being committed elsewhere. Refresh it.');
    const rows = await createCrmRepository(this.database).listImportRows(principal.companyId, batchId);

    for (const row of rows.filter((item) => item.status === 'valid')) {
      try {
        if (claimed.type === 'customers') {
          await this.commitCustomerImportRow(principal, claimed.id, row.id, row.rowNumber, row.payload, requestId);
        } else {
          await this.commitLeadImportRow(principal, claimed.id, row.id, row.rowNumber, row.payload, requestId);
        }
      } catch (error) {
        const message = error instanceof AppError ? error.message : 'The row could not be committed.';
        await createCrmRepository(this.database)
          .markImportRowFailed(principal.companyId, row.id, message, new Date());
      }
    }

    await this.database.transaction(async (transaction) => {
      const completed = await createCrmRepository(transaction).completeImportBatch(
        principal.companyId, claimed.id, claimed.rowVersion, new Date(),
      );
      if (!completed) throw new ConflictError('The import batch changed before completion. Refresh it.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.import_completed',
        targetType: 'crm_import_batch',
        targetId: claimed.id,
        requestId,
        metadata: { type: claimed.type },
      });
    });
    return this.getImportBatch(principal, batchId);
  }

  private async commitCustomerImportRow(
    principal: AuthenticatedPrincipal,
    batchId: string,
    rowId: string,
    rowNumber: number,
    payload: Record<string, string | null>,
    requestId: string,
  ) {
    const input = customerInputSchema.parse(customerInputFromImport(payload));
    const contacts = input.contacts.map(normalizedContact);
    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const customer = await repository.createCustomer({
        companyId: principal.companyId,
        displayName: input.displayName,
        displayNameNormalized: normalizeName(input.displayName),
        legalName: input.legalName,
        customerType: input.customerType,
        gstin: input.gstin,
        pan: input.pan,
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
      await repository.createSites(input.sites.map((site) => ({
        ...site,
        companyId: principal.companyId,
        customerId: customer!.id,
        createdByUserId: principal.userId,
      })));
      if (!await repository.markImportRowCreated(principal.companyId, rowId, customer!.id, new Date())) {
        throw new ConflictError('This import row was already processed.');
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.customer_imported',
        targetType: 'customer',
        targetId: customer!.id,
        requestId,
        metadata: { batchId, rowNumber },
      });
      return customer!.id;
    });
  }

  private async commitLeadImportRow(
    principal: AuthenticatedPrincipal,
    batchId: string,
    rowId: string,
    rowNumber: number,
    payload: Record<string, string | null>,
    requestId: string,
  ) {
    const lookupRepository = createCrmRepository(this.database);
    const categoryCode = importValue(payload, 'service_category_code')?.toUpperCase() ?? '';
    const category = await lookupRepository.findServiceCategoryByCode(principal.companyId, categoryCode);
    if (!category) throw validationError('The service category is no longer active.');
    const purposeCode = importValue(payload, 'purpose_code')?.toUpperCase() ?? '';
    const sectorCode = importValue(payload, 'sector_code')?.toUpperCase() ?? '';
    const [purpose, sector] = await Promise.all([
      lookupRepository.findLeadPurposeByCode(principal.companyId, purposeCode),
      lookupRepository.findMarketSectorByCode(principal.companyId, sectorCode),
    ]);
    if (!purpose) throw validationError('The lead purpose is no longer active.');
    if (!sector) throw validationError('The market sector is no longer active.');
    const ownerEmail = normalizeEmail(importValue(payload, 'owner_email'));
    const owner = ownerEmail
      ? await lookupRepository.findActiveUserByEmail(principal.companyId, ownerEmail)
      : await lookupRepository.findActiveUser(principal.companyId, principal.userId);
    if (!owner) throw validationError('The lead owner is no longer an active CRM employee.');
    if (owner.id !== principal.userId && !hasPermission(principal, 'crm.lead.assign')) {
      throw new ForbiddenError('You cannot assign this imported lead to another employee.');
    }
    const input = leadInputSchema.parse({
      inquiryName: importValue(payload, 'inquiry_name') ?? '',
      companyName: importValue(payload, 'company_name'),
      contactName: importValue(payload, 'contact_name') ?? '',
      phone: importValue(payload, 'phone'),
      email: importValue(payload, 'email'),
      address: importValue(payload, 'address'),
      source: importValue(payload, 'source') ?? '',
      serviceCategoryId: category.id,
      purposeId: purpose.id,
      sectorId: sector.id,
      ownerUserId: owner.id,
    });
    const phoneNormalized = normalizePhone(input.phone);
    const emailNormalized = normalizeEmail(input.email);

    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const now = new Date();
      const leadNumber = await repository.allocateLeadNumber(principal.companyId, now);
      const lead = await repository.createLead({
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
        serviceCategoryId: category.id,
        purposeId: purpose.id,
        sectorId: sector.id,
        ownerUserId: owner.id,
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
      });
      await repository.addLeadMembers([...new Set([principal.userId, owner.id])].map((userId) => ({
        companyId: principal.companyId,
        leadId: lead!.id,
        userId,
        role: userId === owner.id ? 'owner' : 'collaborator',
      })));
      if (!await repository.markImportRowCreated(principal.companyId, rowId, lead!.id, now)) {
        throw new ConflictError('This import row was already processed.');
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.lead_imported',
        targetType: 'lead',
        targetId: lead!.id,
        requestId,
        metadata: { batchId, rowNumber, leadNumber, ownerUserId: owner.id },
      });
      return lead!.id;
    });
  }

  listLeadFilterOptions(principal: AuthenticatedPrincipal) {
    return createCrmRepository(this.database).listLeadFilterOptions(crmAccess(principal));
  }

  listLeads(principal: AuthenticatedPrincipal, input: {
    stage?: 'new' | 'contacted' | 'qualified' | 'design_authorized' | 'commercial_negotiation' | 'won' | 'lost' | 'on_hold';
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
    page: number;
    pageSize: number;
    sort: 'leadNumber' | 'inquiryName' | 'stage' | 'ownerName' | 'source' | 'createdAt' | 'updatedAt';
    direction: 'asc' | 'desc';
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
    const [category, purpose, sector, owner] = await Promise.all([
      repository.findServiceCategory(principal.companyId, input.serviceCategoryId),
      repository.findLeadPurpose(principal.companyId, input.purposeId),
      repository.findMarketSector(principal.companyId, input.sectorId),
      repository.findActiveUser(principal.companyId, ownerUserId),
    ]);
    if (!category || category.status !== 'active') throw validationError('Choose an active service category.');
    if (!purpose || purpose.status !== 'active') throw validationError('Choose an active lead purpose.');
    if (!sector || sector.status !== 'active') throw validationError('Choose an active market sector.');
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
        purposeId: input.purposeId,
        sectorId: input.sectorId,
        ownerUserId,
        customerId: input.customerId,
        primaryContactId: input.primaryContactId,
        siteId: input.siteId,
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
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
        metadata: { leadNumber, ownerUserId, purposeId: input.purposeId, sectorId: input.sectorId },
      });
      return lead!.id;
    });
    return { lead: await this.getLead(principal, leadId), duplicateHints };
  }

  async bulkAssignLeads(
    principal: AuthenticatedPrincipal,
    input: BulkLeadAssignmentInput,
    requestId: string,
  ) {
    if (!hasPermission(principal, 'crm.lead.assign')) {
      throw new ForbiddenError('You cannot assign leads.');
    }
    const assignee = await createCrmRepository(this.database)
      .findActiveUser(principal.companyId, input.assigneeUserId);
    if (!assignee) throw validationError('Choose an active CRM employee as lead owner.');

    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const access = crmAccess(principal);
      const currentLeads = [];
      for (const target of input.targets) {
        const lead = await repository.findLead(access, target.id);
        if (!lead) throw new NotFoundError('One or more selected leads are no longer available.');
        if (lead.rowVersion !== target.expectedVersion) {
          throw new ConflictError(`Lead ${lead.leadNumber} changed. Refresh the list and review the selection.`);
        }
        currentLeads.push(lead);
      }

      let updated = 0;
      for (const lead of currentLeads) {
        if (lead.ownerUserId === input.assigneeUserId) continue;
        const changed = await repository.changeLeadOwner(
          principal.companyId,
          lead.id,
          lead.rowVersion,
          input.assigneeUserId,
          new Date(),
          principal.userId,
        );
        if (!changed) throw new ConflictError(`Lead ${lead.leadNumber} changed during assignment.`);
        await repository.replaceLeadOwnerMember(principal.companyId, lead.id, input.assigneeUserId);
        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'crm.lead_assigned',
          targetType: 'lead',
          targetId: lead.id,
          requestId,
          metadata: { fromUserId: lead.ownerUserId, toUserId: input.assigneeUserId, bulk: true },
        });
        updated += 1;
      }
      return { selected: input.targets.length, updated, unchanged: input.targets.length - updated };
    });
  }

  async changeLeadStage(
    principal: AuthenticatedPrincipal,
    leadId: string,
    input: { expectedVersion: number; stage: 'contacted' | 'on_hold' | 'lost' | 'resume'; reason?: string },
    requestId: string,
  ) {
    const current = await this.getLead(principal, leadId);
    const allowedFrom: Record<typeof input.stage, Array<typeof current.stage>> = {
      contacted: ['new', 'on_hold'],
      on_hold: ['new', 'contacted', 'qualified', 'design_authorized', 'commercial_negotiation'],
      lost: ['new', 'contacted', 'qualified', 'design_authorized', 'commercial_negotiation', 'on_hold'],
      resume: ['on_hold'],
    };
    if (!allowedFrom[input.stage].includes(current.stage)) {
      throw new ConflictError(`A ${current.stage} lead cannot move to ${input.stage}.`);
    }
    if (
      input.stage === 'contacted' &&
      current.stage === 'on_hold' &&
      current.previousStage &&
      !['new', 'contacted'].includes(current.previousStage)
    ) {
      throw new ConflictError('Use Resume to restore this opportunity-stage lead from hold.');
    }

    const targetStage = input.stage === 'resume'
      ? (current.previousStage ?? 'contacted')
      : input.stage;
    const nextPreviousStage = input.stage === 'on_hold' ? current.stage : null;

    return this.database.transaction(async (transaction) => {
      const repo = createCrmRepository(transaction);
      const now = new Date();
      const lead = await repo.changeLeadStage(
        principal.companyId,
        leadId,
        input.expectedVersion,
        allowedFrom[input.stage],
        targetStage,
        targetStage === 'lost' ? input.reason! : null,
        now,
        nextPreviousStage,
        principal.userId,
      );
      if (!lead) throw new ConflictError('The lead changed before this action. Refresh and review it.');

      const opportunity = await repo.findOpportunityByLead(principal.companyId, leadId);
      const designJob = await repo.findDesignJobByLead(principal.companyId, leadId);
      const notify = createNotificationRepository(transaction);
      const designRecipients = designJob
        ? [...new Set([designJob.designerUserId, designJob.designHeadUserId].filter(
            (id): id is string => Boolean(id) && id !== principal.userId,
          ))]
        : [];

      if (targetStage === 'lost') {
        if (opportunity && opportunity.commercialState !== 'awarded' && opportunity.commercialState !== 'lost') {
          await repo.updateOpportunityStateOnLeadChange(principal.companyId, opportunity.id, 'lost', null, now);
        }
        if (designJob && !['cancelled', 'abandoned'].includes(designJob.status)) {
          await repo.cancelDesignJob(principal.companyId, designJob.id, input.reason!, now, principal.userId);
          await repo.cancelPendingDesignDeadlines(principal.companyId, designJob.id, now);
          if (designRecipients.length > 0) {
            await notify.createMany(designRecipients.map((recipientUserId) => ({
              companyId: principal.companyId,
              recipientUserId,
              type: 'engineering.design_cancelled',
              severity: 'warning' as const,
              title: 'Design job cancelled (lead lost)',
              message: `${designJob.title} was cancelled because lead ${lead.leadNumber} was marked lost: ${input.reason}`,
              link: `/engineering/design-jobs/${designJob.id}`,
              targetType: 'design_job',
              targetId: designJob.id,
              dedupKey: `design-cancelled:${designJob.id}:${lead.rowVersion}`,
            })));
          }
        }
      } else if (targetStage === 'on_hold') {
        if (opportunity && !['awarded', 'lost', 'on_hold'].includes(opportunity.commercialState)) {
          await repo.updateOpportunityStateOnLeadChange(
            principal.companyId,
            opportunity.id,
            'on_hold',
            opportunity.commercialState,
            now,
          );
        }
        if (designJob && !['paused', 'cancelled', 'abandoned'].includes(designJob.status)) {
          await repo.pauseDesignJob(principal.companyId, designJob.id, designJob.status, now, principal.userId);
          await repo.cancelPendingDesignDeadlines(principal.companyId, designJob.id, now);
          if (designRecipients.length > 0) {
            await notify.createMany(designRecipients.map((recipientUserId) => ({
              companyId: principal.companyId,
              recipientUserId,
              type: 'engineering.design_paused',
              severity: 'warning' as const,
              title: 'Design job paused (lead on hold)',
              message: `${designJob.title} is paused while lead ${lead.leadNumber} is on hold.`,
              link: `/engineering/design-jobs/${designJob.id}`,
              targetType: 'design_job',
              targetId: designJob.id,
              dedupKey: `design-paused:${designJob.id}:${lead.rowVersion}`,
            })));
          }
        }
      } else if (input.stage === 'resume') {
        if (opportunity && opportunity.commercialState === 'on_hold') {
          await repo.updateOpportunityStateOnLeadChange(
            principal.companyId,
            opportunity.id,
            opportunity.previousCommercialState ?? 'unawarded',
            null,
            now,
          );
        }
        if (designJob && designJob.status === 'paused') {
          const restoredStatus = designJob.previousStatus ?? 'authorized';
          await repo.resumeDesignJob(principal.companyId, designJob.id, restoredStatus, now, principal.userId);
          if (!designJob.designerCompletedAt && designJob.designDueAt) {
            await repo.enqueueResumedDesignDeadline(principal.companyId, designJob.id, designJob.designDueAt, now);
          }
          if (designRecipients.length > 0) {
            await notify.createMany(designRecipients.map((recipientUserId) => ({
              companyId: principal.companyId,
              recipientUserId,
              type: 'engineering.design_resumed',
              severity: 'info' as const,
              title: 'Design job resumed',
              message: `${designJob.title} resumed after lead ${lead.leadNumber} came off hold.`,
              link: `/engineering/design-jobs/${designJob.id}`,
              targetType: 'design_job',
              targetId: designJob.id,
              dedupKey: `design-resumed:${designJob.id}:${lead.rowVersion}`,
            })));
          }
        }
      }

      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.lead_stage_changed',
        targetType: 'lead',
        targetId: leadId,
        requestId,
        metadata: { from: current.stage, to: targetStage, reason: input.reason ?? null },
      });
      return lead;
    });
  }

  async qualifyLead(
    principal: AuthenticatedPrincipal,
    leadId: string,
    input: QualifyLeadInput,
    requestId: string,
    files: Express.Multer.File[] = [],
  ) {
    try {
      const access = crmAccess(principal);
      const repository = createCrmRepository(this.database);
      const lead = await repository.findLead(access, leadId);
      if (!lead) throw new NotFoundError('Lead not found.');
      if (lead.stage === 'qualified') {
        const existing = await repository.findOpportunityByLead(principal.companyId, leadId);
        if (
          existing &&
          input.customerId &&
          existing.customerId === input.customerId &&
          existing.primaryContactId === input.primaryContactId &&
          existing.siteId === (input.siteId ?? null) &&
          existing.title === input.title
        ) {
          await Promise.all(files.map((file) => removePrivateFile(file.filename)));
          const existingAttachments = await repository.listOpportunityAttachments(principal.companyId, existing.id);
          return { opportunity: existing, attachments: existingAttachments, replayed: true };
        }
        throw new ConflictError('This lead has already been qualified with a different opportunity context.');
      }

      if (input.customerId) {
        const customer = await repository.findCustomer(access, input.customerId);
        if (!customer || customer.status !== 'active') throw new NotFoundError('Active customer not found.');
        if (!await repository.findContact(principal.companyId, input.customerId, input.primaryContactId!)) {
          throw validationError('The selected contact does not belong to the customer.');
        }
        if (input.siteId && !await repository.findSite(principal.companyId, input.customerId, input.siteId)) {
          throw validationError('The selected site does not belong to the customer.');
        }
      }

      const preparedFiles = await Promise.all(files.map(async (file) => {
        const originalName = safeOriginalName(file.originalname);
        if (!originalName) throw validationError('Every uploaded file must have a valid file name.');
        const checksumSha256 = await sha256File(file.path);
        return {
          originalName,
          storageName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
        };
      }));

      return await this.database.transaction(async (transaction) => {
        const transactionalRepository = createCrmRepository(transaction);
        const now = new Date();
        let resolvedCustomerId = input.customerId;
        let resolvedContactId = input.primaryContactId;
        let resolvedSiteId = input.siteId;

        if (input.newCustomer) {
          const contact = normalizedContact({ ...input.newCustomer.contact, isPrimary: true });
          const createdCustomer = await transactionalRepository.createCustomer({
            companyId: principal.companyId,
            displayName: input.newCustomer.displayName,
            displayNameNormalized: normalizeName(input.newCustomer.displayName),
            legalName: input.newCustomer.legalName,
            customerType: input.newCustomer.customerType,
            gstin: input.newCustomer.gstin,
            pan: input.newCustomer.pan,
            createdByUserId: principal.userId,
          });
          await transactionalRepository.addCustomerMember(principal.companyId, createdCustomer!.id, principal.userId, 'owner');
          const [createdContact] = await transactionalRepository.createContacts([{
            companyId: principal.companyId,
            customerId: createdCustomer!.id,
            name: contact.name,
            jobTitle: contact.jobTitle,
            phone: contact.phone,
            phoneNormalized: contact.phoneNormalized,
            email: contact.email,
            emailNormalized: contact.emailNormalized,
            isPrimary: true,
            createdByUserId: principal.userId,
          }]);
          if (input.newCustomer.site) {
            const [createdSite] = await transactionalRepository.createSites([{
              ...input.newCustomer.site,
              companyId: principal.companyId,
              customerId: createdCustomer!.id,
              createdByUserId: principal.userId,
            }]);
            resolvedSiteId = createdSite!.id;
          }
          resolvedCustomerId = createdCustomer!.id;
          resolvedContactId = createdContact!.id;

          await createAuthRepository(transaction).appendAuditEvent({
            companyId: principal.companyId,
            actorUserId: principal.userId,
            action: 'crm.customer_created',
            targetType: 'customer',
            targetId: resolvedCustomerId,
            requestId,
            metadata: { fromLeadId: leadId, siteId: resolvedSiteId ?? null },
          });
        }

        const updatedLead = await transactionalRepository.qualifyLead({
          companyId: principal.companyId,
          leadId,
          expectedVersion: input.expectedVersion,
          customerId: resolvedCustomerId!,
          primaryContactId: resolvedContactId!,
          siteId: resolvedSiteId,
          qualificationNotes: input.qualificationNotes,
          updatedByUserId: principal.userId,
          now,
        });
        if (!updatedLead) throw new ConflictError('The lead changed or is no longer eligible for qualification.');
        const opportunity = await transactionalRepository.createOpportunity({
          companyId: principal.companyId,
          leadId,
          customerId: resolvedCustomerId!,
          primaryContactId: resolvedContactId!,
          siteId: resolvedSiteId,
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
          resolvedCustomerId!,
          member.userId,
          member.role === 'owner' ? 'owner' : 'viewer',
        )));

        const insertedAttachments = preparedFiles.length > 0
          ? await transactionalRepository.createOpportunityAttachments(preparedFiles.map((file) => ({
            companyId: principal.companyId,
            opportunityId: opportunity!.id,
            originalName: file.originalName,
            storageName: file.storageName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            checksumSha256: file.checksumSha256,
            uploadedByUserId: principal.userId,
          })))
          : [];

        if (insertedAttachments.length > 0) {
          await Promise.all(insertedAttachments.map((att) => createAuthRepository(transaction).appendAuditEvent({
            companyId: principal.companyId,
            actorUserId: principal.userId,
            action: 'crm.opportunity_attachment_uploaded',
            targetType: 'opportunity_attachment',
            targetId: att.id,
            requestId,
            metadata: {
              opportunityId: opportunity!.id,
              mimeType: att.mimeType,
              sizeBytes: att.sizeBytes,
              checksumSha256: att.checksumSha256,
            },
          })));
        }

        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'crm.lead_qualified',
          targetType: 'opportunity',
          targetId: opportunity!.id,
          requestId,
          metadata: {
            leadId,
            customerId: resolvedCustomerId!,
            siteId: resolvedSiteId ?? null,
            attachmentCount: insertedAttachments.length,
          },
        });
        const attachments = await transactionalRepository.listOpportunityAttachments(principal.companyId, opportunity!.id);
        return { opportunity: opportunity!, attachments, replayed: false };
      });
    } catch (error) {
      await Promise.all(files.map((file) => removePrivateFile(file.filename)));
      throw error;
    }
  }

  listDesignAssignees(principal: AuthenticatedPrincipal, role: 'designer' | 'design_head') {
    const permission = role === 'designer' ? 'engineering.design.write' : 'engineering.design.review';
    return createCrmRepository(this.database).listEligibleUsers(principal.companyId, permission);
  }

  async authorizeDesign(
    principal: AuthenticatedPrincipal,
    leadId: string,
    input: AuthorizeDesignInput,
    requestId: string,
  ) {
    const access = crmAccess(principal);
    const repository = createCrmRepository(this.database);
    const lead = await repository.findLead(access, leadId);
    if (!lead) throw new NotFoundError('Lead not found.');

    const existing = await repository.findDesignJobByLead(principal.companyId, leadId);
    if (existing) {
      if (
        lead.stage === 'design_authorized' && existing.title === input.title &&
        existing.designHeadUserId === input.designHeadUserId &&
        existing.surveyRequested === input.surveyRequested && existing.authorizationNotes === input.authorizationNotes
      ) return { designJob: existing, replayed: true };
      throw new ConflictError('This lead already has a different free-design authorization.');
    }
    if (lead.stage !== 'qualified') {
      throw new ConflictError('Only a qualified lead can authorize free design.');
    }
    const opportunity = await repository.findOpportunityByLead(principal.companyId, leadId);
    if (!opportunity) throw new ConflictError('The qualified lead is missing its opportunity.');

    const designHead = await repository.findEligibleUser(principal.companyId, input.designHeadUserId, 'engineering.design.review');
    if (!designHead) throw validationError('Choose an active employee eligible for design review.', { field: 'designHeadUserId' });

    return this.database.transaction(async (transaction) => {
      const transactionalRepository = createCrmRepository(transaction);
      const now = new Date();
      const updatedLead = await transactionalRepository.authorizeLeadForDesign(
        principal.companyId, leadId, input.expectedVersion, now, principal.userId,
      );
      if (!updatedLead) throw new ConflictError('The lead changed or is no longer eligible for design authorization.');
      const designJob = await transactionalRepository.createDesignJob({
        companyId: principal.companyId,
        leadId,
        opportunityId: opportunity.id,
        title: input.title,
        designerUserId: null,
        designHeadUserId: input.designHeadUserId,
        status: 'awaiting_designer',
        surveyRequested: input.surveyRequested,
        authorizationNotes: input.authorizationNotes,
        authorizedByUserId: principal.userId,
        updatedByUserId: principal.userId,
        authorizedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.lead_design_authorized',
        targetType: 'design_job',
        targetId: designJob!.id,
        requestId,
        metadata: {
          leadId,
          opportunityId: opportunity.id,
          designHeadUserId: input.designHeadUserId,
          surveyRequested: input.surveyRequested,
          commercialState: opportunity.commercialState,
        },
      });
      return { designJob: designJob!, replayed: false };
    });
  }

  async listActivities(principal: AuthenticatedPrincipal, leadId: string) {
    await this.getLead(principal, leadId);
    return createCrmRepository(this.database).listActivities(principal.companyId, leadId);
  }

  async createActivity(principal: AuthenticatedPrincipal, leadId: string, input: ActivityInput, requestId: string) {
    await this.getLead(principal, leadId);
    const activityId = await this.database.transaction(async (transaction) => {
      const activity = await createCrmRepository(transaction).createActivity({
        companyId: principal.companyId,
        leadId,
        type: input.type,
        summary: input.summary,
        occurredAt: input.occurredAt,
        createdByUserId: principal.userId,
      });
      await createCrmRepository(transaction).touchLeadUpdatedBy?.(
        principal.companyId, leadId, principal.userId, new Date(),
      );
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.activity_created',
        targetType: 'crm_activity',
        targetId: activity!.id,
        requestId,
        metadata: { leadId, type: input.type },
      });
      return activity!.id;
    });
    return (await this.listActivities(principal, leadId)).find((item) => item.id === activityId)!;
  }

  async listLeadReminders(principal: AuthenticatedPrincipal, leadId: string) {
    await this.getLead(principal, leadId);
    return createCrmRepository(this.database).listLeadReminders(principal.companyId, leadId);
  }

  async createReminder(principal: AuthenticatedPrincipal, leadId: string, input: ReminderInput, requestId: string) {
    await this.getLead(principal, leadId);
    const assigneeUserId = input.assigneeUserId ?? principal.userId;
    if (assigneeUserId !== principal.userId && !hasPermission(principal, 'crm.lead.assign')) {
      throw new ForbiddenError('You cannot assign this reminder to another employee.');
    }
    const assignee = await createCrmRepository(this.database).findActiveUser(principal.companyId, assigneeUserId);
    if (!assignee) throw validationError('Choose an active CRM employee as reminder assignee.');

    const occurrenceId = await this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const rule = await repository.createReminderRule({
        companyId: principal.companyId,
        leadId,
        assigneeUserId,
        title: input.title,
        timezone: input.timezone,
        recurrence: input.recurrence,
        createdByUserId: principal.userId,
      });
      const occurrence = await repository.createReminderOccurrence({
        companyId: principal.companyId,
        ruleId: rule!.id,
        leadId,
        assigneeUserId,
        dueAt: input.dueAt,
      });
      await repository.enqueueReminderOccurrence(principal.companyId, occurrence!.id, input.dueAt);
      await repository.touchLeadUpdatedBy?.(principal.companyId, leadId, principal.userId, new Date());
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.reminder_created',
        targetType: 'reminder_rule',
        targetId: rule!.id,
        requestId,
        metadata: { leadId, occurrenceId: occurrence!.id, assigneeUserId, recurrence: input.recurrence },
      });
      return occurrence!.id;
    });
    return (await this.listLeadReminders(principal, leadId)).find((item) => item.id === occurrenceId)!;
  }

  async bulkCreateReminders(
    principal: AuthenticatedPrincipal,
    input: BulkReminderInput,
    requestId: string,
  ) {
    const assigneeUserId = input.assigneeUserId ?? principal.userId;
    if (assigneeUserId !== principal.userId && !hasPermission(principal, 'crm.lead.assign')) {
      throw new ForbiddenError('You cannot assign reminders to another employee.');
    }
    const assignee = await createCrmRepository(this.database)
      .findActiveUser(principal.companyId, assigneeUserId);
    if (!assignee) throw validationError('Choose an active CRM employee as reminder assignee.');

    return this.database.transaction(async (transaction) => {
      const repository = createCrmRepository(transaction);
      const access = crmAccess(principal);
      const selectedLeads = [];
      for (const target of input.targets) {
        const lead = await repository.findLead(access, target.id);
        if (!lead) throw new NotFoundError('One or more selected leads are no longer available.');
        if (lead.rowVersion !== target.expectedVersion) {
          throw new ConflictError(`Lead ${lead.leadNumber} changed. Refresh the list and review the selection.`);
        }
        selectedLeads.push(lead);
      }

      for (const lead of selectedLeads) {
        const rule = await repository.createReminderRule({
          companyId: principal.companyId,
          leadId: lead.id,
          assigneeUserId,
          title: input.title,
          timezone: input.timezone,
          recurrence: input.recurrence,
          createdByUserId: principal.userId,
        });
        const occurrence = await repository.createReminderOccurrence({
          companyId: principal.companyId,
          ruleId: rule!.id,
          leadId: lead.id,
          assigneeUserId,
          dueAt: input.dueAt,
        });
        await repository.enqueueReminderOccurrence(principal.companyId, occurrence!.id, input.dueAt);
        await repository.touchLeadUpdatedBy?.(principal.companyId, lead.id, principal.userId, new Date());
        await createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'crm.reminder_created',
          targetType: 'reminder_rule',
          targetId: rule!.id,
          requestId,
          metadata: {
            leadId: lead.id,
            occurrenceId: occurrence!.id,
            assigneeUserId,
            recurrence: input.recurrence,
            bulk: true,
          },
        });
      }
      return { created: selectedLeads.length };
    });
  }

  listMyReminders(principal: AuthenticatedPrincipal, input: {
    status?: 'pending' | 'completed' | 'cancelled'; search?: string; page: number; pageSize: number;
    sort: 'dueAt' | 'title' | 'status'; direction: 'asc' | 'desc';
  }) {
    return createCrmRepository(this.database).listMyReminders(principal.companyId, principal.userId, {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }).then((result) => ({ ...result, page: input.page, pageSize: input.pageSize }));
  }

  async completeReminder(principal: AuthenticatedPrincipal, occurrenceId: string, expectedVersion: number, requestId: string) {
    return this.database.transaction(async (transaction) => {
      const occurrence = await createCrmRepository(transaction).completeReminder(
        principal.companyId, principal.userId, occurrenceId, expectedVersion, new Date(),
      );
      if (!occurrence) throw new ConflictError('This reminder changed, is no longer pending, or is not assigned to you.');
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: 'crm.reminder_completed',
        targetType: 'reminder_occurrence',
        targetId: occurrenceId,
        requestId,
      });
      return occurrence;
    });
  }

  async listAttachments(principal: AuthenticatedPrincipal, leadId: string) {
    await this.getLead(principal, leadId);
    return createCrmRepository(this.database).listAttachments(principal.companyId, leadId);
  }

  async getAttachment(principal: AuthenticatedPrincipal, leadId: string, attachmentId: string) {
    await this.getLead(principal, leadId);
    const attachment = await createCrmRepository(this.database).findAttachment(
      principal.companyId, leadId, attachmentId,
    );
    if (!attachment) throw new NotFoundError('Attachment not found.');
    return attachment;
  }

  private async assertOpportunityAttachmentReadAccess(principal: AuthenticatedPrincipal, opportunityId: string) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    const repository = createCrmRepository(this.database);
    const opportunity = await repository.findOpportunity(principal.companyId, opportunityId);
    if (!opportunity) throw new NotFoundError('Opportunity not found.');
    if (isAdministrator(principal)) return opportunity;

    if (hasPermission(principal, 'crm.opportunity.read')) {
      const scoped = await repository.findOpportunityWithAccess(crmAccess(principal), opportunityId);
      if (scoped) return scoped;
    }

    const canDesignRead =
      hasPermission(principal, 'engineering.design.read') ||
      hasPermission(principal, 'engineering.design.write') ||
      hasPermission(principal, 'engineering.design.review');
    if (canDesignRead) {
      const designJob = await repository.findDesignJobByOpportunity(principal.companyId, opportunityId);
      if (
        designJob &&
        (designJob.designHeadUserId === principal.userId || designJob.designerUserId === principal.userId)
      ) {
        return opportunity;
      }
    }

    throw new ForbiddenError('You do not have access to this opportunity’s documents.');
  }

  private async assertOpportunityAttachmentWriteAccess(principal: AuthenticatedPrincipal, opportunityId: string) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    const repository = createCrmRepository(this.database);
    const opportunity = await repository.findOpportunity(principal.companyId, opportunityId);
    if (!opportunity) throw new NotFoundError('Opportunity not found.');
    if (isAdministrator(principal)) return opportunity;
    if (!hasPermission(principal, 'crm.lead.write') && !hasPermission(principal, 'crm.lead.qualify')) {
      throw new ForbiddenError('You cannot upload opportunity documents.');
    }
    const scoped = await repository.findOpportunityWithAccess(crmAccess(principal), opportunityId);
    if (!scoped) throw new ForbiddenError('You do not have access to upload documents to this opportunity.');
    return scoped;
  }

  async listOpportunityAttachments(principal: AuthenticatedPrincipal, opportunityId: string) {
    await this.assertOpportunityAttachmentReadAccess(principal, opportunityId);
    return createCrmRepository(this.database).listOpportunityAttachments(principal.companyId, opportunityId);
  }

  async createOpportunityAttachments(
    principal: AuthenticatedPrincipal,
    opportunityId: string,
    files: Express.Multer.File[],
    requestId: string,
  ) {
    try {
      await this.assertOpportunityAttachmentWriteAccess(principal, opportunityId);
      if (files.length === 0) throw validationError('Choose at least one file to upload.');

      const prepared = await Promise.all(files.map(async (file) => {
        const originalName = safeOriginalName(file.originalname);
        if (!originalName) throw validationError('Every uploaded file must have a valid file name.');
        const checksumSha256 = await sha256File(file.path);
        return {
          originalName,
          storageName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
        };
      }));

      const insertedIds = await this.database.transaction(async (transaction) => {
        const repository = createCrmRepository(transaction);
        const opp = await repository.findOpportunity(principal.companyId, opportunityId);
        const created = await repository.createOpportunityAttachments(prepared.map((file) => ({
          companyId: principal.companyId,
          opportunityId,
          originalName: file.originalName,
          storageName: file.storageName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          checksumSha256: file.checksumSha256,
          uploadedByUserId: principal.userId,
        })));
        if (opp) {
          await repository.touchLeadUpdatedBy?.(principal.companyId, opp.leadId, principal.userId, new Date());
        }
        await Promise.all(created.map((att) => createAuthRepository(transaction).appendAuditEvent({
          companyId: principal.companyId,
          actorUserId: principal.userId,
          action: 'crm.opportunity_attachment_uploaded',
          targetType: 'opportunity_attachment',
          targetId: att.id,
          requestId,
          metadata: {
            opportunityId,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
            checksumSha256: att.checksumSha256,
          },
        })));
        return created.map((att) => att.id);
      });
      const all = await createCrmRepository(this.database).listOpportunityAttachments(principal.companyId, opportunityId);
      return all.filter((item) => insertedIds.includes(item.id));
    } catch (error) {
      await Promise.all(files.map((file) => removePrivateFile(file.filename)));
      throw error;
    }
  }

  async getOpportunityAttachment(principal: AuthenticatedPrincipal, opportunityId: string, attachmentId: string) {
    await this.assertOpportunityAttachmentReadAccess(principal, opportunityId);
    const attachment = await createCrmRepository(this.database).findOpportunityAttachment(
      principal.companyId, opportunityId, attachmentId,
    );
    if (!attachment) throw new NotFoundError('Attachment not found.');
    return attachment;
  }

  listOpportunities(principal: AuthenticatedPrincipal, input: {
    state?: 'unawarded' | 'quoted' | 'awarded' | 'lost' | 'on_hold';
    search?: string; page: number; pageSize: number;
    sort: 'title' | 'customerName' | 'state' | 'updatedAt'; direction: 'asc' | 'desc';
  }) {
    return createCrmRepository(this.database).listOpportunities(crmAccess(principal), {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }).then((result) => ({ ...result, page: input.page, pageSize: input.pageSize }));
  }

  async getOpportunityDetail(principal: AuthenticatedPrincipal, opportunityId: string) {
    if (principal.mustChangePassword) throw new ForbiddenError('Change the temporary password before using this feature.');
    const item = await createCrmRepository(this.database).findOpportunityDetail(crmAccess(principal), opportunityId);
    if (!item) throw new NotFoundError('Opportunity not found.');
    return item;
  }
}

export const crmService = new CrmService();
