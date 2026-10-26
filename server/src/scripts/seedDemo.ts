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
      ["DEMO-AGNI", "DEMO-SENTINEL"],
    ],
    [
      "DEMO-ABC-06",
      "ABC Fire Extinguisher 6 kg",
      "6 kg ABC dry powder extinguisher",
      "DEMO-EXT",
      "DEMO-NOS",
      ["DEMO-AGNI", "DEMO-VELOCITY"],
    ],
    [
      "DEMO-SMOKE",
      "Addressable Smoke Detector",
      "Addressable optical smoke detector",
      "DEMO-DET",
      "DEMO-NOS",
      ["DEMO-SENTINEL", "DEMO-VELOCITY"],
    ],
    [
      "DEMO-MS-P65",
      "MS Fire Pipe 65 mm",
      "C-class heavy MS pipe",
      "DEMO-PIP",
      "DEMO-MTR",
      ["DEMO-AGNI", "DEMO-VELOCITY"],
    ],
    [
      "DEMO-INSTALL",
      "Installation and commissioning",
      "Complete demo installation lot",
      "DEMO-PIP",
      "DEMO-LOT",
      ["DEMO-AGNI"],
    ],
  ] as const;
  for (const [code, name, specification, categoryCode, unitCode, allowedBrandCodes] of items) {
    const item = await one<IdRow>(
      client,
      `
      insert into items (
        company_id, code, name, name_normalized, specification, category_id, unit_id, created_by_user_id
      ) values ($1, $2, $3::text, lower($3::text), $4, $5, $6, $7)
      on conflict (company_id, code) do update
        set name = excluded.name, name_normalized = excluded.name_normalized,
            specification = excluded.specification, category_id = excluded.category_id,
            unit_id = excluded.unit_id, status = 'active', updated_at = now()
      returning id
    `,
      [
        companyId,
        code,
        name,
        specification,
        categoryIds.get(categoryCode),
        unitIds.get(unitCode),
        actorId,
      ],
    );
    for (const brandCode of allowedBrandCodes) {
      await client.query(`
        insert into item_brands (company_id, item_id, brand_id, created_by_user_id)
        values ($1, $2, $3, $4) on conflict do nothing
      `, [companyId, item.id, brandIds.get(brandCode), actorId]);
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
    for (const [index, itemCode] of itemCodes.entries()) {
      await client.query(`
        insert into boq_template_items (company_id, template_id, item_id, section, sort_order)
        select $1, $2, item.id, category.name, $4
        from items item inner join item_categories category on category.id = item.category_id
        where item.company_id = $1 and item.code = $3
      `, [companyId, template.id, itemCode, index + 1]);
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
      where company_id = $1 and design_job_id = $2 and status = 'customer_approved'
      order by revision_number desc limit 1
    `,
      [input.companyId, input.jobId],
    )
  ).rows[0];
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
    scenario: string;
  },
) {
  let revision = (
    await client.query<IdRow>(
      `
      select id from boq_revisions
      where company_id = $1 and design_job_id = $2 and status = 'approved'
      order by revision_number desc limit 1
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
      status, created_by_user_id, submitted_by_user_id, submitted_at
    ) select $1, $2, $3, coalesce(max(revision_number), 0) + 1,
      $4, 'Complete synthetic technical scope for downstream local testing.',
      'approved', $5, $5, now()
    from boq_revisions where design_job_id = $2 returning id
  `,
    [
      input.companyId,
      input.jobId,
      input.designRevisionId,
      input.scenario,
      input.designerId,
    ],
  );
  const demoItem = await one<{
    id: string;
    unit_id: string;
    code: string;
    name: string;
    specification: string;
    symbol: string;
  }>(
    client,
    `
    select item.id, item.unit_id, item.code, item.name, item.specification, unit.symbol
    from items item inner join units unit on unit.id = item.unit_id
    where item.company_id = $1 and item.code = 'DEMO-SMOKE'
  `,
    [input.companyId],
  );
  const line = await one<IdRow>(
    client,
    `
    insert into boq_lines (
      company_id, boq_revision_id, line_number, section, item_id, item_code_snapshot,
      item_name_snapshot, specification_snapshot, unit_id, unit_symbol_snapshot, quantity, notes
    ) values ($1, $2, 1, 'Fire detection', $3, $4, $5, $6, $7, $8,
      '12.0000', 'Synthetic full-scope BOQ line.') returning id
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
    ],
  );
  await client.query(
    `
    insert into estimate_cost_lines (
      company_id, boq_revision_id, boq_line_id, line_number, category, description,
      quantity, unit_rate, line_total, notes
    ) values ($1, $2, $3, 1, 'material', 'Synthetic detector material cost',
      '12.0000', '850.00', '10200.00', 'Demo cost only.')
  `,
    [input.companyId, revision.id, line.id],
  );
  await client.query(
    `
    insert into boq_review_actions (company_id, boq_revision_id, decision, actor_user_id)
    values ($1, $2, 'approved', $3) on conflict (boq_revision_id) do nothing
  `,
    [input.companyId, revision.id, input.designHeadId],
  );
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
    status: "submitted" | "approved";
    salesExecutiveId: string;
    salesManagerId: string;
    approverId: string;
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
  if (revision) {
    await client.query(`
      update quotation_lines quote_line
      set brand_id = chosen.id, brand_name_snapshot = chosen.name, updated_at = now()
      from boq_lines boq_line
      join lateral (
        select brand.id, brand.name from item_brands assignment
        join brands brand on brand.id = assignment.brand_id and brand.status = 'active'
        where assignment.item_id = boq_line.item_id
        order by brand.name limit 1
      ) chosen on true
      where quote_line.quotation_revision_id = $1 and quote_line.boq_line_id = boq_line.id
    `, [revision.id]);
    return revision;
  }

  revision = await one<IdRow>(
    client,
    `
    insert into quotation_revisions (
      company_id, quotation_id, boq_revision_id, revision_number, status, title,
      customer_name_snapshot, currency, validity_days, exclusions, delivery_terms,
      payment_terms, subtotal, line_discount_total, additional_discount, tax_amount,
      rounding_adjustment, grand_total, cash_percentage, non_cash_percentage,
      created_by_user_id, submitted_by_user_id, submitted_at, approved_by_user_id, approved_at
    ) values (
      $1, $2, $3, 1, $4::quotation_revision_status, $5, $6, 'INR', 30,
      'Civil works and statutory fees are excluded from this synthetic quotation.',
      'Delivery within 4 weeks of written release.',
      '40% cash and 60% non-cash payment plan; this is not proof of receipt.',
      '14400.00', '600.00', '300.00', '0.00', '0.00', '13500.00',
      '40.00', '60.00', $7, $7, now(),
      case when $4::text = 'approved' then $8::uuid else null end,
      case when $4::text = 'approved' then now() else null end
    ) returning id
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
    ],
  );
  await client.query(
    `
    insert into quotation_lines (
      company_id, quotation_revision_id, boq_line_id, line_number, section_snapshot,
      item_code_snapshot, item_name_snapshot, specification_snapshot, unit_symbol_snapshot,
      brand_id, brand_name_snapshot, quantity, unit_rate, discount_amount, line_subtotal, line_total, notes
    )
    select $1, $2, line.id, line.line_number, line.section, line.item_code_snapshot,
      line.item_name_snapshot, line.specification_snapshot, line.unit_symbol_snapshot,
      chosen.id, chosen.name, line.quantity, '1200.00', '600.00', '14400.00', '13800.00',
      'Synthetic selling price for workflow testing.'
    from boq_lines line
    join lateral (
      select brand.id, brand.name from item_brands assignment
      join brands brand on brand.id = assignment.brand_id and brand.status = 'active'
      where assignment.item_id = line.item_id
      order by brand.name limit 1
    ) chosen on true
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

async function seed() {
  const passwordHash = await hashPassword(demoPassword);
  const client = await pool.connect();
  let stage = "schema validation";
  try {
    await client.query("begin");
    const schema = await one<{ designJobs: string | null; quotationRevisions: string | null }>(
      client,
      `
      select to_regclass('public.design_jobs')::text as "designJobs",
        to_regclass('public.quotation_revisions')::text as "quotationRevisions"
    `,
    );
    if (!schema.designJobs || !schema.quotationRevisions)
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

    stage = "employee notifications";
    for (const notification of [
      {
        recipientId: designerId,
        type: "engineering.design_assigned",
        severity: "info",
        title: "Demo design task assigned",
        message: "A design task is due tomorrow. Open it to test the live timer and buffer request.",
        jobId: designJobs[2]!.id,
        dedupKey: `demo-design-assigned:${designJobs[2]!.id}`,
      },
      {
        recipientId: designHeadId,
        type: "engineering.design_submitted",
        severity: "info",
        title: "Demo design ready for review",
        message: "A submitted design package is waiting for design-head review.",
        jobId: designJobs[0]!.id,
        dedupKey: `demo-design-review:${designJobs[0]!.id}`,
      },
      {
        recipientId: purchaseManagerId,
        type: "engineering.boq_ready_for_purchase_review",
        severity: "warning",
        title: "Demo BOQ needs purchase review",
        message: "Costing is complete and the BOQ is ready for purchase-head review.",
        jobId: designJobs[1]!.id,
        dedupKey: `demo-boq-review:${designJobs[1]!.id}`,
      },
    ]) {
      await client.query(`
        insert into notifications (
          company_id, recipient_user_id, type, severity, title, message,
          link, target_type, target_id, dedup_key
        ) values ($1, $2, $3, $4::notification_severity, $5, $6, $7, 'design_job', $8, $9)
        on conflict (company_id, recipient_user_id, dedup_key) do nothing
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
        scenario,
      });
    }
    await ensureQuotationScenario(client, {
      companyId: company.id,
      jobId: designJobs[3]!.id,
      opportunityId: opportunities[4]!.id,
      boqRevisionId: downstreamBoqs[3]!.id,
      quotationNumber: "DEMO-QUO-REVIEW",
      customerName: "Demo Acme Industrial Systems",
      title: "Demo quotation awaiting independent approval",
      status: "submitted",
      salesExecutiveId: executiveId,
      salesManagerId: managerId,
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
      salesExecutiveId: executiveId,
      salesManagerId: managerId,
      approverId: adminId,
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

    process.stdout.write(
      [
        `Demo seed complete for ${company.name}.`,
        `Created/refreshed ${userDefinitions.length} demo users, ${customers.length} customers and ${leads.length} leads.`,
        `Ensured ${opportunities.length} assigned opportunities, ${designJobs.length} design jobs, 1 project and 2 quotation checkpoints.`,
        "Workflow starts: DEMO-LEAD-003 authorize design; 006 upload/review design; 007 build BOQ; 004 build quotation; 008 approve quotation; 009 issue and record decision.",
        "Login: demo.admin@example.test",
        `Password: ${demoPassword}`,
        "All demo user emails are printed in README.md.",
      ].join("\n") + "\n",
    );
  } catch (error) {
    await client.query("rollback");
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
  .finally(closeDatabase);
