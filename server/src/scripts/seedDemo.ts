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

async function seedCustomer(
  client: PoolClient,
  companyId: string,
  actorId: string,
  input: {
    name: string;
    legalName: string;
    taxIdentifier: string;
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
      company_id, display_name, display_name_normalized, legal_name, tax_identifier, created_by_user_id
    )
    select $1, $2, $3::text, $4, $5, $6
    where not exists (
      select 1 from customers where company_id = $1 and display_name_normalized = $3::text
    )
  `,
    [
      companyId,
      input.name,
      normalizedName,
      input.legalName,
      input.taxIdentifier,
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
    ownerUserId: string;
    customerId?: string;
    contactId?: string;
    siteId?: string;
  },
) {
  await client.query(
    `
    insert into leads (
      company_id, lead_number, inquiry_name, company_name, contact_name,
      phone, phone_normalized, email, email_normalized, address, source,
      service_category_id, owner_user_id, customer_id, primary_contact_id, site_id,
      stage, lost_reason, qualification_notes, created_by_user_id
    ) values (
      $1, $2, $3, $4, 'Demo contact', '+91 90000 00000', '+919000000000', $5::text, lower($5::text),
      'Demo address, Ahmedabad', 'Demo seed', $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    on conflict (company_id, lead_number) do nothing
  `,
    [
      companyId,
      input.leadNumber,
      input.inquiryName,
      input.companyName,
      input.email,
      input.serviceCategoryId,
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

  const items = [
    [
      "DEMO-CO2-45",
      "CO2 Fire Extinguisher 4.5 kg",
      "4.5 kg CO2 extinguisher",
      "DEMO-EXT",
      "DEMO-NOS",
    ],
    [
      "DEMO-ABC-06",
      "ABC Fire Extinguisher 6 kg",
      "6 kg ABC dry powder extinguisher",
      "DEMO-EXT",
      "DEMO-NOS",
    ],
    [
      "DEMO-SMOKE",
      "Addressable Smoke Detector",
      "Addressable optical smoke detector",
      "DEMO-DET",
      "DEMO-NOS",
    ],
    [
      "DEMO-MS-P65",
      "MS Fire Pipe 65 mm",
      "C-class heavy MS pipe",
      "DEMO-PIP",
      "DEMO-MTR",
    ],
    [
      "DEMO-INSTALL",
      "Installation and commissioning",
      "Complete demo installation lot",
      "DEMO-PIP",
      "DEMO-LOT",
    ],
  ] as const;
  for (const [code, name, specification, categoryCode, unitCode] of items) {
    await client.query(
      `
      insert into items (
        company_id, code, name, name_normalized, specification, category_id, unit_id, created_by_user_id
      ) values ($1, $2, $3::text, lower($3::text), $4, $5, $6, $7)
      on conflict (company_id, code) do update
        set name = excluded.name, name_normalized = excluded.name_normalized,
            specification = excluded.specification, category_id = excluded.category_id,
            unit_id = excluded.unit_id, status = 'active', updated_at = now()
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

async function seed() {
  const passwordHash = await hashPassword(demoPassword);
  const client = await pool.connect();
  let stage = "schema validation";
  try {
    await client.query("begin");
    const schema = await one<{ designJobs: string | null }>(
      client,
      `
      select to_regclass('public.design_jobs')::text as "designJobs"
    `,
    );
    if (!schema.designJobs)
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

    stage = "service categories";
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
        taxIdentifier: "24DEMO0001A1Z1",
        contact: "Asha Mehta",
        email: "asha@demo-acme.example",
        phone: "+91 98765 40001",
        city: "Ahmedabad",
      }),
      await seedCustomer(client, company.id, adminId, {
        name: "Demo Sunrise Hospital",
        legalName: "Demo Sunrise Hospital Trust",
        taxIdentifier: "24DEMO0002A1Z2",
        contact: "Kunal Shah",
        email: "kunal@demo-sunrise.example",
        phone: "+91 98765 40002",
        city: "Gandhinagar",
      }),
      await seedCustomer(client, company.id, adminId, {
        name: "Demo Orion Warehousing",
        legalName: "Demo Orion Warehousing LLP",
        taxIdentifier: "24DEMO0003A1Z3",
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
        ownerUserId: managerId,
        ...customers[1],
      }),
    ];
    for (const [index, lead] of leads.entries()) {
      const ownerId = index === 0 || index === 2 ? executiveId : managerId;
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
    const qualifiedOpportunity = await seedOpportunity(
      client,
      company.id,
      executiveId,
      leads[2]!.id,
      customers[2]!,
      "Demo Orion fire-safety opportunity",
    );
    const authorizedOpportunity = await seedOpportunity(
      client,
      company.id,
      managerId,
      leads[3]!.id,
      customers[0]!,
      "Demo Acme suppression opportunity",
    );
    for (const [opportunityId, ownerId] of [
      [qualifiedOpportunity.id, executiveId],
      [authorizedOpportunity.id, managerId],
    ]) {
      for (const [userId, role] of [
        [ownerId, "owner"],
        [adminId, "viewer"],
      ] as const) {
        await client.query(
          `
          insert into opportunity_members (company_id, opportunity_id, user_id, role)
          values ($1, $2, $3, $4)
          on conflict (opportunity_id, user_id) do nothing
        `,
          [company.id, opportunityId, userId, role],
        );
      }
    }
    await client.query(
      `
      insert into design_jobs (
        company_id, lead_id, opportunity_id, title, designer_user_id, design_head_user_id,
        survey_requested, authorization_notes, authorized_by_user_id
      ) values ($1, $2, $3, 'Demo Acme suppression free design', $4, $5, true,
        'Synthetic authorized design handoff for P2 testing.', $6)
      on conflict (company_id, lead_id) do nothing
    `,
      [
        company.id,
        leads[3]!.id,
        authorizedOpportunity.id,
        designerId,
        designHeadId,
        managerId,
      ],
    );

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
