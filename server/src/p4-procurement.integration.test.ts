import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './core/security/password.js';
import { closeDatabase, pool } from './infrastructure/database/db.js';

const origin = 'http://localhost:5173';
const password = 'P4ProcurementPassword123!';
const emails = {
  buyer: 'p4-buyer@example.test',
  manager: 'p4-manager@example.test',
  reviewer: 'p4-design-head@example.test',
  outsider: 'p4-outsider@example.test',
};

function csrfFrom(response: request.Response) {
  const cookies = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [response.headers['set-cookie']].filter(Boolean);
  const cookie = cookies.find((value) => value?.startsWith('fs_csrf='));
  if (!cookie) throw new Error('CSRF cookie was not returned.');
  return decodeURIComponent(cookie.split(';', 1)[0]!.slice('fs_csrf='.length));
}

async function cleanup() {
  for (const table of [
    'procurement_selection_decisions', 'procurement_substitution_reviews', 'vendor_offer_lines', 'vendor_offers', 'purchase_comparisons',
    'procurement_rfq_vendors', 'procurement_rfq_lines', 'procurement_rfqs',
    'procurement_requisition_lines', 'procurement_requisitions',
    'project_commercial_baselines', 'project_design_baselines', 'project_members', 'projects',
    'boq_review_actions', 'boq_revision_contributors', 'estimate_cost_lines', 'boq_lines', 'boq_revisions',
    'design_customer_decisions', 'design_review_actions', 'design_revision_files', 'survey_revision_files',
    'survey_revisions', 'design_package_revisions', 'design_jobs', 'opportunity_members', 'opportunities',
    'lead_members', 'leads', 'customer_members', 'customer_addresses', 'customer_contacts', 'sites', 'customers',
    'vendor_contacts', 'vendors', 'item_brands', 'items', 'brands', 'item_categories', 'units', 'service_categories',
  ]) await pool.query(`delete from ${table}`);
  await pool.query("delete from document_counters where document_type in ('REQUISITION', 'RFQ')");
  await pool.query('delete from notifications');
  await pool.query('delete from audit_events');
  await pool.query('delete from auth_sessions');
  await pool.query('delete from users where email_normalized = any($1)', [Object.values(emails)]);
}

async function setup() {
  await cleanup();
  const company = (await pool.query<{ id: string }>('select id from companies order by created_at limit 1')).rows[0];
  if (!company) throw new Error('Integration company is missing.');
  const passwordHash = await hashPassword(password);
  const userIds = new Map<string, string>();
  for (const [email, name, code, role] of [
    [emails.buyer, 'P4 Buyer', 'P4-BUY', 'purchase_executive'],
    [emails.manager, 'P4 Purchase Manager', 'P4-MGR', 'purchase_manager'],
    [emails.reviewer, 'P4 Design Head', 'P4-DH', 'design_head'],
    [emails.outsider, 'P4 Outside Manager', 'P4-OUT', 'purchase_manager'],
  ] as const) {
    const user = await pool.query<{ id: string }>(`insert into users (company_id, employee_code, name, email, email_normalized, password_hash, status, must_change_password) values ($1, $2, $3, $4, $4, $5, 'active', false) returning id`, [company.id, code, name, email, passwordHash]);
    userIds.set(email, user.rows[0]!.id);
    await pool.query(`insert into user_role_assignments (company_id, user_id, role_id) select $1, $2, id from roles where company_id = $1 and code = $3`, [company.id, user.rows[0]!.id, role]);
  }
  const buyerId = userIds.get(emails.buyer)!;
  const managerId = userIds.get(emails.manager)!;
  const reviewerId = userIds.get(emails.reviewer)!;
  const service = (await pool.query<{ id: string }>(`insert into service_categories (company_id, code, name, name_normalized, created_by_user_id) values ($1, 'P4-SVC', 'P4 service', 'p4 service', $2) returning id`, [company.id, buyerId])).rows[0]!;
  const purpose = (await pool.query<{ id: string }>(`select id from lead_purposes where company_id = $1 and code = 'NEW_PROJECT'`, [company.id])).rows[0]!;
  const sector = (await pool.query<{ id: string }>(`select id from market_sectors where company_id = $1 and code = 'INDUSTRIAL'`, [company.id])).rows[0]!;
  const customer = (await pool.query<{ id: string }>(`insert into customers (company_id, display_name, display_name_normalized, created_by_user_id) values ($1, 'P4 Customer', 'p4 customer', $2) returning id`, [company.id, buyerId])).rows[0]!;
  const contact = (await pool.query<{ id: string }>(`insert into customer_contacts (company_id, customer_id, name, phone, phone_normalized, is_primary, created_by_user_id) values ($1, $2, 'P4 Contact', '9876504400', '+919876504400', true, $3) returning id`, [company.id, customer.id, buyerId])).rows[0]!;
  const site = (await pool.query<{ id: string }>(`insert into sites (company_id, customer_id, name, address_line_1, city, country, created_by_user_id) values ($1, $2, 'P4 Site', 'Test address', 'Ahmedabad', 'India', $3) returning id`, [company.id, customer.id, buyerId])).rows[0]!;
  const lead = (await pool.query<{ id: string }>(`insert into leads (company_id, lead_number, inquiry_name, contact_name, phone, phone_normalized, source, service_category_id, purpose_id, sector_id, owner_user_id, customer_id, primary_contact_id, site_id, stage, qualification_notes, created_by_user_id) values ($1, 'P4-LEAD-001', 'P4 sourcing', 'P4 Contact', '9876504400', '+919876504400', 'Integration', $2, $3, $4, $5, $6, $7, $8, 'design_authorized', 'Synthetic scope', $5) returning id`, [company.id, service.id, purpose.id, sector.id, buyerId, customer.id, contact.id, site.id])).rows[0]!;
  const opportunity = (await pool.query<{ id: string }>(`insert into opportunities (company_id, lead_id, customer_id, primary_contact_id, site_id, title, created_by_user_id) values ($1, $2, $3, $4, $5, 'P4 opportunity', $6) returning id`, [company.id, lead.id, customer.id, contact.id, site.id, buyerId])).rows[0]!;
  const job = (await pool.query<{ id: string }>(`insert into design_jobs (company_id, lead_id, opportunity_id, title, status, designer_user_id, design_head_user_id, authorization_notes, authorized_by_user_id) values ($1, $2, $3, 'P4 design', 'customer_approved', $4, $5, 'Synthetic', $4) returning id`, [company.id, lead.id, opportunity.id, buyerId, reviewerId])).rows[0]!;
  const design = (await pool.query<{ id: string }>(`insert into design_package_revisions (company_id, design_job_id, revision_number, title, change_summary, status, created_by_user_id, submitted_by_user_id, submitted_at) values ($1, $2, 1, 'P4 design', 'Synthetic', 'customer_approved', $3, $3, now()) returning id`, [company.id, job.id, buyerId])).rows[0]!;
  const decision = (await pool.query<{ id: string }>(`insert into design_customer_decisions (company_id, revision_id, decision, evidence_reference, recorded_by_user_id) values ($1, $2, 'approved', 'Synthetic approval', $3) returning id`, [company.id, design.id, buyerId])).rows[0]!;
  const unit = (await pool.query<{ id: string }>(`insert into units (company_id, code, name, name_normalized, symbol, created_by_user_id) values ($1, 'P4-NOS', 'P4 Numbers', 'p4 numbers', 'No.', $2) returning id`, [company.id, buyerId])).rows[0]!;
  const category = (await pool.query<{ id: string }>(`insert into item_categories (company_id, code, name, name_normalized, created_by_user_id) values ($1, 'P4-CAT', 'P4 Category', 'p4 category', $2) returning id`, [company.id, buyerId])).rows[0]!;
  const item = (await pool.query<{ id: string }>(`insert into items (company_id, code, name, name_normalized, specification, category_id, unit_id, created_by_user_id) values ($1, 'P4-ITEM', 'P4 Detector', 'p4 detector', 'Approved detector specification', $2, $3, $4) returning id`, [company.id, category.id, unit.id, buyerId])).rows[0]!;
  const boq = (await pool.query<{ id: string }>(`insert into boq_revisions (company_id, design_job_id, design_revision_id, revision_number, title, change_summary, status, created_by_user_id, submitted_by_user_id, submitted_at) values ($1, $2, $3, 1, 'P4 BOQ', 'Synthetic', 'approved', $4, $4, now()) returning id`, [company.id, job.id, design.id, buyerId])).rows[0]!;
  const boqLine = (await pool.query<{ id: string }>(`insert into boq_lines (company_id, boq_revision_id, line_number, section, item_id, item_code_snapshot, item_name_snapshot, specification_snapshot, unit_id, unit_symbol_snapshot, quantity) values ($1, $2, 1, 'Detection', $3, 'P4-ITEM', 'P4 Detector', 'Approved detector specification', $4, 'No.', '10.0000') returning id`, [company.id, boq.id, item.id, unit.id])).rows[0]!;
  const project = (await pool.query<{ id: string }>(`insert into projects (company_id, project_number, opportunity_id, customer_id, site_id, title, start_date, target_completion_date, start_reason, started_by_user_id) values ($1, 'P4-PRJ-001', $2, $3, $4, 'P4 Project', current_date, current_date + 30, 'Synthetic approved-design project', $5) returning id`, [company.id, opportunity.id, customer.id, site.id, buyerId])).rows[0]!;
  for (const [userId, role] of [[buyerId, 'purchase'], [managerId, 'purchase'], [reviewerId, 'design']] as const) await pool.query(`insert into project_members (company_id, project_id, user_id, role, assigned_by_user_id) values ($1, $2, $3, $4, $5)`, [company.id, project.id, userId, role, buyerId]);
  await pool.query(`insert into project_design_baselines (company_id, project_id, design_job_id, design_revision_id, design_customer_decision_id, customer_evidence_snapshot, created_by_user_id) values ($1, $2, $3, $4, $5, 'Synthetic approval', $6)`, [company.id, project.id, job.id, design.id, decision.id, buyerId]);
  const vendorIds: string[] = [];
  for (const [code, name] of [['P4-VEN-1', 'P4 Vendor One'], ['P4-VEN-2', 'P4 Vendor Two']] as const) {
    const vendor = await pool.query<{ id: string }>(`insert into vendors (company_id, code, display_name, display_name_normalized, status, created_by_user_id) values ($1, $2, $3, lower($3), 'active', $4) returning id`, [company.id, code, name, buyerId]);
    vendorIds.push(vendor.rows[0]!.id);
  }
  return { projectId: project.id, boqId: boq.id, boqLineId: boqLine.id, managerId, vendorIds };
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email, password });
  expect(response.status).toBe(200);
  return { agent, csrf: csrfFrom(response) };
}

describe('P4 procurement sourcing and supplier selection', () => {
  let fixture: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { fixture = await setup(); });
  afterAll(async () => { await cleanup(); await closeDatabase(); });

  it('keeps scope explicit, requires sufficient offers, blocks deviations and records a reasoned non-lowest selection', async () => {
    const app = createApp();
    const buyer = await login(app, emails.buyer);
    const manager = await login(app, emails.manager);
    const reviewer = await login(app, emails.reviewer);
    const outsider = await login(app, emails.outsider);
    expect((await outsider.agent.get('/api/v1/procurement/requisitions')).body.data.items).toHaveLength(0);
    const created = await buyer.agent.post('/api/v1/procurement/requisitions').set('Origin', origin).set('X-CSRF-Token', buyer.csrf).send({
      projectId: fixture.projectId, boqRevisionId: fixture.boqId, title: 'Detector demand', purchaseManagerUserId: fixture.managerId,
      requiredBy: '2030-12-31', deliveryLocation: 'P4 test site', lines: [{ boqLineId: fixture.boqLineId, quantity: '10.0000' }],
    });
    expect(created.status).toBe(201);
    const requisitionId = created.body.data.requisition.id as string;
    const rfqCreated = await buyer.agent.post(`/api/v1/procurement/requisitions/${requisitionId}/rfq`).set('Origin', origin).set('X-CSRF-Token', buyer.csrf).send({ vendorIds: fixture.vendorIds, responseDueDate: '2030-12-01', commercialTerms: 'Quote all normalized commercial terms.', expectedVersion: 1 });
    expect(rfqCreated.status).toBe(201);
    let workspace = (await buyer.agent.get(`/api/v1/procurement/requisitions/${requisitionId}`)).body.data;
    const rfqLineId = workspace.rfqLines[0].id as string;
    const offer = async (vendorId: string, equivalence: 'equivalent' | 'deviation', unitRate: string) => buyer.agent.post(`/api/v1/procurement/requisitions/${requisitionId}/offers`).set('Origin', origin).set('X-CSRF-Token', buyer.csrf).send({
      vendorId, vendorReference: `REF-${vendorId.slice(0, 6)}`, currency: 'INR', taxBasis: 'GST stated separately', freightAmount: '0.00', leadTimeDays: 14, paymentTerms: '30 days', warranty: '12 months',
      lines: [{ rfqLineId, unitRate, brandOffered: 'Test Make', specificationOffered: 'Approved detector specification', equivalence, deviationNotes: equivalence === 'deviation' ? 'Different detector protocol' : undefined }],
    });
    expect((await offer(fixture.vendorIds[0]!, 'deviation', '1100.00')).status).toBe(201);
    workspace = (await manager.agent.get(`/api/v1/procurement/requisitions/${requisitionId}`)).body.data;
    expect((await manager.agent.post(`/api/v1/procurement/requisitions/${requisitionId}/select`).set('Origin', origin).set('X-CSRF-Token', manager.csrf).send({ offerId: workspace.offers[0].id, selectionReason: 'Only received offer', expectedVersion: workspace.comparison.rowVersion })).status).toBe(422);
    expect((await offer(fixture.vendorIds[1]!, 'equivalent', '1000.00')).status).toBe(201);
    workspace = (await manager.agent.get(`/api/v1/procurement/requisitions/${requisitionId}`)).body.data;
    const deviating = workspace.offers.find((item: { vendorId: string }) => item.vendorId === fixture.vendorIds[0]);
    expect((await manager.agent.post(`/api/v1/procurement/requisitions/${requisitionId}/select`).set('Origin', origin).set('X-CSRF-Token', manager.csrf).send({ offerId: deviating.id, selectionReason: 'Preferred technical make', expectedVersion: workspace.comparison.rowVersion })).status).toBe(409);
    const reviewQueue = await reviewer.agent.get('/api/v1/procurement/substitution-reviews');
    expect(reviewQueue.status).toBe(200);
    expect(reviewQueue.body.data.items).toHaveLength(1);
    const technicalWorkspace = await reviewer.agent.get(`/api/v1/procurement/substitution-reviews/${requisitionId}`);
    expect(technicalWorkspace.status).toBe(200);
    expect(technicalWorkspace.body.data.items[0]).not.toHaveProperty('unitRate');
    expect(technicalWorkspace.body.data.items[0]).not.toHaveProperty('paymentTerms');
    const approved = await reviewer.agent.post(`/api/v1/procurement/substitution-reviews/${requisitionId}/lines/${technicalWorkspace.body.data.items[0].offerLineId}/decision`).set('Origin', origin).set('X-CSRF-Token', reviewer.csrf).send({ decision: 'approved', reason: 'Compatible with the approved detector loop and design intent.' });
    expect(approved.status).toBe(201);
    workspace = (await manager.agent.get(`/api/v1/procurement/requisitions/${requisitionId}`)).body.data;
    expect(workspace.offers.find((item: { id: string }) => item.id === deviating.id).lines[0].substitutionReview.decision).toBe('approved');
    const selected = await manager.agent.post(`/api/v1/procurement/requisitions/${requisitionId}/select`).set('Origin', origin).set('X-CSRF-Token', manager.csrf).send({ offerId: deviating.id, selectionReason: 'Engineering-approved make with longer warranty despite the higher comparable price.', expectedVersion: workspace.comparison.rowVersion });
    expect(selected.status).toBe(200);
    expect((await manager.agent.get(`/api/v1/procurement/requisitions/${requisitionId}`)).body.data).toMatchObject({ requisition: { status: 'selected' }, selection: { selectedOfferId: deviating.id } });
  });
});
