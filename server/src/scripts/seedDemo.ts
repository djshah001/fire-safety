import { quotationDefaults } from '../modules/engineering/quotation.defaults.js';
import { Decimal } from 'decimal.js';
import { calculateQuotedLine } from '../modules/engineering/boq.calculation.js';
import { referenceProducts, seedReferenceCatalogue } from './demoCatalogue.js';
import type { CommercialDocumentDetails } from '../core/documents/commercialDocument.js';
import { finishDemoQuotations, type DemoQuotationCheckpoint } from './demoQuotationCheckpoints.js';
import { closePdfBrowser } from '../infrastructure/documents/pdfBrowser.js';
import type { PoolClient } from "pg";
import { z } from "zod";
import { env } from "../config/env.js";
import { hashPassword } from "../core/security/password.js";
import { closeDatabase, pool } from "../infrastructure/database/db.js";

const demoPassword = process.env.DEMO_SEED_PASSWORD ?? "FireSafetyDemo123!";
z.string().min(12).max(200).parse(demoPassword);

const databaseUrl = new URL(env.DATABASE_URL);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
if (env.NODE_ENV === "production" || !loopbackHosts.has(databaseUrl.hostname)) {
  throw new Error(
    "Demo seed refused: DATABASE_URL must target a loopback host outside production.",
  );
}

type IdRow = { id: string };

async function one<T>(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
) {
  const result = await client.query<T & Record<string, unknown>>(query, values);
  const row = result.rows[0];
  if (!row) throw new Error("Demo seed could not resolve a required record.");
  return row as T;
}

async function seedUser(
  client: PoolClient,
  companyId: string,
  passwordHash: string,
  input: { employeeCode: string; name: string; email: string; roles: string[] },
) {
  const email = input.email.toLowerCase();
  const user = await one<IdRow>(
    client,
    `
    insert into users (
      company_id, employee_code, name, email, email_normalized, password_hash,
      status, must_change_password, disabled_at, disabled_reason
    ) values ($1, $2, $3, $4, $4, $5, 'active', false, null, null)
    on conflict (company_id, email_normalized) do update
      set employee_code = excluded.employee_code,
          name = excluded.name,
          password_hash = excluded.password_hash,
          status = 'active',
          must_change_password = false,
          disabled_at = null,
          disabled_reason = null,
          access_version = users.access_version + 1,
          row_version = users.row_version + 1,
          updated_at = now()
    returning id
  `,
    [companyId, input.employeeCode, input.name, email, passwordHash],
  );
  await client.query("delete from auth_sessions where user_id = $1", [user.id]);
  for (const roleCode of input.roles) {
    const role = await one<IdRow>(
      client,
      `
      select id from roles where company_id = $1 and code = $2 and is_active = true
    `,
      [companyId, roleCode],
    );
    await client.query(
      `
      insert into user_role_assignments (company_id, user_id, role_id)
      values ($1, $2, $3)
      on conflict do nothing
    `,
      [companyId, user.id, role.id],
    );
  }
  return user.id;
}

async function seedServiceCategory(
  client: PoolClient,
  companyId: string,
  actorId: string,
  code: string,
  name: string,
) {
  return one<IdRow>(
    client,
    `
    insert into service_categories (company_id, code, name, name_normalized, created_by_user_id)
    values ($1, $2, $3::text, lower($3::text), $4)
    on conflict (company_id, code) do update
      set name = excluded.name, name_normalized = excluded.name_normalized,
          status = 'active', row_version = service_categories.row_version + 1, updated_at = now()
    returning id
  `,
    [companyId, code, name, actorId],
  );
}

async function seedLeadClassification(
  client: PoolClient,
  table: "lead_purposes" | "market_sectors",
  companyId: string,
  actorId: string,
  code: string,
  name: string,
) {
  return one<IdRow>(
    client,
    `
    insert into ${table} (company_id, code, name, name_normalized, created_by_user_id)
    values ($1, $2, $3::text, lower($3::text), $4)
    on conflict (company_id, code) do update
      set name = excluded.name, name_normalized = excluded.name_normalized,
          status = 'active', row_version = ${table}.row_version + 1, updated_at = now()
    returning id
  `,
    [companyId, code, name, actorId],
  );
}

async function seedCustomer(
  client: PoolClient,
  companyId: string,
  actorId: string,
  input: {
    name: string;
    legalName: string;
    gstin: string;
    pan: string;
    contact: string;
    email: string;
    phone: string;
    city: string;
  },
) {
  const normalizedName = input.name.trim().toLowerCase();
  await client.query(
    `
    insert into customers (
      company_id, display_name, display_name_normalized, legal_name, customer_type, gstin, pan, created_by_user_id
    )
    select $1, $2, $3::text, $4, 'business', $5, $6, $7
    where not exists (
      select 1 from customers where company_id = $1 and display_name_normalized = $3::text
    )
  `,
    [
      companyId,
      input.name,
      normalizedName,
      input.legalName,
      input.gstin,
      input.pan,
      actorId,
    ],
  );
  const customer = await one<IdRow>(
    client,
    `
    select id from customers where company_id = $1 and display_name_normalized = $2 order by created_at limit 1
  `,
    [companyId, normalizedName],
  );
  await client.query(
    `update customers set customer_type = 'business', gstin = $2, pan = $3, updated_at = now() where id = $1`,
    [customer.id, input.gstin, input.pan],
  );
  const normalizedEmail = input.email.toLowerCase();
  await client.query(
    `
    insert into customer_contacts (
      company_id, customer_id, name, job_title, phone, phone_normalized,
      email, email_normalized, is_primary, created_by_user_id
    )
    select $1, $2, $3, 'Facilities manager', $4::text, regexp_replace($4::text, '[^0-9+]', '', 'g'),
      $5, $6::text, true, $7
    where not exists (
      select 1 from customer_contacts where customer_id = $2 and email_normalized = $6::text
    )
  `,
    [
      companyId,
      customer.id,
      input.contact,
      input.phone,
      input.email,
      normalizedEmail,
      actorId,
    ],
  );
  const contact = await one<IdRow>(
    client,
    `
    select id from customer_contacts where customer_id = $1 and email_normalized = $2 order by created_at limit 1
  `,
    [customer.id, normalizedEmail],
  );
  await client.query(
    `
    insert into customer_addresses (
      company_id, customer_id, label, address_line_1, city, state, postal_code, country, created_by_user_id
    )
    select $1, $2, 'Registered office', 'Demo industrial address', $3, 'Gujarat', '380001', 'India', $4
    where not exists (
      select 1 from customer_addresses where customer_id = $2 and label = 'Registered office'
    )
  `,
    [companyId, customer.id, input.city, actorId],
  );
  await client.query(
    `
    insert into sites (
      company_id, customer_id, name, address_line_1, city, state, postal_code, country, created_by_user_id
    )
    select $1, $2, 'Demo project site', 'Demo project site address', $3, 'Gujarat', '380015', 'India', $4
    where not exists (
      select 1 from sites where customer_id = $2 and name = 'Demo project site'
    )
  `,
    [companyId, customer.id, input.city, actorId],
  );
  const site = await one<IdRow>(
    client,
    `
    select id from sites where customer_id = $1 and name = 'Demo project site' order by created_at limit 1
  `,
    [customer.id],
  );
  return { customerId: customer.id, contactId: contact.id, siteId: site.id };
}

async function seedLead(
  client: PoolClient,
  companyId: string,
  actorId: string,
  input: {
    leadNumber: string;
    inquiryName: string;
    companyName: string;
    email: string;
    stage: "new" | "contacted" | "qualified" | "design_authorized" | "lost";
    lostReason?: string;
    qualificationNotes?: string;
    serviceCategoryId: string;
    purposeCode?: string;
    sectorCode?: string;
    ownerUserId: string;
    customerId?: string;
    contactId?: string;
    siteId?: string;
  },
) {
  const purpose = await one<IdRow>(client,
    `select id from lead_purposes where company_id = $1 and code = $2 and status = 'active'`,
    [companyId, input.purposeCode ?? "NEW_PROJECT"],
  );
  const sector = await one<IdRow>(client,
    `select id from market_sectors where company_id = $1 and code = $2 and status = 'active'`,
    [companyId, input.sectorCode ?? "INDUSTRIAL"],
  );
  await client.query(
    `
    insert into leads (
      company_id, lead_number, inquiry_name, company_name, contact_name,
      phone, phone_normalized, email, email_normalized, address, source,
      service_category_id, purpose_id, sector_id, owner_user_id, customer_id, primary_contact_id, site_id,
      stage, lost_reason, qualification_notes, created_by_user_id
    ) values (
      $1, $2, $3, $4, 'Demo contact', '+91 90000 00000', '+919000000000', $5::text, lower($5::text),
      'Demo address, Ahmedabad', 'Demo seed', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
    on conflict (company_id, lead_number) do update
      set purpose_id = excluded.purpose_id,
          sector_id = excluded.sector_id,
          service_category_id = excluded.service_category_id,
          updated_at = now()
  `,
    [
      companyId,
      input.leadNumber,
      input.inquiryName,
      input.companyName,
      input.email,
      input.serviceCategoryId,
      purpose.id,
      sector.id,
      input.ownerUserId,
      input.customerId ?? null,
      input.contactId ?? null,
      input.siteId ?? null,
      input.stage,
      input.lostReason ?? null,
      input.qualificationNotes ?? null,
      actorId,
    ],
  );
  return one<IdRow>(
    client,
    `
    select id from leads where company_id = $1 and lead_number = $2
  `,
    [companyId, input.leadNumber],
  );
}

async function addLeadMember(
  client: PoolClient,
  companyId: string,
  leadId: string,
  userId: string,
  role: string,
) {
  await client.query(
    `
    insert into lead_members (company_id, lead_id, user_id, role)
    values ($1, $2, $3, $4)
    on conflict (lead_id, user_id) do nothing
  `,
    [companyId, leadId, userId, role],
  );
}

async function seedOpportunity(
  client: PoolClient,
  companyId: string,
  actorId: string,
  leadId: string,
  customer: { customerId: string; contactId: string; siteId: string },
  title: string,
) {
  await client.query(
    `
    insert into opportunities (
      company_id, lead_id, customer_id, primary_contact_id, site_id, title, created_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (company_id, lead_id) do nothing
  `,
    [
      companyId,
      leadId,
      customer.customerId,
      customer.contactId,
      customer.siteId,
      title,
      actorId,
    ],
  );
  return one<IdRow>(
    client,
    `select id from opportunities where company_id = $1 and lead_id = $2`,
    [companyId, leadId],
  );
}

async function seedMasterData(
  client: PoolClient,
  companyId: string,
  actorId: string,
) {
  const units = [
    ["DEMO-NOS", "Number", "Nos"],
    ["DEMO-MTR", "Meter", "m"],
    ["DEMO-LOT", "Lot", "lot"],
  ] as const;
  const unitIds = new Map<string, string>();
  for (const [code, name, symbol] of units) {
    const unit = await one<IdRow>(
      client,
      `
      insert into units (company_id, code, name, name_normalized, symbol, created_by_user_id)
      values ($1, $2, $3::text, lower($3::text), $4, $5)
      on conflict (company_id, code) do update
        set status = 'active', symbol = excluded.symbol, updated_at = now()
      returning id
    `,
      [companyId, code, name, symbol, actorId],
    );
    unitIds.set(code, unit.id);
  }

  const categories = [
    ["DEMO-EXT", "Fire extinguishers"],
    ["DEMO-DET", "Fire detection"],
    ["DEMO-PIP", "Fire piping"],
  ] as const;
  const categoryIds = new Map<string, string>();
  for (const [code, name] of categories) {
    const category = await one<IdRow>(
      client,
      `
      insert into item_categories (company_id, code, name, name_normalized, created_by_user_id)
      values ($1, $2, $3::text, lower($3::text), $4)
      on conflict (company_id, code) do update set status = 'active', updated_at = now()
      returning id
    `,
      [companyId, code, name, actorId],
    );
    categoryIds.set(code, category.id);
  }

  const familyDefinitions = [
    ["DEMO-CO2", "CO2 Fire Extinguisher", "Portable CO2 fire extinguisher complete with standard accessories.", "DEMO-EXT", "DEMO-NOS", "capacity", "Capacity", "kg"],
    ["DEMO-ABC", "ABC Dry Powder Extinguisher", "Portable ABC dry powder fire extinguisher complete with standard accessories.", "DEMO-EXT", "DEMO-NOS", "capacity", "Capacity", "kg"],
    ["DEMO-SMOKE-FAMILY", "Addressable Smoke Detector", "Addressable optical smoke detection point.", "DEMO-DET", "DEMO-NOS", "protocol", "Protocol", null],
    ["DEMO-MS-PIPE", "MS Fire Pipe", "C-class heavy mild-steel fire service pipe.", "DEMO-PIP", "DEMO-MTR", "diameter", "Nominal diameter", "mm"],
    ["DEMO-INSTALL-FAMILY", "Installation and Commissioning", "Installation, testing and commissioning service lot.", "DEMO-PIP", "DEMO-LOT", "scope", "Scope", null],
  ] as const;
  const familyIds = new Map<string, string>();
  for (const [code, name, scope, categoryCode, unitCode, specificationKey, specificationLabel, unitLabel] of familyDefinitions) {
    const family = await one<IdRow>(client, `
      insert into item_families (
        company_id, category_id, code, name, name_normalized, scope_description, default_unit_id, created_by_user_id
      ) values ($1, $2, $3, $4::text, lower($4::text), $5, $6, $7)
      on conflict (company_id, code) do update
        set name = excluded.name, name_normalized = excluded.name_normalized,
            scope_description = excluded.scope_description, category_id = excluded.category_id,
            default_unit_id = excluded.default_unit_id, status = 'active', updated_at = now()
      returning id
    `, [companyId, categoryIds.get(categoryCode), code, name, scope, unitIds.get(unitCode), actorId]);
    familyIds.set(code, family.id);
    await client.query(`
      insert into item_family_specifications (
        company_id, family_id, key, label, value_type, unit_label, is_required, sort_order
      ) values ($1, $2, $3, $4, 'text', $5, true, 1)
      on conflict (family_id, key) do update
        set label = excluded.label, unit_label = excluded.unit_label, is_required = excluded.is_required
    `, [companyId, family.id, specificationKey, specificationLabel, unitLabel]);
  }

  const brandDefinitions = [
    ["DEMO-AGNI", "Demo Agni Safety"],
    ["DEMO-SENTINEL", "Demo Sentinel Systems"],
    ["DEMO-VELOCITY", "Demo Velocity Fire"],
  ] as const;
  const brandIds = new Map<string, string>();
  for (const [code, name] of brandDefinitions) {
    const brand = await one<IdRow>(client, `
      insert into brands (company_id, code, name, name_normalized, created_by_user_id)
      values ($1, $2, $3::text, lower($3::text), $4)
      on conflict (company_id, code) do update set name = excluded.name, name_normalized = excluded.name_normalized, status = 'active', updated_at = now()
      returning id
    `, [companyId, code, name, actorId]);
    brandIds.set(code, brand.id);
  }

  const items = [
    [
      "DEMO-CO2-45",
      "CO2 Fire Extinguisher 4.5 kg",
      "4.5 kg CO2 extinguisher",
      "DEMO-EXT",
      "DEMO-NOS",
      "DEMO-CO2",
      "CO2-4.5",
      { capacity: "4.5" },
      ["1045.0000", "320.0000", "25.0000"],
      ["DEMO-AGNI", "DEMO-SENTINEL"],
    ],
    [
      "DEMO-ABC-06",
      "ABC Fire Extinguisher 6 kg",
      "6 kg ABC dry powder extinguisher",
      "DEMO-EXT",
      "DEMO-NOS",
      "DEMO-ABC",
      "ABC-6",
      { capacity: "6" },
      ["750.0000", "180.0000", "20.0000"],
      ["DEMO-AGNI", "DEMO-VELOCITY"],
    ],
    [
      "DEMO-SMOKE",
      "Addressable Smoke Detector",
      "Addressable optical smoke detector",
      "DEMO-DET",
      "DEMO-NOS",
      "DEMO-SMOKE-FAMILY",
      "ADDR-OPT",
      { protocol: "Addressable" },
      ["1200.0000", "250.0000", "15.0000"],
      ["DEMO-SENTINEL", "DEMO-VELOCITY"],
    ],
    [
      "DEMO-MS-P65",
      "MS Fire Pipe 65 mm",
      "C-class heavy MS pipe",
      "DEMO-PIP",
      "DEMO-MTR",
      "DEMO-MS-PIPE",
      "MS-C-65",
      { diameter: "65" },
      ["680.0000", "140.0000", "10.0000"],
      ["DEMO-AGNI", "DEMO-VELOCITY"],
    ],
    [
      "DEMO-INSTALL",
      "Installation and commissioning",
      "Complete demo installation lot",
      "DEMO-PIP",
      "DEMO-LOT",
      "DEMO-INSTALL-FAMILY",
      "SERVICE-LOT",
      { scope: "Complete system" },
      ["0.0000", "12500.0000", "2500.0000"],
      ["DEMO-AGNI"],
    ],
  ] as const;
  for (const [code, name, specification, categoryCode, unitCode, familyCode, model, specificationValues, rates, allowedBrandCodes] of items) {
    const item = await one<IdRow>(
      client,
      `
      insert into items (
        company_id, code, name, name_normalized, specification, category_id, unit_id,
        family_id, costing_brand_id, model, specification_values, created_by_user_id
      ) values ($1, $2, $3::text, lower($3::text), $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      on conflict (company_id, code) do update
        set name = excluded.name, name_normalized = excluded.name_normalized,
            specification = excluded.specification, category_id = excluded.category_id,
            unit_id = excluded.unit_id, family_id = excluded.family_id,
            costing_brand_id = excluded.costing_brand_id, model = excluded.model,
            specification_values = excluded.specification_values, status = 'active', updated_at = now()
      returning id
    `,
      [
        companyId,
        code,
        name,
        specification,
        categoryIds.get(categoryCode),
        unitIds.get(unitCode),
        familyIds.get(familyCode),
        brandIds.get(allowedBrandCodes[0]),
        model,
        JSON.stringify(specificationValues),
        actorId,
      ],
    );
    for (const [brandIndex, brandCode] of allowedBrandCodes.entries()) {
      await client.query(`
        insert into item_brands (company_id, item_id, brand_id, created_by_user_id)
        values ($1, $2, $3, $4) on conflict do nothing
      `, [companyId, item.id, brandIds.get(brandCode), actorId]);
      const offering = await one<IdRow>(client, `
        insert into item_brand_offerings (
          company_id, item_id, brand_id, manufacturer_model, manufacturer_sku,
          is_preferred, created_by_user_id
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (item_id, brand_id, manufacturer_model) do update
          set manufacturer_sku = excluded.manufacturer_sku, is_preferred = excluded.is_preferred,
              status = 'active', updated_at = now()
        returning id
      `, [companyId, item.id, brandIds.get(brandCode), `${model}-${brandCode.replace('DEMO-', '')}`, `${code}-${brandIndex + 1}`, brandIndex === 0, actorId]);
      const rateFactor = 1 + (brandIndex * 0.12);
      await client.query(`
        insert into item_rate_versions (
          company_id, item_id, offering_id, currency, effective_from, supply_rate, labour_rate,
          miscellaneous_rate, miscellaneous_note, created_by_user_id
        ) values ($1, $2, $3, 'INR', date '2026-01-01', $4, $5, $6, 'Demo offering-specific catalogue rate for workflow testing only.', $7)
        on conflict (offering_id, currency, effective_from) do nothing
      `, [companyId, item.id, offering.id, new Decimal(rates[0]).mul(rateFactor).toFixed(4), new Decimal(rates[1]).mul(rateFactor).toFixed(4), new Decimal(rates[2]).mul(rateFactor).toFixed(4), actorId]);
    }
  }

  const vendors = [
    [
      "DEMO-VEN-001",
      "Demo SafeGuard Supplies",
      "Nisha Shah",
      "vendor1@example.test",
      "active",
    ],
    [
      "DEMO-VEN-002",
      "Demo Flame Control Systems",
      "Ravi Patel",
      "vendor2@example.test",
      "active",
    ],
    [
      "DEMO-VEN-003",
      "Demo Archived Equipment Co.",
      "Amit Joshi",
      "vendor3@example.test",
      "inactive",
    ],
  ] as const;
  for (const [code, displayName, contactName, email, status] of vendors) {
    const vendor = await one<IdRow>(
      client,
      `
      insert into vendors (
        company_id, code, display_name, display_name_normalized, legal_name,
        address_line_1, city, state, postal_code, country, status, created_by_user_id
      ) values ($1, $2, $3::text, lower($3::text), $3::text, 'Demo vendor address', 'Ahmedabad',
        'Gujarat', '380001', 'India', $4::master_status, $5)
      on conflict (company_id, code) do update
        set display_name = excluded.display_name,
            display_name_normalized = excluded.display_name_normalized,
            status = excluded.status, updated_at = now()
      returning id
    `,
      [companyId, code, displayName, status, actorId],
    );
    await client.query(
      `
      insert into vendor_contacts (
        company_id, vendor_id, name, job_title, phone, phone_normalized,
        email, email_normalized, is_primary, status, created_by_user_id
      )
      select $1, $2, $3, 'Sales contact', '+91 91111 11111', '+919111111111',
        $4::text, lower($4::text), true, $5::master_status, $6
      where not exists (
        select 1 from vendor_contacts where vendor_id = $2 and email_normalized = lower($4::text)
      )
    `,
      [companyId, vendor.id, contactName, email, status, actorId],
    );
  }
}

async function seedBoqTemplates(
  client: PoolClient,
  companyId: string,
  actorId: string,
  costingUserId: string,
  purchaseHeadUserId: string,
  adminApproverUserId: string,
) {
  const sectorTemplates = [
    ["INDUSTRIAL", "Industrial fire-safety BOQ", ["DEMO-SMOKE", "DEMO-MS-P65", "DEMO-INSTALL"]],
    ["COMMERCIAL", "Commercial fire-safety BOQ", ["DEMO-ABC-06", "DEMO-SMOKE", "DEMO-INSTALL"]],
    ["RESIDENTIAL", "Residential fire-safety BOQ", ["DEMO-ABC-06", "DEMO-SMOKE", "DEMO-INSTALL"]],
    ["INSTITUTIONAL", "Institutional fire-safety BOQ", ["DEMO-CO2-45", "DEMO-SMOKE", "DEMO-INSTALL"]],
    ["HEALTHCARE", "Healthcare fire-safety BOQ", ["DEMO-CO2-45", "DEMO-SMOKE", "DEMO-INSTALL"]],
    ["HOSPITALITY", "Hospitality fire-safety BOQ", ["DEMO-ABC-06", "DEMO-SMOKE", "DEMO-INSTALL"]],
    ["WAREHOUSE_LOGISTICS", "Warehouse fire-safety BOQ", ["DEMO-ABC-06", "DEMO-MS-P65", "DEMO-INSTALL"]],
    ["INFRASTRUCTURE_PUBLIC", "Infrastructure fire-safety BOQ", ["DEMO-CO2-45", "DEMO-MS-P65", "DEMO-INSTALL"]],
    ["MIXED_USE", "Mixed-use fire-safety BOQ", ["DEMO-ABC-06", "DEMO-SMOKE", "DEMO-MS-P65", "DEMO-INSTALL"]],
    ["OTHER", "General fire-safety BOQ", ["DEMO-ABC-06", "DEMO-SMOKE", "DEMO-INSTALL"]],
  ] as const;

  for (const [sectorCode, name, itemCodes] of sectorTemplates) {
    const template = await one<IdRow>(client, `
      insert into boq_templates (
        company_id, sector_id, name, costing_user_id, purchase_head_user_id,
        admin_approver_user_id, created_by_user_id
      )
      select $1, sector.id, $3, $4, $5, $6, $7
      from market_sectors sector
      where sector.company_id = $1 and sector.code = $2
      on conflict (company_id, sector_id) do update
        set name = excluded.name, costing_user_id = excluded.costing_user_id,
            purchase_head_user_id = excluded.purchase_head_user_id,
            admin_approver_user_id = excluded.admin_approver_user_id,
            status = 'active', row_version = boq_templates.row_version + 1, updated_at = now()
      returning id
    `, [companyId, sectorCode, name, costingUserId, purchaseHeadUserId, adminApproverUserId, actorId]);
    await client.query(`delete from boq_template_items where template_id = $1`, [template.id]);
    const additionalItems = referenceProducts.filter((product) =>
      ['INDUSTRIAL', 'WAREHOUSE_LOGISTICS', 'INFRASTRUCTURE_PUBLIC'].includes(sectorCode)
      || ['DEMO-EXT', 'DEMO-DET', 'DEMO-HYDRANT', 'DEMO-SPRINKLER', 'DEMO-SERVICE'].includes(product.categoryCode));
    const expandedItemCodes = [...itemCodes, ...additionalItems.map((product) => product.code)];
    for (const [index, itemCode] of expandedItemCodes.entries()) {
      await client.query(`
        insert into boq_template_items (company_id, template_id, item_id, section, sort_order)
        select $1, $2, item.id, coalesce($5::text, category.name), $4
        from items item inner join item_categories category on category.id = item.category_id
        where item.company_id = $1 and item.code = $3
      `, [companyId, template.id, itemCode, index + 1, referenceProducts.find((product) => product.code === itemCode)?.section ?? null]);
    }
  }
}

async function seedDesignJob(
  client: PoolClient,
  input: {
    companyId: string;
    leadId: string;
    opportunityId: string;
    title: string;
    designerId: string;
    designHeadId: string;
    authorizedById: string;
  },
) {
  await client.query(
    `
    insert into design_jobs (
      company_id, lead_id, opportunity_id, title, designer_user_id, design_head_user_id,
      designer_assigned_at, design_due_at, survey_requested, authorization_notes, authorized_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, now() - interval '1 day', now() + interval '1 day', true,
      'Synthetic authorized design handoff for local workflow testing.', $7)
    on conflict (company_id, lead_id) do nothing
  `,
    [
      input.companyId,
      input.leadId,
      input.opportunityId,
      input.title,
      input.designerId,
      input.designHeadId,
      input.authorizedById,
    ],
  );
  const job = await one<IdRow>(
    client,
    `select id from design_jobs where company_id = $1 and lead_id = $2`,
    [input.companyId, input.leadId],
  );
  await client.query(`
    insert into outbox_jobs (company_id, type, payload, dedup_key, due_at)
    select company_id, 'engineering.design_deadline',
      jsonb_build_object('jobId', id::text, 'dueAt', design_due_at),
      'design-deadline:' || id::text || ':' || extract(epoch from design_due_at)::bigint,
      design_due_at
    from design_jobs where id = $1 and designer_completed_at is null
    on conflict (company_id, type, dedup_key) do nothing
  `, [job.id]);
  return job;
}

async function ensureSurveyDraft(
  client: PoolClient,
  input: { companyId: string; jobId: string; designerId: string },
) {
  await client.query(`
    insert into survey_revisions (
      company_id, design_job_id, revision_number, title, change_summary,
      surveyed_on, status, created_by_user_id
    )
    select $1, $2, 1, 'Demo initial site survey',
      'Upload PDF or image evidence, then finalize this optional survey revision.',
      current_date - 1, 'draft', $3
    where not exists (
      select 1 from survey_revisions where company_id = $1 and design_job_id = $2
    )
    on conflict do nothing
  `, [input.companyId, input.jobId, input.designerId]);
}

async function ensureCustomerApprovedDesign(
  client: PoolClient,
  input: {
    companyId: string;
    jobId: string;
    designerId: string;
    designHeadId: string;
    salesUserId: string;
    scenario: string;
  },
) {
  let revision = (
    await client.query<IdRow>(
      `
      select id from design_package_revisions
      where company_id = $1 and design_job_id = $2
      order by revision_number asc limit 1
    `,
      [input.companyId, input.jobId],
    )
  ).rows[0];
  if (revision) return revision;
  if (!revision) {
    revision = await one<IdRow>(
      client,
      `
      insert into design_package_revisions (
        company_id, design_job_id, revision_number, title, change_summary, status,
        created_by_user_id, submitted_by_user_id, submitted_at
      ) select $1, $2, coalesce(max(revision_number), 0) + 1,
        $3, 'Synthetic file-free downstream baseline; use the design-ready scenario to test real uploads.',
        'customer_approved', $4, $4, now()
      from design_package_revisions where design_job_id = $2 returning id
    `,
      [input.companyId, input.jobId, input.scenario, input.designerId],
    );
  }
  await client.query(
    `
    insert into design_review_actions (
      company_id, revision_id, decision, actor_user_id
    ) values ($1, $2, 'approved', $3)
    on conflict (revision_id) do nothing
  `,
    [input.companyId, revision.id, input.designHeadId],
  );
  await client.query(
    `
    insert into design_customer_decisions (
      company_id, revision_id, decision, evidence_reference, notes, recorded_by_user_id
    ) values ($1, $2, 'approved', $3,
      'Synthetic local prerequisite only; no real customer evidence is claimed.', $4)
    on conflict (revision_id) do nothing
  `,
    [
      input.companyId,
      revision.id,
      `Demo seed approval for ${input.scenario}`,
      input.salesUserId,
    ],
  );
  await client.query(
    `
    update design_jobs set status = 'customer_approved', designer_completed_at = coalesce(designer_completed_at, now()), row_version = row_version + 1,
      updated_at = now()
    where id = $1 and status <> 'customer_approved'
  `,
    [input.jobId],
  );
  return revision;
}

async function ensureApprovedBoq(
  client: PoolClient,
  input: {
    companyId: string;
    jobId: string;
    designRevisionId: string;
    designerId: string;
    designHeadId: string;
    costingUserId: string;
    purchaseHeadUserId: string;
    adminApproverUserId: string;
    scenario: string;
    referenceScope?: boolean;
    status?: 'draft' | 'submitted' | 'costing' | 'purchase_review' | 'admin_review' | 'approved';
  },
) {
  let revision = (
    await client.query<IdRow>(
      `
      select id from boq_revisions
      where company_id = $1 and design_job_id = $2
      order by revision_number asc limit 1
    `,
      [input.companyId, input.jobId],
    )
  ).rows[0];
  if (revision) return revision;

  revision = await one<IdRow>(
    client,
    `
    insert into boq_revisions (
      company_id, design_job_id, design_revision_id, revision_number, title, change_summary,
      status, costing_user_id, purchase_head_user_id, admin_approver_user_id,
      costing_date, calculation_version, rounding_version,
      created_by_user_id, submitted_by_user_id, submitted_at
    ) select $1, $2, $3, coalesce(max(revision_number), 0) + 1,
      $4, 'Complete synthetic technical scope for downstream local testing.',
      $9::boq_revision_status, $6, $7, $8, current_date, 'catalogue-markup-v1', 'half-up-line-2-v1', $5,
      case when $9::text = 'draft' then null else $5::uuid end,
      case when $9::text = 'draft' then null else now() end
    from boq_revisions where design_job_id = $2 returning id
  `,
    [
      input.companyId,
      input.jobId,
      input.designRevisionId,
      input.scenario,
      input.designerId,
      input.costingUserId,
      input.purchaseHeadUserId,
      input.adminApproverUserId,
      input.status ?? 'approved',
    ],
  );
  const demoItems = await client.query<{
    id: string;
    unit_id: string;
    code: string;
    name: string;
    specification: string;
    symbol: string;
  }>(
    `
    select item.id, item.unit_id, item.code, item.name, item.specification, unit.symbol
    from items item inner join units unit on unit.id = item.unit_id
    where item.company_id = $1 and item.code = any($2::text[])
    order by array_position($2::text[], item.code)
  `,
    [input.companyId, input.referenceScope ? referenceProducts.map((product) => product.code) : ['DEMO-SMOKE']],
  );
  if (demoItems.rowCount !== (input.referenceScope ? referenceProducts.length : 1)) {
    throw new Error('Demo BOQ requires every configured catalogue product.');
  }
  let costLineNumber = 0;
  for (const [itemIndex, demoItem] of demoItems.rows.entries()) {
    const source = input.referenceScope ? referenceProducts.find((product) => product.code === demoItem.code) : undefined;
    const quantity = source?.quantity ?? '12';
    const line = await one<IdRow>(
      client,
      `
      insert into boq_lines (
        company_id, boq_revision_id, line_number, section, item_id, item_code_snapshot,
        item_name_snapshot, specification_snapshot, unit_id, unit_symbol_snapshot, quantity, notes
      ) values ($1, $2, $9, $10, $3, $4, $5, $6, $7, $8,
        $11, 'Synthetic full-scope BOQ line.') returning id
    `,
      [
        input.companyId,
        revision.id,
        demoItem.id,
        demoItem.code,
        demoItem.name,
        demoItem.specification,
        demoItem.unit_id,
        demoItem.symbol,
        itemIndex + 1,
        source?.section ?? 'Fire detection',
        quantity,
      ],
    );
    if (input.status === 'draft' || input.status === 'submitted') continue;
    const rates = (await client.query<{ id: string; offering_id: string; brand_id: string | null; brand_name: string | null; manufacturer_model: string; manufacturer_sku: string | null; is_preferred: boolean; supply_rate: string; labour_rate: string; miscellaneous_rate: string }>(`
      select distinct on (rate.offering_id) rate.id, rate.offering_id, offering.brand_id,
        brand.name as brand_name, offering.manufacturer_model, offering.manufacturer_sku,
        offering.is_preferred, rate.supply_rate::text, rate.labour_rate::text, rate.miscellaneous_rate::text
      from item_rate_versions rate
      join item_brand_offerings offering on offering.id = rate.offering_id and offering.status = 'active'
      left join brands brand on brand.id = offering.brand_id
      where rate.company_id = $1 and rate.item_id = $2 and rate.currency = 'INR' and rate.effective_from <= current_date
      order by rate.offering_id, rate.effective_from desc, rate.created_at desc
    `, [input.companyId, demoItem.id])).rows;
    for (const rate of rates) {
      const markupPercent = input.status === 'costing' ? null : '20.0000';
      const calculation = calculateQuotedLine({ quantity, supplyRate: rate.supply_rate, labourRate: rate.labour_rate,
        miscellaneousRate: rate.miscellaneous_rate, markupPercent: markupPercent ?? '0' });
      await client.query(`
        insert into estimate_cost_lines (
          company_id, boq_revision_id, boq_line_id, line_number, category, description,
          quantity, unit_rate, line_total, rate_version_id, offering_id, brand_id_snapshot,
          brand_name_snapshot, manufacturer_model_snapshot, manufacturer_sku_snapshot,
          is_preferred_offering_snapshot, supply_rate, labour_rate, miscellaneous_rate,
          markup_percent, markup_amount, quoted_unit_rate, notes
        ) values ($1, $2, $3, $4, 'material', $20,
          $19, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          case when $17::numeric is null then null else $5::numeric end,
          'Demo offering-specific rate snapshot with purchase-entered markup.')
      `, [input.companyId, revision.id, line.id, ++costLineNumber, markupPercent ? calculation.quotedUnitRate : '0', markupPercent ? calculation.lineAmount : '0', rate.id,
        rate.offering_id, rate.brand_id, rate.brand_name, rate.manufacturer_model, rate.manufacturer_sku, rate.is_preferred,
        rate.supply_rate, rate.labour_rate, rate.miscellaneous_rate, markupPercent, markupPercent ? calculation.markupAmount : null, quantity, demoItem.name]);
    }
  }
  await client.query(`
    insert into boq_revision_contributors (company_id, boq_revision_id, user_id, contribution)
    values ($1, $2, $3, 'quantity') on conflict do nothing
  `, [input.companyId, revision.id, input.designerId]);
  if (!['draft', 'submitted', 'costing'].includes(input.status ?? 'approved')) {
    await client.query(`insert into boq_revision_contributors (company_id, boq_revision_id, user_id, contribution) values ($1, $2, $3, 'costing') on conflict do nothing`, [input.companyId, revision.id, input.costingUserId]);
  }
  if (input.status === 'admin_review' || !input.status || input.status === 'approved') {
    await client.query(
      `
      insert into boq_review_actions (company_id, boq_revision_id, review_stage, decision, actor_user_id)
      values ($1, $2, 'purchase', 'approved', $3)
      on conflict (boq_revision_id, review_stage) do nothing
    `,
      [input.companyId, revision.id, input.purchaseHeadUserId],
    );
  }
  if (!input.status || input.status === 'approved') await client.query(`
    insert into boq_review_actions (company_id, boq_revision_id, review_stage, decision, actor_user_id)
    values ($1, $2, 'admin', 'approved', $3) on conflict (boq_revision_id, review_stage) do nothing
  `, [input.companyId, revision.id, input.adminApproverUserId]);
  return revision;
}

async function ensureQuotationScenario(
  client: PoolClient,
  input: {
    companyId: string;
    jobId: string;
    opportunityId: string;
    boqRevisionId: string;
    quotationNumber: string;
    customerName: string;
    title: string;
    status: "draft" | "submitted" | "approved";
    salesExecutiveId: string;
    salesManagerId: string;
    approverId: string;
    documentDetails?: CommercialDocumentDetails;
  },
) {
  const quotation = await one<IdRow>(
    client,
    `
    insert into quotations (
      company_id, design_job_id, opportunity_id, quotation_number, created_by_user_id
    ) values ($1, $2, $3, $4, $5)
    on conflict (design_job_id) do update set quotation_number = quotations.quotation_number
    returning id
  `,
    [
      input.companyId,
      input.jobId,
      input.opportunityId,
      input.quotationNumber,
      input.salesExecutiveId,
    ],
  );
  let revision = (
    await client.query<IdRow>(
      `select id from quotation_revisions where quotation_id = $1 and revision_number = 1`,
      [quotation.id],
    )
  ).rows[0];
  if (revision) return revision;

  revision = await one<IdRow>(
    client,
    `
    insert into quotation_revisions (
      company_id, quotation_id, boq_revision_id, revision_number, status, title,
      customer_name_snapshot, currency, validity_days, exclusions, delivery_terms,
      payment_terms, subtotal, line_discount_total, additional_discount, tax_amount,
      rounding_adjustment, grand_total, cash_percentage, non_cash_percentage,
      calculation_version, rounding_version,
      created_by_user_id, submitted_by_user_id, submitted_at, approved_by_user_id, approved_at, document_details
    ) select
      $1, $2, $3, 1, $4::quotation_revision_status, $5, $6, 'INR', 7,
      $9,
      'Delivery within 4 weeks of written release.',
      $10,
      cost.total, '0.00', '0.00', '0.00', '0.00', cost.total,
      null, null, 'catalogue-markup-v1', 'half-up-line-2-v1', $7,
      case when $4::text = 'draft' then null else $7::uuid end,
      case when $4::text = 'draft' then null else now() end,
      case when $4::text = 'approved' then $8::uuid else null end,
      case when $4::text = 'approved' then now() else null end, $11::jsonb
    from (select coalesce(sum(line_total), 0)::numeric(20,2) as total from estimate_cost_lines where boq_revision_id = $3 and is_preferred_offering_snapshot = true) cost
    returning id
  `,
    [
      input.companyId,
      quotation.id,
      input.boqRevisionId,
      input.status,
      input.title,
      input.customerName,
      input.salesExecutiveId,
      input.approverId,
      quotationDefaults.exclusions,
      quotationDefaults.paymentTerms,
      JSON.stringify(input.documentDetails ?? {}),
    ],
  );
  await client.query(
    `
    insert into quotation_lines (
      company_id, quotation_revision_id, boq_line_id, line_number, section_snapshot,
      item_code_snapshot, item_name_snapshot, specification_snapshot, unit_symbol_snapshot,
      brand_id, brand_name_snapshot, offering_id, boq_cost_option_id,
      manufacturer_model_snapshot, manufacturer_sku_snapshot,
      quantity, unit_rate, supply_rate, labour_rate,
      miscellaneous_rate, markup_percent, markup_amount, quoted_unit_rate,
      discount_amount, line_subtotal, line_total, notes
    )
    select $1, $2, line.id, line.line_number, line.section, line.item_code_snapshot,
      line.item_name_snapshot, line.specification_snapshot, line.unit_symbol_snapshot,
      cost.brand_id_snapshot, cost.brand_name_snapshot, cost.offering_id, cost.id,
      cost.manufacturer_model_snapshot, cost.manufacturer_sku_snapshot,
      line.quantity, cost.quoted_unit_rate, cost.supply_rate, cost.labour_rate,
      cost.miscellaneous_rate, cost.markup_percent, cost.markup_amount, cost.quoted_unit_rate,
      '0.00', cost.line_total, cost.line_total,
      'Synthetic fixed price copied from the approved catalogue-priced BOQ.'
    from boq_lines line
    join estimate_cost_lines cost on cost.boq_line_id = line.id and cost.boq_revision_id = line.boq_revision_id and cost.is_preferred_offering_snapshot = true
    where line.boq_revision_id = $3
    order by line.line_number
  `,
    [input.companyId, revision.id, input.boqRevisionId],
  );
  for (const contributorId of [
    input.salesExecutiveId,
    input.salesManagerId,
  ]) {
    await client.query(
      `
      insert into quotation_revision_contributors (
        company_id, quotation_revision_id, user_id
      ) values ($1, $2, $3) on conflict do nothing
    `,
      [input.companyId, revision.id, contributorId],
    );
  }
  if (input.status === "approved") {
    await client.query(
      `
      insert into quotation_review_actions (
        company_id, quotation_revision_id, decision, actor_user_id
      ) values ($1, $2, 'approved', $3)
      on conflict (quotation_revision_id) do nothing
    `,
      [input.companyId, revision.id, input.approverId],
    );
  }
  return revision;
}

async function ensureProcurementScenario(
  client: PoolClient,
  input: {
    companyId: string;
    projectId: string;
    boqRevisionId: string;
    buyerId: string;
    managerId: string;
    scenario?: 'comparison' | 'substitution' | 'awarded_po';
  },
) {
  const isAwarded = input.scenario === 'awarded_po';
  const substitution = input.scenario === 'substitution';
  const requisitionNumber = isAwarded
    ? 'DEMO-REQ-PO-001'
    : substitution
      ? 'DEMO-REQ-SUB-001'
      : 'DEMO-REQ-001';
  const rfqNumber = isAwarded
    ? 'DEMO-RFQ-PO-001'
    : substitution
      ? 'DEMO-RFQ-SUB-001'
      : 'DEMO-RFQ-001';
  const title = isAwarded
    ? 'Demo awarded purchase order (PO)'
    : substitution
      ? 'Demo technical substitution review'
      : 'Demo detector procurement';
  const reqStatus = isAwarded ? 'selected' : 'sourcing';
  const rfqStatus = isAwarded ? 'selected' : 'open';
  const compStatus = isAwarded ? 'selected' : 'open';

  const requisition = await one<IdRow>(
    client,
    `
    insert into procurement_requisitions (
      company_id, project_id, boq_revision_id, requisition_number, title, status,
      buyer_user_id, purchase_manager_user_id, required_by, delivery_location, notes, row_version
    ) values ($1, $2, $3, $6, $7, $8,
      $4, $5, current_date + 21, 'Demo project site, Ahmedabad',
      'Synthetic demand based on the complete approved project BOQ.', 2)
    on conflict (company_id, requisition_number) do update
      set title = excluded.title, status = excluded.status
    returning id
  `,
    [
      input.companyId,
      input.projectId,
      input.boqRevisionId,
      input.buyerId,
      input.managerId,
      requisitionNumber,
      title,
      reqStatus,
    ],
  );
  const requisitionLine = await one<IdRow>(
    client,
    `
    insert into procurement_requisition_lines (
      company_id, requisition_id, boq_line_id, line_number, item_id, item_code_snapshot,
      item_name_snapshot, specification_snapshot, unit_id, unit_symbol_snapshot, quantity
    ) select $1, $2, line.id, line.line_number, line.item_id, line.item_code_snapshot,
      line.item_name_snapshot, line.specification_snapshot, line.unit_id, line.unit_symbol_snapshot, line.quantity
    from boq_lines line where line.boq_revision_id = $3 order by line.line_number limit 1
    on conflict (requisition_id, boq_line_id) do update set quantity = procurement_requisition_lines.quantity
    returning id
  `,
    [input.companyId, requisition.id, input.boqRevisionId],
  );
  const rfq = await one<IdRow>(
    client,
    `
    insert into procurement_rfqs (
      company_id, requisition_id, rfq_number, status, response_due_date,
      commercial_terms, created_by_user_id, row_version
    ) values ($1, $2, $4, $5, current_date + 7,
      'Quote taxes, freight, lead time, payment terms and warranty separately. Internal demo only; no external message sent.', $3, 1)
    on conflict (requisition_id) do update set commercial_terms = procurement_rfqs.commercial_terms, status = excluded.status
    returning id
  `,
    [input.companyId, requisition.id, input.buyerId, rfqNumber, rfqStatus],
  );
  const rfqLine = await one<IdRow>(
    client,
    `
    insert into procurement_rfq_lines (
      company_id, rfq_id, requisition_line_id, line_number, item_id, item_code_snapshot,
      item_name_snapshot, specification_snapshot, unit_id, unit_symbol_snapshot, quantity
    ) select $1, $2, req.id, req.line_number, req.item_id, req.item_code_snapshot,
      req.item_name_snapshot, req.specification_snapshot, req.unit_id, req.unit_symbol_snapshot, req.quantity
    from procurement_requisition_lines req where req.id = $3
    on conflict (rfq_id, requisition_line_id) do update set quantity = procurement_rfq_lines.quantity
    returning id
  `,
    [input.companyId, rfq.id, requisitionLine.id],
  );
  const comparison = await one<IdRow>(
    client,
    `
    insert into purchase_comparisons (company_id, rfq_id, status, row_version)
    values ($1, $2, $3, 1)
    on conflict (rfq_id) do update set status = excluded.status
    returning id
  `,
    [input.companyId, rfq.id, compStatus],
  );
  const vendorRows = await client.query<{ id: string; code: string }>(
    `
    select id, code from vendors where company_id = $1 and code in ('DEMO-VEN-001', 'DEMO-VEN-002') order by code
  `,
    [input.companyId],
  );
  if (vendorRows.rows.length !== 2)
    throw new Error(
      'Demo procurement scenario requires two active demo vendors.',
    );
  let awardedOfferId: string | null = null;
  for (const vendor of vendorRows.rows) {
    await client.query(
      `
      insert into procurement_rfq_vendors (company_id, rfq_id, vendor_id)
      values ($1, $2, $3) on conflict do nothing
    `,
      [input.companyId, rfq.id, vendor.id],
    );
    const first = vendor.code === 'DEMO-VEN-001';
    const rate = first ? '950.00' : '1000.00';
    const freight = first ? '300.00' : '0.00';
    const subtotal = first ? '11400.00' : '12000.00';
    const total = first ? '11700.00' : '12000.00';
    const offer = await one<IdRow>(
      client,
      `
      insert into vendor_offers (
        company_id, rfq_id, vendor_id, vendor_reference, currency, tax_basis,
        freight_amount, lead_time_days, payment_terms, warranty, valid_until,
        subtotal, total, recorded_by_user_id
      ) values ($1, $2, $3, $4, 'INR', 'GST extra at the applicable configured invoice rate',
        $5, $6, $7, $8, current_date + 30, $9, $10, $11)
      on conflict (rfq_id, vendor_id) do update set vendor_reference = vendor_offers.vendor_reference
      returning id
    `,
      [
        input.companyId,
        rfq.id,
        vendor.id,
        first
          ? isAwarded
            ? 'PO-SENTINEL-101'
            : 'SG-DEMO-101'
          : isAwarded
            ? 'PO-FC-202'
            : 'FC-DEMO-202',
        freight,
        first ? 14 : 10,
        first ? '30 days from supply' : '50% advance, balance before dispatch',
        first ? '18 months from supply' : '24 months from supply',
        subtotal,
        total,
        input.buyerId,
      ],
    );
    if (first) {
      awardedOfferId = offer.id;
    }
    const technicalDeviation = substitution && first;
    await client.query(
      `
      insert into vendor_offer_lines (
        company_id, vendor_offer_id, rfq_line_id, line_number, unit_rate, line_total,
        brand_offered, specification_offered, equivalence, deviation_notes
      ) values ($1, $2, $3, 1, $4, $5, $6, $7, $8::offer_equivalence, $9)
      on conflict (vendor_offer_id, rfq_line_id) do update set unit_rate = vendor_offer_lines.unit_rate
    `,
      [
        input.companyId,
        offer.id,
        rfqLine.id,
        rate,
        subtotal,
        first ? 'Sentinel' : 'Velocity',
        technicalDeviation
          ? 'Alternative addressable detector with a different protocol interface.'
          : 'Addressable optical smoke detector matching the approved technical BOQ.',
        technicalDeviation ? 'deviation' : 'equivalent',
        technicalDeviation
          ? 'Vendor proposes a different loop protocol; design-head compatibility authorization is required.'
          : null,
      ],
    );
  }

  if (isAwarded && awardedOfferId) {
    await client.query(
      `
      insert into procurement_selection_decisions (
        company_id, comparison_id, selected_offer_id, selection_reason, selected_by_user_id
      ) values ($1, $2, $3, 'Awarded PO: Lowest compliant commercial proposal with 24-month warranty and immediate site delivery.', $4)
      on conflict (comparison_id) do update
        set selection_reason = excluded.selection_reason, selected_offer_id = excluded.selected_offer_id
    `,
      [input.companyId, comparison.id, awardedOfferId, input.managerId],
    );
  }

  return requisition;
}

async function ensurePriceInquiryScenario(
  client: PoolClient,
  input: { companyId: string; userId: string },
) {
  const itemRows = await client.query<{ id: string; code: string; name: string; specification: string }>(`
    select id, code, name, specification from items where company_id = $1 and code in ('DEMO-SMOKE', 'DEMO-ABC-06', 'DEMO-MS-P65') order by code
  `, [input.companyId]);

  const vendorRows = await client.query<{ id: string; code: string; displayName: string }>(`
    select id, code, display_name as "displayName" from vendors where company_id = $1 and code in ('DEMO-VEN-001', 'DEMO-VEN-002') order by code
  `, [input.companyId]);

  if (vendorRows.rows.length < 2 || itemRows.rows.length === 0) return;

  const sentinel = vendorRows.rows.find((v) => v.code === 'DEMO-VEN-001')!;
  const flametech = vendorRows.rows.find((v) => v.code === 'DEMO-VEN-002')!;

  const smokeItem = itemRows.rows.find((i) => i.code === 'DEMO-SMOKE');
  const abcItem = itemRows.rows.find((i) => i.code === 'DEMO-ABC-06');
  const pipeItem = itemRows.rows.find((i) => i.code === 'DEMO-MS-P65');

  if (smokeItem) {
    await client.query(`
      insert into vendor_price_lists (company_id, vendor_id, item_id, vendor_product_name, unit_rate, currency, lead_time_days, effective_from)
      values ($1, $2, $3, 'Sentinel Addressable Smoke Detector V1', '950.0000', 'INR', 14, current_date - 90)
      on conflict do nothing
    `, [input.companyId, sentinel.id, smokeItem.id]);
    await client.query(`
      insert into vendor_price_lists (company_id, vendor_id, item_id, vendor_product_name, unit_rate, currency, lead_time_days, effective_from)
      values ($1, $2, $3, 'FlameTech Addressable Smoke Detector FT-100', '1000.0000', 'INR', 10, current_date - 90)
      on conflict do nothing
    `, [input.companyId, flametech.id, smokeItem.id]);
  }
  if (abcItem) {
    await client.query(`
      insert into vendor_price_lists (company_id, vendor_id, item_id, vendor_product_name, unit_rate, currency, lead_time_days, effective_from)
      values ($1, $2, $3, 'Sentinel 6kg ABC Extinguisher', '820.0000', 'INR', 7, current_date - 90)
      on conflict do nothing
    `, [input.companyId, sentinel.id, abcItem.id]);
    await client.query(`
      insert into vendor_price_lists (company_id, vendor_id, item_id, vendor_product_name, unit_rate, currency, lead_time_days, effective_from)
      values ($1, $2, $3, 'FlameTech 6kg ABC Extinguisher', '800.0000', 'INR', 7, current_date - 90)
      on conflict do nothing
    `, [input.companyId, flametech.id, abcItem.id]);
  }
  if (pipeItem) {
    await client.query(`
      insert into vendor_price_lists (company_id, vendor_id, item_id, vendor_product_name, unit_rate, currency, lead_time_days, effective_from)
      values ($1, $2, $3, 'Sentinel MS Pipe 65mm Class C', '690.0000', 'INR', 7, current_date - 90)
      on conflict do nothing
    `, [input.companyId, sentinel.id, pipeItem.id]);
    await client.query(`
      insert into vendor_price_lists (company_id, vendor_id, item_id, vendor_product_name, unit_rate, currency, lead_time_days, effective_from)
      values ($1, $2, $3, 'FlameTech Heavy MS Pipe 65mm', '710.0000', 'INR', 10, current_date - 90)
      on conflict do nothing
    `, [input.companyId, flametech.id, pipeItem.id]);
  }

  const inquiryItems = [
    {
      itemId: smokeItem?.id,
      itemCode: smokeItem?.code,
      itemName: smokeItem?.name ?? 'Addressable Smoke Detector',
      specification: smokeItem?.specification ?? 'Addressable optical smoke detector with base',
      quantity: 50,
      unit: 'NOS',
    },
    {
      itemId: abcItem?.id,
      itemCode: abcItem?.code,
      itemName: abcItem?.name ?? 'ABC Fire Extinguisher 6 kg',
      specification: abcItem?.specification ?? '6 kg ABC dry powder extinguisher IS 15683',
      quantity: 20,
      unit: 'NOS',
    },
    {
      itemId: pipeItem?.id,
      itemCode: pipeItem?.code,
      itemName: pipeItem?.name ?? 'MS Fire Pipe 65 mm',
      specification: pipeItem?.specification ?? 'C-class heavy MS pipe red oxide painted',
      quantity: 100,
      unit: 'MTR',
    },
  ];

  const inquiry = await one<IdRow>(client, `
    insert into vendor_price_inquiries (
      company_id, inquiry_code, title, description, items, status, response_due_date, created_by_user_id
    ) values ($1, 'DEMO-PRI-001', 'Q4 Detector & Extinguisher Rate Comparison Inquiry',
      'Rate contract inquiry sent via WhatsApp self-fill link for Q4 project replenishment.',
      $2::jsonb, 'open', current_date + 14, $3)
    on conflict (company_id, inquiry_code) do update
      set title = excluded.title, items = excluded.items, description = excluded.description
    returning id
  `, [input.companyId, JSON.stringify(inquiryItems), input.userId]);

  const invSentinel = await one<IdRow>(client, `
    insert into vendor_price_inquiry_invitations (
      inquiry_id, company_id, vendor_id, token, whatsapp_number, status, sent_at, expires_at, responded_at
    ) values ($1, $2, $3, 'demo-token-sentinel-price', '+919876543210', 'responded', now() - interval '2 days', now() + interval '12 days', now() - interval '1 day')
    on conflict (token) do update
      set status = 'responded', responded_at = now() - interval '1 day'
    returning id
  `, [inquiry.id, input.companyId, sentinel.id]);

  const invFlameTech = await one<IdRow>(client, `
    insert into vendor_price_inquiry_invitations (
      inquiry_id, company_id, vendor_id, token, whatsapp_number, status, sent_at, expires_at, responded_at
    ) values ($1, $2, $3, 'demo-token-flametech-price', '+919876543211', 'responded', now() - interval '2 days', now() + interval '12 days', now() - interval '12 hours')
    on conflict (token) do update
      set status = 'responded', responded_at = now() - interval '12 hours'
    returning id
  `, [inquiry.id, input.companyId, flametech.id]);

  await client.query(`
    delete from vendor_price_inquiry_responses where inquiry_id = $1
  `, [inquiry.id]);

  const sentinelResponses = [
    { itemRef: inquiryItems[0], unitRate: '920.0000', leadTimeDays: 7, notes: 'Sentinel Pro - Bulk discount applied (-3.2%)' },
    { itemRef: inquiryItems[1], unitRate: '790.0000', leadTimeDays: 3, notes: 'Ex-Ahmedabad depot stock (-3.7%)' },
    { itemRef: inquiryItems[2], unitRate: '670.0000', leadTimeDays: 5, notes: 'Includes test certificates (-2.9%)' },
  ];
  for (const r of sentinelResponses) {
    await client.query(`
      insert into vendor_price_inquiry_responses (
        invitation_id, inquiry_id, vendor_id, company_id, item_ref, unit_rate, currency, lead_time_days, notes
      ) values ($1, $2, $3, $4, $5::jsonb, $6, 'INR', $7, $8)
    `, [invSentinel.id, inquiry.id, sentinel.id, input.companyId, JSON.stringify(r.itemRef), r.unitRate, r.leadTimeDays, r.notes]);
  }

  const flametechResponses = [
    { itemRef: inquiryItems[0], unitRate: '980.0000', leadTimeDays: 10, notes: 'FT-200 Optical Smoke Detector (-2.0%)' },
    { itemRef: inquiryItems[1], unitRate: '810.0000', leadTimeDays: 4, notes: 'ISI Stamped 6kg (+1.3%)' },
    { itemRef: inquiryItems[2], unitRate: '695.0000', leadTimeDays: 7, notes: 'IS 1239 Heavy Class C (-2.1%)' },
  ];
  for (const r of flametechResponses) {
    await client.query(`
      insert into vendor_price_inquiry_responses (
        invitation_id, inquiry_id, vendor_id, company_id, item_ref, unit_rate, currency, lead_time_days, notes
      ) values ($1, $2, $3, $4, $5::jsonb, $6, 'INR', $7, $8)
    `, [invFlameTech.id, inquiry.id, flametech.id, input.companyId, JSON.stringify(r.itemRef), r.unitRate, r.leadTimeDays, r.notes]);
  }
}

async function ensurePurchaseOrderScenario(
  client: PoolClient,
  input: {
    companyId: string;
    projectId: string;
    buyerId: string;
    managerId: string;
    adminId: string;
  },
) {
  const reqRow = await client.query<{ id: string }>(
    `select id from procurement_requisitions where company_id = $1 and requisition_number = 'DEMO-REQ-PO-001'`,
    [input.companyId],
  );
  const reqId = reqRow.rows[0]?.id ?? null;

  const vendorRows = await client.query<{ id: string; code: string; displayName: string }>(
    `select id, code, display_name as "displayName" from vendors where company_id = $1 and code in ('DEMO-VEN-001', 'DEMO-VEN-002') order by code`,
    [input.companyId],
  );
  if (vendorRows.rows.length < 2) return;
  const sentinel = vendorRows.rows.find((v) => v.code === 'DEMO-VEN-001')!;
  const flametech = vendorRows.rows.find((v) => v.code === 'DEMO-VEN-002')!;

  const itemRows = await client.query<{
    id: string;
    code: string;
    name: string;
    specification: string;
    unitId: string;
    unitSymbol: string;
  }>(
    `select i.id, i.code, i.name, i.specification, i.unit_id as "unitId", u.symbol as "unitSymbol"
     from items i
     join units u on u.id = i.unit_id
     where i.company_id = $1 and i.code in ('DEMO-SMOKE', 'DEMO-ABC-06', 'DEMO-MS-P65')
     order by i.code`,
    [input.companyId],
  );
  const smoke = itemRows.rows.find((i) => i.code === 'DEMO-SMOKE');
  const abc = itemRows.rows.find((i) => i.code === 'DEMO-ABC-06');
  const pipe = itemRows.rows.find((i) => i.code === 'DEMO-MS-P65');
  if (!smoke || !abc || !pipe) return;

  // 1. DEMO-PO-001: Issued & Partially Delivered with Inspection
  const po1 = await one<IdRow>(
    client,
    `
    insert into purchase_orders (
      company_id, project_id, vendor_id, requisition_id, po_number, title,
      status, currency, payment_terms, delivery_terms, delivery_location,
      delivery_due_date, billing_address, shipping_address, notes,
      current_revision_number, subtotal, tax_amount, grand_total, created_by_user_id, row_version
    ) values (
      $1, $2, $3, $4, 'DEMO-PO-001', 'Supply of optical smoke detectors - Sentinel Security',
      'partially_delivered', 'INR', '30 days from supply against delivery challan',
      'Site delivery, transit insurance included', 'Demo project site, Ahmedabad',
      current_date + 14, 'Fire Safety Corp HQ, Ahmedabad', 'Demo project site, Ahmedabad',
      'Delivery in two lots as per installation phase schedule.',
      0, '11400.00', '2052.00', '13452.00', $5, 1
    )
    on conflict (company_id, po_number) do update
      set status = excluded.status, subtotal = excluded.subtotal, tax_amount = excluded.tax_amount, grand_total = excluded.grand_total
    returning id
  `,
    [input.companyId, input.projectId, sentinel.id, reqId, input.buyerId],
  );

  const rev1 = await one<IdRow>(
    client,
    `
    insert into purchase_order_revisions (
      company_id, purchase_order_id, revision_number, status, subtotal, tax_amount, grand_total,
      change_reason, prepared_by_user_id, submitted_at, approved_by_user_id, approved_at,
      approval_notes, issued_at, row_version
    ) values (
      $1, $2, 0, 'issued', '11400.00', '2052.00', '13452.00',
      null, $3, now() - interval '5 days', $4, now() - interval '4 days',
      'Commercial rates and 18% GST verified against evaluated RFQ offers.', now() - interval '3 days', 1
    )
    on conflict (purchase_order_id, revision_number) do update
      set status = excluded.status, grand_total = excluded.grand_total
    returning id
  `,
    [input.companyId, po1.id, input.buyerId, input.managerId],
  );

  const poLine1 = await one<IdRow>(
    client,
    `
    insert into purchase_order_lines (
      company_id, purchase_order_id, revision_id, line_number, item_id,
      item_code_snapshot, item_name_snapshot, specification_snapshot, brand_offered,
      unit_id, unit_symbol_snapshot, quantity, unit_rate, tax_percent, tax_amount, line_total,
      received_quantity, accepted_quantity, rejected_quantity
    ) values (
      $1, $2, $3, 1, $4,
      $5, $6, $7, 'Sentinel',
      $8, $9, '12.0000', '950.00', '18.00', '2052.00', '13452.00',
      '6.0000', '5.0000', '1.0000'
    )
    on conflict (revision_id, line_number) do update
      set received_quantity = excluded.received_quantity, accepted_quantity = excluded.accepted_quantity, rejected_quantity = excluded.rejected_quantity
    returning id
  `,
    [
      input.companyId,
      po1.id,
      rev1.id,
      smoke.id,
      smoke.code,
      smoke.name,
      smoke.specification,
      smoke.unitId,
      smoke.unitSymbol,
    ],
  );

  // Goods Receipt against DEMO-PO-001
  const grn1 = await one<IdRow>(
    client,
    `
    insert into goods_receipts (
      company_id, purchase_order_id, grn_number, vendor_challan_number, vendor_challan_date,
      received_at, received_by_user_id, status, delivery_location, vehicle_number, transporter_name, notes, row_version
    ) values (
      $1, $2, 'DEMO-GRN-001', 'CH-SENT-9921', current_date - 2,
      now() - interval '2 days', $3, 'partially_rejected', 'Demo project site, Ahmedabad',
      'GJ-01-AB-1234', 'Gujarat Roadways Logistics', 'Partial first consignment of 6 units received.', 1
    )
    on conflict (company_id, grn_number) do update
      set status = excluded.status
    returning id
  `,
    [input.companyId, po1.id, input.buyerId],
  );

  await client.query(
    `
    insert into goods_receipt_lines (
      company_id, goods_receipt_id, purchase_order_line_id, line_number,
      delivered_quantity, accepted_quantity, rejected_quantity, rejection_reason,
      inspection_notes, inspected_by_user_id, inspected_at
    ) values (
      $1, $2, $3, 1,
      '6.0000', '5.0000', '1.0000', 'Physical hairline casing crack observed during continuity and bench test.',
      '5 detectors passed continuity and LED blink bench check; 1 unit marked and returned with delivery vehicle.', $4, now() - interval '1 day'
    )
    on conflict (goods_receipt_id, line_number) do update
      set accepted_quantity = excluded.accepted_quantity, rejected_quantity = excluded.rejected_quantity
  `,
    [input.companyId, grn1.id, poLine1.id, input.managerId],
  );

  // 2. DEMO-PO-002: Approved awaiting PDF issuance
  const po2 = await one<IdRow>(
    client,
    `
    insert into purchase_orders (
      company_id, project_id, vendor_id, po_number, title,
      status, currency, payment_terms, delivery_terms, delivery_location,
      delivery_due_date, billing_address, shipping_address, notes,
      current_revision_number, subtotal, tax_amount, grand_total, created_by_user_id, row_version
    ) values (
      $1, $2, $3, 'DEMO-PO-002', 'Supply of 6kg ABC fire extinguishers - FlameTech',
      'approved', 'INR', '50% advance, balance on delivery inspection',
      'Ex-works delivery', 'Demo project site, Ahmedabad',
      current_date + 7, 'Fire Safety Corp HQ, Ahmedabad', 'Demo project site, Ahmedabad',
      'Include calibration test certificate for cylinder hydro-testing.',
      0, '8000.00', '1440.00', '9440.00', $4, 1
    )
    on conflict (company_id, po_number) do update
      set status = excluded.status, subtotal = excluded.subtotal, tax_amount = excluded.tax_amount, grand_total = excluded.grand_total
    returning id
  `,
    [input.companyId, input.projectId, flametech.id, input.buyerId],
  );

  const rev2 = await one<IdRow>(
    client,
    `
    insert into purchase_order_revisions (
      company_id, purchase_order_id, revision_number, status, subtotal, tax_amount, grand_total,
      change_reason, prepared_by_user_id, submitted_at, approved_by_user_id, approved_at,
      approval_notes, row_version
    ) values (
      $1, $2, 0, 'approved', '8000.00', '1440.00', '9440.00',
      null, $3, now() - interval '1 day', $4, now() - interval '2 hours',
      'Approved for issuance to vendor FlameTech.', 1
    )
    on conflict (purchase_order_id, revision_number) do update
      set status = excluded.status, grand_total = excluded.grand_total
    returning id
  `,
    [input.companyId, po2.id, input.buyerId, input.managerId],
  );

  await client.query(
    `
    insert into purchase_order_lines (
      company_id, purchase_order_id, revision_id, line_number, item_id,
      item_code_snapshot, item_name_snapshot, specification_snapshot, brand_offered,
      unit_id, unit_symbol_snapshot, quantity, unit_rate, tax_percent, tax_amount, line_total
    ) values (
      $1, $2, $3, 1, $4,
      $5, $6, $7, 'FlameTech',
      $8, $9, '10.0000', '800.00', '18.00', '1440.00', '9440.00'
    )
    on conflict (revision_id, line_number) do update
      set unit_rate = excluded.unit_rate, line_total = excluded.line_total
  `,
    [
      input.companyId,
      po2.id,
      rev2.id,
      abc.id,
      abc.code,
      abc.name,
      abc.specification,
      abc.unitId,
      abc.unitSymbol,
    ],
  );

  // 3. DEMO-PO-003: Draft direct PO
  const po3 = await one<IdRow>(
    client,
    `
    insert into purchase_orders (
      company_id, project_id, vendor_id, po_number, title,
      status, currency, payment_terms, delivery_terms, delivery_location,
      delivery_due_date, billing_address, shipping_address, notes,
      current_revision_number, subtotal, tax_amount, grand_total, created_by_user_id, row_version
    ) values (
      $1, $2, $3, 'DEMO-PO-003', 'Draft PO for MS Heavy Piping 65mm',
      'draft', 'INR', '30 days net',
      'Site delivery', 'Demo project site, Ahmedabad',
      current_date + 21, 'Fire Safety Corp HQ, Ahmedabad', 'Demo project site, Ahmedabad',
      'Awaiting thickness test verification before submitting for approval.',
      0, '6900.00', '1242.00', '8142.00', $4, 1
    )
    on conflict (company_id, po_number) do update
      set status = excluded.status, subtotal = excluded.subtotal, tax_amount = excluded.tax_amount, grand_total = excluded.grand_total
    returning id
  `,
    [input.companyId, input.projectId, sentinel.id, input.buyerId],
  );

  const rev3 = await one<IdRow>(
    client,
    `
    insert into purchase_order_revisions (
      company_id, purchase_order_id, revision_number, status, subtotal, tax_amount, grand_total,
      change_reason, prepared_by_user_id, row_version
    ) values (
      $1, $2, 0, 'draft', '6900.00', '1242.00', '8142.00',
      null, $3, 1
    )
    on conflict (purchase_order_id, revision_number) do update
      set status = excluded.status, grand_total = excluded.grand_total
    returning id
  `,
    [input.companyId, po3.id, input.buyerId],
  );

  await client.query(
    `
    insert into purchase_order_lines (
      company_id, purchase_order_id, revision_id, line_number, item_id,
      item_code_snapshot, item_name_snapshot, specification_snapshot, brand_offered,
      unit_id, unit_symbol_snapshot, quantity, unit_rate, tax_percent, tax_amount, line_total
    ) values (
      $1, $2, $3, 1, $4,
      $5, $6, $7, 'Sentinel',
      $8, $9, '10.0000', '690.00', '18.00', '1242.00', '8142.00'
    )
    on conflict (revision_id, line_number) do update
      set unit_rate = excluded.unit_rate, line_total = excluded.line_total
  `,
    [
      input.companyId,
      po3.id,
      rev3.id,
      pipe.id,
      pipe.code,
      pipe.name,
      pipe.specification,
      pipe.unitId,
      pipe.unitSymbol,
    ],
  );
}

async function seedCurrentWorkflows(client: PoolClient, input: {
  companyId: string; companyName: string; adminId: string; managerId: string; executiveId: string;
  designerId: string; headId: string; purchaseId: string; purchaseManagerId: string; serviceCategoryId: string;
  customer: { customerId: string; contactId: string; siteId: string };
}) {
  const definitions = [
    { code: 'HEAD', title: 'Design head must assign an engineer', mode: 'head' },
    { code: 'TIMER', title: 'Active two-day design task', mode: 'timer' },
    { code: 'BUFFER', title: 'Design task with one three-day buffer', mode: 'buffer' },
    { code: 'OVERDUE', title: 'Overdue design task with all three buffers used', mode: 'overdue' },
    { code: 'CUSTOMER', title: 'Design revision awaiting customer decision', mode: 'customer' },
    { code: 'BOQ-DRAFT', title: 'Full catalogue BOQ quantity entry', mode: 'boq', boqStatus: 'draft' },
    { code: 'BOQ-SUBMITTED', title: 'Submitted quantities ready to start costing', mode: 'boq', boqStatus: 'submitted' },
    { code: 'BOQ-COSTING', title: 'Purchase markup entry with frozen make rates', mode: 'boq', boqStatus: 'costing' },
    { code: 'BOQ-PURCHASE', title: 'Full catalogue BOQ awaiting purchase-head approval', mode: 'boq', boqStatus: 'purchase_review' },
    { code: 'BOQ-ADMIN', title: 'Full catalogue BOQ awaiting final admin approval', mode: 'boq', boqStatus: 'admin_review' },
    { code: 'QUOTE-DRAFT', title: 'Purchase quotation with editable terms and document details', mode: 'quote', quoteStatus: 'draft' },
    { code: 'QUOTE-ISSUED', title: 'Issued full catalogue quotation awaiting customer response', mode: 'quote', target: 'issued' },
    { code: 'QUOTE-ACCEPTED', title: 'Accepted quotation ready for payment-plan configuration', mode: 'quote', target: 'accepted' },
    { code: 'QUOTE-PLANNED', title: 'Accepted quotation with full-value cash and non-cash plan', mode: 'quote', target: 'planned' },
    { code: 'QUOTE-DECLINED', title: 'Declined quotation with exact-revision customer evidence', mode: 'quote', target: 'declined' },
    { code: 'ADMIN-OVERRIDE', title: 'Administrator-contributed quotation awaiting review', mode: 'quote', quoteStatus: 'submitted' },
  ] as const;
  const checkpoints: DemoQuotationCheckpoint[] = [];
  for (const definition of definitions) {
    const purposes: Record<string, string> = { head: 'EXPANSION_EXTENSION', timer: 'NEW_PROJECT', buffer: 'UPGRADE_RETROFIT', overdue: 'REPAIR_REPLACEMENT', customer: 'COMPLIANCE_AUDIT', quote: 'RENEWAL' };
    const sectors: Record<string, string> = { head: 'RESIDENTIAL', timer: 'COMMERCIAL', buffer: 'HEALTHCARE', overdue: 'WAREHOUSE_LOGISTICS', customer: 'HOSPITALITY' };
    const lead = await seedLead(client, input.companyId, input.adminId, {
      leadNumber: `DEMO-LATEST-${definition.code}`, inquiryName: `Demo: ${definition.title}`,
      companyName: 'Demo Acme Industrial Systems', email: `demo.${definition.code.toLowerCase()}@example.test`,
      stage: 'design_authorized', qualificationNotes: 'Synthetic current-feature checkpoint for local testing.',
      serviceCategoryId: input.serviceCategoryId, purposeCode: purposes[definition.mode] ?? 'MAINTENANCE_SERVICE',
      sectorCode: sectors[definition.mode] ?? 'INDUSTRIAL', ownerUserId: input.executiveId, ...input.customer,
    });
    for (const [userId, role] of [[input.executiveId, 'owner'], [input.managerId, 'collaborator']] as const) {
      await addLeadMember(client, input.companyId, lead.id, userId, role);
    }
    const opportunity = await seedOpportunity(client, input.companyId, input.executiveId, lead.id, input.customer, `Demo: ${definition.title}`);
    for (const [userId, role] of [[input.executiveId, 'owner'], [input.managerId, 'sales']] as const) {
      await client.query(`insert into opportunity_members (company_id, opportunity_id, user_id, role) values ($1, $2, $3, $4) on conflict do nothing`, [input.companyId, opportunity.id, userId, role]);
    }
    // INSERT-only checkpoints preserve tested states, due dates, buffers and later revisions on rerun.
    const inserted = (await client.query<IdRow>(`
      insert into design_jobs (company_id, lead_id, opportunity_id, title, status, designer_user_id,
        design_head_user_id, designer_assigned_at, design_due_at, buffer_extensions_used, authorization_notes, authorized_by_user_id)
      values ($1, $2, $3, $4, case when $5::text = 'head' then 'awaiting_designer' else 'authorized' end,
        case when $5::text = 'head' then null else $6::uuid end, $7,
        case when $5::text = 'head' then null when $5::text = 'overdue' then now() - interval '12 days' else now() - interval '1 day' end,
        case when $5::text = 'head' then null when $5::text = 'overdue' then now() - interval '1 day'
          when $5::text = 'buffer' then now() + interval '4 days' else now() + interval '1 day' end,
        case when $5::text = 'buffer' then 1 when $5::text = 'overdue' then 3 else 0 end,
        'Synthetic demo checkpoint. Downstream baselines contain no fabricated CAD attachments; use the upload scenario for real files.', $8)
      on conflict (company_id, lead_id) do nothing returning id
    `, [input.companyId, lead.id, opportunity.id, `Demo: ${definition.title}`, definition.mode, input.designerId, input.headId, input.managerId])).rows[0];
    const job = inserted ?? await one<IdRow>(client, 'select id from design_jobs where company_id = $1 and lead_id = $2', [input.companyId, lead.id]);
    if (inserted && (definition.mode === 'buffer' || definition.mode === 'overdue')) {
      await client.query(`
        insert into design_deadline_extensions (company_id, design_job_id, sequence_number, previous_due_at, new_due_at, reason, requested_by_user_id)
        select company_id, id, n, designer_assigned_at + interval '2 days' + (n-1) * interval '3 days',
          designer_assigned_at + interval '2 days' + n * interval '3 days', 'Demo: waiting for updated site dimensions.', designer_user_id
        from design_jobs cross join generate_series(1, buffer_extensions_used) n where id = $1
      `, [job.id]);
    }
    if (inserted && definition.mode === 'customer') {
      const revision = await one<IdRow>(client, `
        insert into design_package_revisions (company_id, design_job_id, revision_number, title, change_summary, status, created_by_user_id, submitted_by_user_id, submitted_at)
        values ($1, $2, 1, 'Demo drawing revision awaiting customer response', 'Synthetic file-free decision checkpoint; no real drawing evidence claimed.', 'sent_to_customer', $3, $3, now()) returning id
      `, [input.companyId, job.id, input.designerId]);
      await client.query(`insert into design_review_actions (company_id, revision_id, decision, actor_user_id) values ($1, $2, 'approved', $3)`, [input.companyId, revision.id, input.headId]);
      await client.query(`update design_jobs set status = 'sent_to_customer', designer_completed_at = now() where id = $1`, [job.id]);
    }
    if (definition.mode === 'boq' || definition.mode === 'quote') {
      const design = await ensureCustomerApprovedDesign(client, {
        companyId: input.companyId, jobId: job.id, designerId: input.designerId, designHeadId: input.headId,
        salesUserId: input.executiveId, scenario: `Demo approved design: ${definition.code}`,
      });
      const boq = await ensureApprovedBoq(client, {
        companyId: input.companyId, jobId: job.id, designRevisionId: design.id, designerId: input.designerId,
        designHeadId: input.headId, costingUserId: input.purchaseId, purchaseHeadUserId: input.purchaseManagerId,
        adminApproverUserId: input.adminId, scenario: `Demo full catalogue: ${definition.code}`, referenceScope: true,
        status: 'boqStatus' in definition ? definition.boqStatus : 'approved',
      });
      if (definition.mode === 'quote') {
        const revision = await ensureQuotationScenario(client, {
          companyId: input.companyId, jobId: job.id, opportunityId: opportunity.id, boqRevisionId: boq.id,
          quotationNumber: `DEMO-${definition.code}`, customerName: 'Demo Acme Industrial Systems', title: `Demo: ${definition.title}`,
          status: 'quoteStatus' in definition ? definition.quoteStatus : 'approved',
          salesExecutiveId: definition.code === 'ADMIN-OVERRIDE' ? input.adminId : input.purchaseId,
          salesManagerId: input.purchaseManagerId, approverId: input.adminId,
          documentDetails: {
            senderName: `${input.companyName} (DEMO)`, senderAddress: 'Synthetic demonstration office, Ahmedabad',
            senderContact: 'demo.purchase.executive@example.test', recipientAddress: 'Demo Acme site, Ahmedabad, Gujarat',
            recipientGstin: '24ABCDE1234F1Z5', documentDate: new Date().toISOString().slice(0, 10),
            bankDetails: 'DEMO ONLY: replace with verified company bank details before real use.', signatory: 'Demo authorized signatory',
          },
        });
        if ('target' in definition) checkpoints.push({ jobId: job.id, revisionId: revision.id, target: definition.target });
      }
    }
    if (inserted) {
      const recipientId = definition.mode === 'head' ? input.headId : definition.mode === 'quote' ? input.purchaseId
        : definition.mode === 'boq' ? definition.boqStatus === 'purchase_review' ? input.purchaseManagerId
          : definition.boqStatus === 'admin_review' ? input.adminId : definition.boqStatus === 'draft' ? input.designerId : input.purchaseId
          : definition.mode === 'customer' ? input.executiveId : input.designerId;
      await client.query(`
        insert into notifications (company_id, recipient_user_id, type, severity, title, message, link, target_type, target_id, dedup_key)
        values ($1, $2, 'development.demo_checkpoint', 'info', $3, 'Synthetic test record. Open the workspace to inspect its current state.', $4, 'design_job', $5, $6)
        on conflict do nothing
      `, [input.companyId, recipientId, `Demo: ${definition.title}`, `/engineering/design-jobs/${job.id}${definition.mode === 'quote' ? '/quotations' : definition.mode === 'boq' ? '/boq' : ''}`, job.id, `demo-current:${definition.code}`]);
    }
    await client.query(`
      insert into outbox_jobs (company_id, type, payload, dedup_key, due_at)
      select company_id, 'engineering.design_deadline', jsonb_build_object('jobId', id::text, 'dueAt', design_due_at),
        'design-deadline:' || id::text || ':' || extract(epoch from design_due_at)::bigint, design_due_at
      from design_jobs where id = $1 and designer_completed_at is null and design_due_at is not null
      on conflict (company_id, type, dedup_key) do nothing
    `, [job.id]);
  }
  return { checkpoints, scenarioCount: definitions.length, quotationCount: definitions.filter((definition) => definition.mode === 'quote').length };
}

async function seed() {
  const passwordHash = await hashPassword(demoPassword);
  const client = await pool.connect();
  let stage = "schema validation";
  let transactionOpen = false;
  try {
    await client.query("begin");
    transactionOpen = true;
    await client.query("select pg_advisory_xact_lock(hashtext('fire-safety:demo-seed'))");
    const schema = await one<{ designJobs: string | null; quotationRevisions: string | null; surveyRevisions: string | null; procurementRequisitions: string | null; substitutionReviews: string | null }>(
      client,
      `
      select to_regclass('public.design_jobs')::text as "designJobs",
        to_regclass('public.quotation_revisions')::text as "quotationRevisions",
        to_regclass('public.survey_revisions')::text as "surveyRevisions",
        to_regclass('public.procurement_requisitions')::text as "procurementRequisitions",
        to_regclass('public.procurement_substitution_reviews')::text as "substitutionReviews"
    `,
    );
    if (!schema.designJobs || !schema.quotationRevisions || !schema.surveyRevisions || !schema.procurementRequisitions || !schema.substitutionReviews)
      throw new Error(
        "Demo seed requires current migrations. Run db:migrate first.",
      );
    const companies = await client.query<{
      id: string;
      name: string;
      timezone: string;
    }>(`
      select id, name, timezone from companies where is_active = true order by created_at
    `);
    if (companies.rowCount !== 1) {
      throw new Error(
        "Demo seed requires exactly one active company. Bootstrap the local database first.",
      );
    }
    const company = companies.rows[0]!;
    const requiredRoles = [
      "system_admin",
      "sales_manager",
      "sales_executive",
      "design_engineer",
      "design_head",
      "purchase_manager",
      "purchase_executive",
      "boq_admin_approver",
      "receiver",
    ];
    const roles = await client.query<{ code: string }>(
      `
      select code from roles where company_id = $1 and code = any($2::text[]) and is_active = true
    `,
      [company.id, requiredRoles],
    );
    const availableRoles = new Set(roles.rows.map((role) => role.code));
    const missingRoles = requiredRoles.filter(
      (role) => !availableRoles.has(role),
    );
    if (missingRoles.length > 0)
      throw new Error(
        `Demo seed is missing active roles: ${missingRoles.join(", ")}`,
      );

    stage = "demo users and role assignments";
    const userDefinitions = [
      {
        employeeCode: "DEMO-ADMIN",
        name: "Demo Administrator",
        email: "demo.admin@example.test",
        roles: [
          "system_admin",
          "sales_manager",
          "design_head",
          "purchase_manager",
          "boq_admin_approver",
        ],
      },
      {
        employeeCode: "DEMO-SM",
        name: "Demo Sales Manager",
        email: "demo.sales.manager@example.test",
        roles: ["sales_manager"],
      },
      {
        employeeCode: "DEMO-SE",
        name: "Demo Sales Executive",
        email: "demo.sales.executive@example.test",
        roles: ["sales_executive"],
      },
      {
        employeeCode: "DEMO-DE",
        name: "Demo Design Engineer",
        email: "demo.designer@example.test",
        roles: ["design_engineer"],
      },
      {
        employeeCode: "DEMO-DH",
        name: "Demo Design Head",
        email: "demo.design.head@example.test",
        roles: ["design_head"],
      },
      {
        employeeCode: "DEMO-PM",
        name: "Demo Purchase Manager",
        email: "demo.purchase.manager@example.test",
        roles: ["purchase_manager"],
      },
      {
        employeeCode: "DEMO-PE",
        name: "Demo Purchase Executive",
        email: "demo.purchase.executive@example.test",
        roles: ["purchase_executive"],
      },
      {
        employeeCode: "DEMO-RC",
        name: "Demo Receiver",
        email: "demo.receiver@example.test",
        roles: ["receiver"],
      },
    ];
    const userIds = new Map<string, string>();
    for (const definition of userDefinitions) {
      userIds.set(
        definition.employeeCode,
        await seedUser(client, company.id, passwordHash, definition),
      );
    }
    const adminId = userIds.get("DEMO-ADMIN")!;
    const managerId = userIds.get("DEMO-SM")!;
    const executiveId = userIds.get("DEMO-SE")!;
    const designerId = userIds.get("DEMO-DE")!;
    const designHeadId = userIds.get("DEMO-DH")!;
    const purchaseManagerId = userIds.get("DEMO-PM")!;
    const purchaseExecutiveId = userIds.get("DEMO-PE")!;

    stage = "lead classifications and service categories";
    for (const [code, name] of [
      ["NEW_PROJECT", "New project"],
      ["RENEWAL", "Renewal"],
      ["UPGRADE_RETROFIT", "Upgrade / retrofit"],
      ["MAINTENANCE_SERVICE", "Maintenance / service"],
      ["EXPANSION_EXTENSION", "Expansion / extension"],
      ["COMPLIANCE_AUDIT", "Compliance / audit"],
      ["REPAIR_REPLACEMENT", "Repair / replacement"],
      ["OTHER", "Other"],
    ] as const) await seedLeadClassification(client, "lead_purposes", company.id, adminId, code, name);
    for (const [code, name] of [
      ["INDUSTRIAL", "Industrial"],
      ["COMMERCIAL", "Commercial"],
      ["RESIDENTIAL", "Residential"],
      ["INSTITUTIONAL", "Institutional"],
      ["HEALTHCARE", "Healthcare"],
      ["HOSPITALITY", "Hospitality"],
      ["WAREHOUSE_LOGISTICS", "Warehouse / logistics"],
      ["INFRASTRUCTURE_PUBLIC", "Infrastructure / public"],
      ["MIXED_USE", "Mixed use"],
      ["OTHER", "Other"],
    ] as const) await seedLeadClassification(client, "market_sectors", company.id, adminId, code, name);
    const suppressionId = (
      await seedServiceCategory(
        client,
        company.id,
        adminId,
        "DEMO-SUP",
        "Fire suppression",
      )
    ).id;
    const detectionId = (
      await seedServiceCategory(
        client,
        company.id,
        adminId,
        "DEMO-DET",
        "Fire detection and alarm",
      )
    ).id;
    await seedServiceCategory(
      client,
      company.id,
      adminId,
      "DEMO-CMP",
      "Fire compliance consulting",
    );

    stage = "customers, contacts, addresses and sites";
    const customers = [
      await seedCustomer(client, company.id, adminId, {
        name: "Demo Acme Industrial Systems",
        legalName: "Demo Acme Industrial Systems Private Limited",
        gstin: "24ABCDE1234F1Z5",
        pan: "ABCDE1234F",
        contact: "Asha Mehta",
        email: "asha@demo-acme.example",
        phone: "+91 98765 40001",
        city: "Ahmedabad",
      }),
      await seedCustomer(client, company.id, adminId, {
        name: "Demo Sunrise Hospital",
        legalName: "Demo Sunrise Hospital Trust",
        gstin: "24BCDEF2345G1Z6",
        pan: "BCDEF2345G",
        contact: "Kunal Shah",
        email: "kunal@demo-sunrise.example",
        phone: "+91 98765 40002",
        city: "Gandhinagar",
      }),
      await seedCustomer(client, company.id, adminId, {
        name: "Demo Orion Warehousing",
        legalName: "Demo Orion Warehousing LLP",
        gstin: "24CDEFG3456H1Z7",
        pan: "CDEFG3456H",
        contact: "Priya Desai",
        email: "priya@demo-orion.example",
        phone: "+91 98765 40003",
        city: "Sanand",
      }),
    ];
    for (const customer of customers) {
      for (const userId of [adminId, managerId, executiveId]) {
        await client.query(
          `
          insert into customer_members (company_id, customer_id, user_id, role)
          values ($1, $2, $3, $4)
          on conflict (customer_id, user_id) do nothing
        `,
          [
            company.id,
            customer.customerId,
            userId,
            userId === executiveId ? "editor" : "owner",
          ],
        );
      }
    }

    stage = "leads and lead memberships";
    const leads = [
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-001",
        inquiryName: "Warehouse extinguisher requirement",
        companyName: "Demo Acme Industrial Systems",
        email: "lead1@example.test",
        stage: "new",
        serviceCategoryId: suppressionId,
        ownerUserId: executiveId,
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-002",
        inquiryName: "Hospital fire alarm upgrade",
        companyName: "Demo Sunrise Hospital",
        email: "lead2@example.test",
        stage: "contacted",
        serviceCategoryId: detectionId,
        purposeCode: "UPGRADE_RETROFIT",
        sectorCode: "HEALTHCARE",
        ownerUserId: managerId,
        ...customers[1],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-003",
        inquiryName: "Warehouse hydrant and detection design",
        companyName: "Demo Orion Warehousing",
        email: "lead3@example.test",
        stage: "qualified",
        qualificationNotes:
          "Customer confirmed the free design requirement. Ready to authorize design.",
        serviceCategoryId: detectionId,
        sectorCode: "WAREHOUSE_LOGISTICS",
        ownerUserId: executiveId,
        ...customers[2],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-004",
        inquiryName: "Factory suppression system design",
        companyName: "Demo Acme Industrial Systems",
        email: "lead4@example.test",
        stage: "design_authorized",
        qualificationNotes:
          "Free design authorized with separate designer and design head.",
        serviceCategoryId: suppressionId,
        sectorCode: "INDUSTRIAL",
        ownerUserId: managerId,
        ...customers[0],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-005",
        inquiryName: "Archived demo inquiry",
        companyName: "Demo Sunrise Hospital",
        email: "lead5@example.test",
        stage: "lost",
        lostReason: "Synthetic lost lead for filter testing.",
        serviceCategoryId: suppressionId,
        purposeCode: "RENEWAL",
        sectorCode: "HEALTHCARE",
        ownerUserId: managerId,
        ...customers[1],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-006",
        inquiryName: "Design package upload and review scenario",
        companyName: "Demo Sunrise Hospital",
        email: "lead6@example.test",
        stage: "design_authorized",
        qualificationNotes:
          "Start here as the designer to create a revision, upload real CAD/PDF files and submit it.",
        serviceCategoryId: detectionId,
        purposeCode: "UPGRADE_RETROFIT",
        sectorCode: "HEALTHCARE",
        ownerUserId: executiveId,
        ...customers[1],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-007",
        inquiryName: "Approved design ready for BOQ scenario",
        companyName: "Demo Orion Warehousing",
        email: "lead7@example.test",
        stage: "design_authorized",
        qualificationNotes:
          "Synthetic customer-approved design baseline ready for BOQ creation.",
        serviceCategoryId: detectionId,
        sectorCode: "WAREHOUSE_LOGISTICS",
        ownerUserId: executiveId,
        ...customers[2],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-008",
        inquiryName: "Quotation awaiting independent review scenario",
        companyName: "Demo Acme Industrial Systems",
        email: "lead8@example.test",
        stage: "design_authorized",
        qualificationNotes:
          "Synthetic approved design and BOQ with a submitted quotation.",
        serviceCategoryId: suppressionId,
        sectorCode: "INDUSTRIAL",
        ownerUserId: executiveId,
        ...customers[0],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-009",
        inquiryName: "Approved quotation ready to issue scenario",
        companyName: "Demo Sunrise Hospital",
        email: "lead9@example.test",
        stage: "design_authorized",
        qualificationNotes:
          "Synthetic independently approved quotation ready for issue and customer decision.",
        serviceCategoryId: detectionId,
        purposeCode: "RENEWAL",
        sectorCode: "HEALTHCARE",
        ownerUserId: executiveId,
        ...customers[1],
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-010",
        inquiryName: "Pagination example: retail extinguishers",
        companyName: "Demo Retail One",
        email: "lead10@example.test",
        stage: "new",
        serviceCategoryId: suppressionId,
        sectorCode: "COMMERCIAL",
        ownerUserId: executiveId,
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-011",
        inquiryName: "Pagination example: office alarm",
        companyName: "Demo Office Two",
        email: "lead11@example.test",
        stage: "contacted",
        serviceCategoryId: detectionId,
        sectorCode: "COMMERCIAL",
        ownerUserId: managerId,
      }),
      await seedLead(client, company.id, adminId, {
        leadNumber: "DEMO-LEAD-012",
        inquiryName: "Pagination example: declined consultation",
        companyName: "Demo Office Three",
        email: "lead12@example.test",
        stage: "lost",
        lostReason: "Synthetic lost record for pagination and filtering.",
        serviceCategoryId: suppressionId,
        purposeCode: "OTHER",
        sectorCode: "COMMERCIAL",
        ownerUserId: executiveId,
      }),
    ];
    const leadOwnerIds = [
      executiveId,
      managerId,
      executiveId,
      managerId,
      managerId,
      executiveId,
      executiveId,
      executiveId,
      executiveId,
      executiveId,
      managerId,
      executiveId,
    ];
    for (const [index, lead] of leads.entries()) {
      const ownerId = leadOwnerIds[index]!;
      await addLeadMember(client, company.id, lead.id, ownerId, "owner");
      await addLeadMember(client, company.id, lead.id, adminId, "collaborator");
      if (ownerId !== managerId)
        await addLeadMember(
          client,
          company.id,
          lead.id,
          managerId,
          "collaborator",
        );
    }

    stage = "CRM activities";
    const activities = [
      [
        leads[0]!.id,
        "call",
        "Demo call: customer requested a site discussion.",
        executiveId,
        "-2 days",
      ],
      [
        leads[1]!.id,
        "meeting",
        "Demo meeting: alarm panel replacement options reviewed.",
        managerId,
        "-1 day",
      ],
      [
        leads[2]!.id,
        "note",
        "Demo note: qualification completed and free design discussed.",
        executiveId,
        "-3 hours",
      ],
    ] as const;
    for (const [leadId, type, summary, creatorId, offset] of activities) {
      await client.query(
        `
        insert into crm_activities (company_id, lead_id, type, summary, occurred_at, created_by_user_id)
        select $1, $2, $3::crm_activity_type, $4::text, now() + $5::interval, $6
        where not exists (
          select 1 from crm_activities where lead_id = $2 and summary = $4::text
        )
      `,
        [company.id, leadId, type, summary, offset, creatorId],
      );
    }

    stage = "opportunities and design handoff";
    const opportunityDefinitions = [
      {
        lead: leads[2]!, customer: customers[2]!, ownerId: executiveId,
        title: "Demo Orion fire-safety opportunity",
      },
      {
        lead: leads[3]!, customer: customers[0]!, ownerId: managerId,
        title: "Demo Acme quotation creation scenario",
      },
      {
        lead: leads[5]!, customer: customers[1]!, ownerId: executiveId,
        title: "Demo design package workflow scenario",
      },
      {
        lead: leads[6]!, customer: customers[2]!, ownerId: executiveId,
        title: "Demo BOQ creation workflow scenario",
      },
      {
        lead: leads[7]!, customer: customers[0]!, ownerId: executiveId,
        title: "Demo quotation review scenario",
      },
      {
        lead: leads[8]!, customer: customers[1]!, ownerId: executiveId,
        title: "Demo quotation issue scenario",
      },
    ];
    const opportunities: IdRow[] = [];
    for (const definition of opportunityDefinitions) {
      const opportunity = await seedOpportunity(
        client,
        company.id,
        definition.ownerId,
        definition.lead.id,
        definition.customer,
        definition.title,
      );
      opportunities.push(opportunity);
      const members = [
        [definition.ownerId, "owner"],
        [adminId, "viewer"],
        [managerId, "sales"],
      ] as const;
      for (const [userId, role] of members) {
        await client.query(
          `
          insert into opportunity_members (company_id, opportunity_id, user_id, role)
          values ($1, $2, $3, $4)
          on conflict (opportunity_id, user_id) do nothing
        `,
          [company.id, opportunity.id, userId, role],
        );
      }
    }
    const designScenarioDefinitions = [
      {
        lead: leads[3]!, opportunity: opportunities[1]!,
        title: "Demo approved BOQ ready for quotation",
        authorizedById: managerId,
      },
      {
        lead: leads[5]!, opportunity: opportunities[2]!,
        title: "Demo fresh design package workflow",
        authorizedById: managerId,
      },
      {
        lead: leads[6]!, opportunity: opportunities[3]!,
        title: "Demo approved design ready for BOQ",
        authorizedById: managerId,
      },
      {
        lead: leads[7]!, opportunity: opportunities[4]!,
        title: "Demo submitted quotation workflow",
        authorizedById: managerId,
      },
      {
        lead: leads[8]!, opportunity: opportunities[5]!,
        title: "Demo approved quotation workflow",
        authorizedById: managerId,
      },
    ];
    const designJobs: IdRow[] = [];
    for (const definition of designScenarioDefinitions) {
      designJobs.push(
        await seedDesignJob(client, {
          companyId: company.id,
          leadId: definition.lead.id,
          opportunityId: definition.opportunity.id,
          title: definition.title,
          designerId,
          designHeadId,
          authorizedById: definition.authorizedById,
        }),
      );
    }

    stage = "optional survey draft";
    await ensureSurveyDraft(client, {
      companyId: company.id,
      jobId: designJobs[2]!.id,
      designerId,
    });

    stage = "employee notifications";
    for (const notification of [
      {
        recipientId: designerId,
        type: "engineering.design_assigned",
        severity: "info",
        title: "Demo design task assigned",
        message: "Open your demo design assignment to inspect its current timer, buffer allowance and status.",
        jobId: designJobs[1]!.id,
        dedupKey: `demo-design-assigned:${designJobs[2]!.id}`,
      },
      {
        recipientId: designHeadId,
        type: "engineering.design_approved",
        severity: "info",
        title: "Demo approved design history",
        message: "Inspect internal review and customer-decision history for this seeded design.",
        jobId: designJobs[0]!.id,
        dedupKey: `demo-design-review:${designJobs[0]!.id}`,
      },
      {
        recipientId: purchaseManagerId,
        type: "development.demo_checkpoint",
        severity: "warning",
        title: "Demo BOQ and quotation workspace",
        message: "Inspect the seeded BOQ and purchase-contributed quotation; the quotation starts with administrator review pending.",
        jobId: designJobs[3]!.id,
        dedupKey: `demo-boq-review:${designJobs[1]!.id}`,
      },
    ]) {
      await client.query(`
        insert into notifications (
          company_id, recipient_user_id, type, severity, title, message,
          link, target_type, target_id, dedup_key
        ) values ($1, $2, $3, $4::notification_severity, $5, $6, $7, 'design_job', $8, $9)
        on conflict (company_id, recipient_user_id, dedup_key) do update
          set title = excluded.title, message = excluded.message, type = excluded.type,
              link = excluded.link, target_id = excluded.target_id
      `, [company.id, notification.recipientId, notification.type, notification.severity, notification.title,
        notification.message, `/engineering/design-jobs/${notification.jobId}`, notification.jobId, notification.dedupKey]);
    }

    stage = "reminders and due jobs";
    const reminderDefinitions = [
      [
        leads[0]!.id,
        executiveId,
        "Demo: call about extinguisher quantities",
        "weekly",
        "1 day",
      ],
      [
        leads[1]!.id,
        managerId,
        "Demo: review alarm upgrade proposal",
        "none",
        "2 days",
      ],
    ] as const;
    for (const [
      leadId,
      assigneeId,
      title,
      recurrence,
      offset,
    ] of reminderDefinitions) {
      await client.query(
        `
        insert into reminder_rules (
          company_id, lead_id, assignee_user_id, title, timezone, recurrence, created_by_user_id
        )
        select $1, $2, $3, $4::text, $5, $6::reminder_recurrence, $7
        where not exists (
          select 1 from reminder_rules where company_id = $1 and lead_id = $2 and title = $4::text
        )
      `,
        [
          company.id,
          leadId,
          assigneeId,
          title,
          company.timezone,
          recurrence,
          adminId,
        ],
      );
      const rule = await one<IdRow>(
        client,
        `
        select id from reminder_rules where company_id = $1 and lead_id = $2 and title = $3 order by created_at limit 1
      `,
        [company.id, leadId, title],
      );
      const existingOccurrence = await client.query<IdRow>(
        `
        select id from reminder_occurrences where rule_id = $1 order by created_at limit 1
      `,
        [rule.id],
      );
      let occurrenceId = existingOccurrence.rows[0]?.id;
      if (!occurrenceId) {
        occurrenceId = (
          await one<IdRow>(
            client,
            `
          insert into reminder_occurrences (
            company_id, rule_id, lead_id, assignee_user_id, due_at
          ) values ($1, $2, $3, $4, now() + $5::interval)
          returning id
        `,
            [company.id, rule.id, leadId, assigneeId, offset],
          )
        ).id;
      }
      await client.query(
        `
        insert into outbox_jobs (company_id, type, payload, dedup_key, due_at)
        select $1, 'crm.reminder_due', jsonb_build_object('occurrenceId', occurrence.id::text),
          'reminder:' || occurrence.id::text, occurrence.due_at
        from reminder_occurrences occurrence where occurrence.id = $2
        on conflict (company_id, type, dedup_key) do nothing
      `,
        [company.id, occurrenceId],
      );
    }

    stage = "vendor and item masters";
    await seedMasterData(client, company.id, adminId);
    await seedReferenceCatalogue(client, company.id, adminId);
    stage = "sector BOQ templates";
    await seedBoqTemplates(
      client,
      company.id,
      adminId,
      purchaseExecutiveId,
      purchaseManagerId,
      adminId,
    );
    stage = "independent P3 workflow scenarios";
    const downstreamDesigns: Array<IdRow | undefined> = [];
    for (const [jobIndex, scenario] of [
      [0, "Demo approved design for quotation creation"],
      [2, "Demo approved design for BOQ creation"],
      [3, "Demo approved design for quotation review"],
      [4, "Demo approved design for quotation issue"],
    ] as const) {
      downstreamDesigns[jobIndex] = await ensureCustomerApprovedDesign(client, {
        companyId: company.id,
        jobId: designJobs[jobIndex]!.id,
        designerId,
        designHeadId,
        salesUserId: managerId,
        scenario,
      });
    }
    stage = "project register";
    const demoProject = await one<IdRow>(client, `
      insert into projects (
        company_id, project_number, opportunity_id, customer_id, site_id, title,
        start_date, target_completion_date, start_reason, started_by_user_id
      )
      select $1, 'DEMO-PRJ-001', opportunity.id, opportunity.customer_id, opportunity.site_id,
        'Demo unawarded project started from approved design', current_date, current_date + 30,
        'Synthetic local example proving that approved design can start work before quotation acceptance.', $3
      from opportunities opportunity
      where opportunity.id = $2 and opportunity.site_id is not null
      on conflict (company_id, opportunity_id) do update set title = excluded.title
      returning id
    `, [company.id, opportunities[3]!.id, managerId]);
    for (const [userId, role] of [[managerId, 'project_manager'], [designerId, 'design'], [designHeadId, 'design'], [executiveId, 'sales']] as const) {
      await client.query(`
        insert into project_members (company_id, project_id, user_id, role, assigned_by_user_id)
        values ($1, $2, $3, $4, $5)
        on conflict (project_id, user_id) do nothing
      `, [company.id, demoProject.id, userId, role, managerId]);
    }
    await client.query(`
      insert into project_design_baselines (
        company_id, project_id, design_job_id, design_revision_id,
        design_customer_decision_id, customer_evidence_snapshot, created_by_user_id
      )
      select $1, $2, $3, revision.id, decision.id, decision.evidence_reference, $5
      from design_package_revisions revision
      join design_customer_decisions decision on decision.revision_id = revision.id and decision.decision = 'approved'
      where revision.id = $4
      on conflict (project_id) do nothing
    `, [company.id, demoProject.id, designJobs[2]!.id, downstreamDesigns[2]!.id, managerId]);
    await client.query(`
      insert into notifications (company_id, recipient_user_id, type, severity, title, message, link, target_type, target_id, dedup_key)
      values ($1, $2, 'project.started', 'success', 'Demo project assigned',
        'An unawarded project was started from an approved design and assigned to you.',
        '/projects/' || $3::text, 'project', $3::uuid, 'demo-project-started:' || $3::text)
      on conflict (company_id, recipient_user_id, dedup_key) do nothing
    `, [company.id, designerId, demoProject.id]);
    const downstreamBoqs: Array<IdRow | undefined> = [];
    for (const [jobIndex, scenario] of [
      [0, "Demo approved BOQ ready for quotation"],
      [3, "Demo approved BOQ for quotation review"],
      [4, "Demo approved BOQ for quotation issue"],
    ] as const) {
      downstreamBoqs[jobIndex] = await ensureApprovedBoq(client, {
        companyId: company.id,
        jobId: designJobs[jobIndex]!.id,
        designRevisionId: downstreamDesigns[jobIndex]!.id,
        designerId,
        designHeadId,
        costingUserId: purchaseExecutiveId,
        purchaseHeadUserId: purchaseManagerId,
        adminApproverUserId: adminId,
        scenario,
      });
    }
    stage = "P4 procurement comparison scenario";
    const procurementProject = await one<IdRow>(client, `
      insert into projects (
        company_id, project_number, opportunity_id, customer_id, site_id, title,
        start_date, target_completion_date, start_reason, started_by_user_id
      ) select $1, 'DEMO-PRJ-PROC-001', opportunity.id, opportunity.customer_id, opportunity.site_id,
        'Demo project ready for vendor comparison', current_date, current_date + 45,
        'Synthetic approved-design project for procurement sourcing tests; commercial award is independent.', $3
      from opportunities opportunity where opportunity.id = $2 and opportunity.site_id is not null
      on conflict (company_id, opportunity_id) do update set title = excluded.title
      returning id
    `, [company.id, opportunities[4]!.id, managerId]);
    for (const [userId, role] of [[managerId, 'project_manager'], [designerId, 'design'], [designHeadId, 'design'], [purchaseExecutiveId, 'purchase'], [purchaseManagerId, 'purchase']] as const) {
      await client.query(`
        insert into project_members (company_id, project_id, user_id, role, assigned_by_user_id)
        values ($1, $2, $3, $4, $5) on conflict (project_id, user_id) do nothing
      `, [company.id, procurementProject.id, userId, role, managerId]);
    }
    await client.query(`
      insert into project_design_baselines (
        company_id, project_id, design_job_id, design_revision_id,
        design_customer_decision_id, customer_evidence_snapshot, created_by_user_id
      ) select $1, $2, $3, revision.id, decision.id, decision.evidence_reference, $5
      from design_package_revisions revision
      join design_customer_decisions decision on decision.revision_id = revision.id and decision.decision = 'approved'
      where revision.id = $4 on conflict (project_id) do nothing
    `, [company.id, procurementProject.id, designJobs[3]!.id, downstreamDesigns[3]!.id, managerId]);
    await ensureProcurementScenario(client, {
      companyId: company.id,
      projectId: procurementProject.id,
      boqRevisionId: downstreamBoqs[3]!.id,
      buyerId: purchaseExecutiveId,
      managerId: purchaseManagerId,
    });
    await ensureProcurementScenario(client, {
      companyId: company.id,
      projectId: procurementProject.id,
      boqRevisionId: downstreamBoqs[3]!.id,
      buyerId: purchaseExecutiveId,
      managerId: purchaseManagerId,
      scenario: 'substitution',
    });
    await ensureProcurementScenario(client, {
      companyId: company.id,
      projectId: procurementProject.id,
      boqRevisionId: downstreamBoqs[3]!.id,
      buyerId: purchaseExecutiveId,
      managerId: purchaseManagerId,
      scenario: 'awarded_po',
    });
    await ensurePriceInquiryScenario(client, {
      companyId: company.id,
      userId: purchaseExecutiveId,
    });
    await ensurePurchaseOrderScenario(client, {
      companyId: company.id,
      projectId: procurementProject.id,
      buyerId: purchaseExecutiveId,
      managerId: purchaseManagerId,
      adminId,
    });
    await ensureQuotationScenario(client, {
      companyId: company.id,
      jobId: designJobs[3]!.id,
      opportunityId: opportunities[4]!.id,
      boqRevisionId: downstreamBoqs[3]!.id,
      quotationNumber: "DEMO-QUO-REVIEW",
      customerName: "Demo Acme Industrial Systems",
      title: "Demo quotation awaiting independent approval",
      status: "submitted",
      salesExecutiveId: purchaseExecutiveId,
      salesManagerId: purchaseManagerId,
      approverId: adminId,
    });
    await ensureQuotationScenario(client, {
      companyId: company.id,
      jobId: designJobs[4]!.id,
      opportunityId: opportunities[5]!.id,
      boqRevisionId: downstreamBoqs[4]!.id,
      quotationNumber: "DEMO-QUO-ISSUE",
      customerName: "Demo Sunrise Hospital",
      title: "Demo approved quotation ready to issue",
      status: "approved",
      salesExecutiveId: purchaseExecutiveId,
      salesManagerId: purchaseManagerId,
      approverId: adminId,
    });
    stage = 'latest catalogue and workflow checkpoints';
    const currentWorkflows = await seedCurrentWorkflows(client, {
      companyId: company.id, companyName: company.name, adminId, managerId, executiveId, designerId,
      headId: designHeadId, purchaseId: purchaseExecutiveId, purchaseManagerId, serviceCategoryId: suppressionId,
      customer: customers[0]!,
    });
    stage = "seed audit event";
    await client.query(
      `
      insert into audit_events (company_id, actor_user_id, action, target_type, request_id, metadata)
      values ($1, $2, 'development.demo_seeded', 'company', 'demo-seed',
        jsonb_build_object('synthetic', true, 'userCount', $3::int, 'leadCount', $4::int))
    `,
      [company.id, adminId, userDefinitions.length, leads.length],
    );
    await client.query("commit");
    transactionOpen = false;
    stage = 'issued PDF and accepted-quotation checkpoints';
    await finishDemoQuotations(client, { companyId: company.id, purchaseId: purchaseExecutiveId, salesId: executiveId, adminId }, currentWorkflows.checkpoints);

    process.stdout.write(
      [
        `Demo seed complete for ${company.name}.`,
        `Created/refreshed ${userDefinitions.length} demo users, ${customers.length} customers and ${leads.length + currentWorkflows.scenarioCount} lead fixtures.`,
        `Ensured ${opportunities.length + currentWorkflows.scenarioCount} assigned opportunities, ${designJobs.length + currentWorkflows.scenarioCount} design jobs, 1 survey draft, 2 projects, ${2 + currentWorkflows.quotationCount} quotation checkpoints and 2 sourcing comparisons.`,
        `Added ${referenceProducts.length} BOQ reference products and ${currentWorkflows.scenarioCount} DEMO-LATEST-* checkpoints, including full-catalogue PDFs and accepted payment-plan examples.`,
        "Workflow starts: DEMO-LEAD-003 authorize design; 006 upload/review design; 007 finalize the survey draft and build BOQ; 004 build quotation; 008 approve quotation; 009 issue and record decision; DEMO-REQ-001 compare/select a supplier; DEMO-REQ-SUB-001 review a technical deviation as design head.",
        "Login: demo.admin@example.test",
        `Password: ${demoPassword}`,
        "All demo user emails are printed in README.md.",
      ].join("\n") + "\n",
    );
  } catch (error) {
    if (transactionOpen) await client.query("rollback");
    process.stderr.write(`Demo seed stage: ${stage}\n`);
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error: unknown) => {
    const databaseError = error as {
      message?: string;
      code?: string;
      detail?: string;
      position?: string;
    };
    const details = [
      databaseError.message ?? "Demo seed failed.",
      databaseError.code,
      databaseError.detail,
      databaseError.position,
    ]
      .filter(Boolean)
      .join(" | ");
    process.stderr.write(`${details}\n`);
    process.exitCode = 1;
  })
  .finally(async () => { await closePdfBrowser(); await closeDatabase(); });
