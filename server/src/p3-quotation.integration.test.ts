import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './core/security/password.js';
import { closeDatabase, pool } from './infrastructure/database/db.js';
import { removePrivateFile } from './infrastructure/storage/localFileStorage.js';

const origin = 'http://localhost:5173';
const password = 'P3QuotationPassword123!';
const emails = {
  sales: 'p3-quote-sales@example.test',
  paymentManager: 'p3-quote-payment@example.test',
  approver: 'p3-quote-approver@example.test',
  designer: 'p3-quote-designer@example.test',
  head: 'p3-quote-head@example.test',
  outsider: 'p3-quote-outsider@example.test',
};

function csrfFrom(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('fs_csrf='));
  if (!csrfCookie) throw new Error('CSRF cookie was not returned.');
  return decodeURIComponent(csrfCookie.split(';', 1)[0]!.slice('fs_csrf='.length));
}

async function cleanup() {
  const documents = await pool.query<{ storage_name: string }>('select storage_name from quotation_issue_documents');
  for (const document of documents.rows) await removePrivateFile(document.storage_name);
  for (const table of [
    'procurement_selection_decisions', 'procurement_substitution_reviews', 'vendor_offer_lines', 'vendor_offers', 'purchase_comparisons',
    'procurement_rfq_vendors', 'procurement_rfq_lines', 'procurement_rfqs',
    'procurement_requisition_lines', 'procurement_requisitions',
    'project_commercial_baselines', 'project_design_baselines', 'project_members', 'projects',
    'quotation_customer_decisions', 'quotation_issue_documents', 'quotation_review_actions',
    'quotation_revision_contributors', 'quotation_lines', 'quotation_revisions', 'quotations',
    'design_customer_decisions', 'design_review_actions', 'design_revision_files', 'survey_revision_files', 'survey_revisions', 'boq_review_actions',
    'boq_revision_contributors', 'estimate_cost_lines', 'boq_lines', 'boq_revisions', 'boq_template_items', 'boq_templates', 'design_package_revisions', 'design_jobs',
    'opportunity_members', 'opportunities', 'lead_members', 'leads', 'customer_members',
    'customer_addresses', 'sites', 'customer_contacts', 'customers', 'service_categories',
    'items', 'brands', 'item_categories', 'units',
  ]) await pool.query(`delete from ${table}`);
  await pool.query("delete from document_counters where document_type in ('LEAD', 'QUOTATION')");
  await pool.query('delete from auth_sessions');
  await pool.query('delete from audit_events');
  await pool.query('delete from users where email_normalized = any($1)', [Object.values(emails)]);
}

async function setup() {
  await cleanup();
  const company = (await pool.query<{ id: string }>('select id from companies order by created_at limit 1')).rows[0];
  if (!company) throw new Error('Integration company is missing.');
  const passwordHash = await hashPassword(password);
  const definitions = [
    [emails.sales, 'P3 Quote Sales', 'P3-Q-SALES', 'sales_executive'],
    [emails.paymentManager, 'P3 Payment Manager', 'P3-Q-PAY', 'sales_manager'],
    [emails.approver, 'P3 Quote Approver', 'P3-Q-APP', 'sales_manager'],
    [emails.designer, 'P3 Quote Designer', 'P3-Q-DES', 'design_engineer'],
    [emails.head, 'P3 Quote Head', 'P3-Q-HEAD', 'design_head'],
    [emails.outsider, 'P3 Quote Outsider', 'P3-Q-OUT', 'purchase_executive'],
  ] as const;
  const users = new Map<string, string>();
  for (const [email, name, employeeCode, roleCode] of definitions) {
    const user = await pool.query<{ id: string }>(`
      insert into users (company_id, employee_code, name, email, email_normalized, password_hash, status, must_change_password)
      values ($1, $2, $3, $4, $4, $5, 'active', false) returning id
    `, [company.id, employeeCode, name, email, passwordHash]);
    users.set(email, user.rows[0]!.id);
    await pool.query(`insert into user_role_assignments (company_id, user_id, role_id) select $1, $2, id from roles where company_id = $1 and code = $3`, [company.id, user.rows[0]!.id, roleCode]);
  }
  const salesId = users.get(emails.sales)!;
  const designerId = users.get(emails.designer)!;
  const headId = users.get(emails.head)!;
  const service = (await pool.query<{ id: string }>(`insert into service_categories (company_id, code, name, name_normalized, created_by_user_id) values ($1, 'P3-Q', 'P3 quotation', 'p3 quotation', $2) returning id`, [company.id, salesId])).rows[0]!;
  const purpose = (await pool.query<{ id: string }>(`select id from lead_purposes where company_id = $1 and code = 'NEW_PROJECT'`, [company.id])).rows[0]!;
  const sector = (await pool.query<{ id: string }>(`select id from market_sectors where company_id = $1 and code = 'INDUSTRIAL'`, [company.id])).rows[0]!;
  const customer = (await pool.query<{ id: string }>(`insert into customers (company_id, display_name, display_name_normalized, created_by_user_id) values ($1, 'P3 Quote Customer', 'p3 quote customer', $2) returning id`, [company.id, salesId])).rows[0]!;
  const contact = (await pool.query<{ id: string }>(`insert into customer_contacts (company_id, customer_id, name, phone, phone_normalized, is_primary, created_by_user_id) values ($1, $2, 'Quote Contact', '9876501111', '+919876501111', true, $3) returning id`, [company.id, customer.id, salesId])).rows[0]!;
  const site = (await pool.query<{ id: string }>(`insert into sites (company_id, customer_id, name, address_line_1, city, country, created_by_user_id) values ($1, $2, 'Quote Site', 'Test address', 'Ahmedabad', 'India', $3) returning id`, [company.id, customer.id, salesId])).rows[0]!;
  const lead = (await pool.query<{ id: string }>(`
    insert into leads (company_id, lead_number, inquiry_name, contact_name, phone, phone_normalized, source, service_category_id, purpose_id, sector_id, owner_user_id, customer_id, primary_contact_id, site_id, stage, qualification_notes, created_by_user_id)
    values ($1, 'P3-QUOTE-001', 'P3 quotation flow', 'Quote Contact', '9876501111', '+919876501111', 'Integration', $2, $3, $4, $5, $6, $7, $8, 'design_authorized', 'Approved synthetic scope', $5) returning id
  `, [company.id, service.id, purpose.id, sector.id, salesId, customer.id, contact.id, site.id])).rows[0]!;
  const opportunity = (await pool.query<{ id: string }>(`
    insert into opportunities (company_id, lead_id, customer_id, primary_contact_id, site_id, title, created_by_user_id)
    values ($1, $2, $3, $4, $5, 'P3 quotation opportunity', $6) returning id
  `, [company.id, lead.id, customer.id, contact.id, site.id, salesId])).rows[0]!;
  for (const userId of [salesId, users.get(emails.paymentManager)!, users.get(emails.approver)!]) {
    await pool.query(`insert into lead_members (company_id, lead_id, user_id, role) values ($1, $2, $3, 'collaborator')`, [company.id, lead.id, userId]);
    await pool.query(`insert into opportunity_members (company_id, opportunity_id, user_id, role) values ($1, $2, $3, 'sales')`, [company.id, opportunity.id, userId]);
  }
  const job = (await pool.query<{ id: string }>(`
    insert into design_jobs (company_id, lead_id, opportunity_id, title, status, designer_user_id, design_head_user_id, authorization_notes, authorized_by_user_id)
    values ($1, $2, $3, 'P3 approved design', 'customer_approved', $4, $5, 'Synthetic approved design', $6) returning id
  `, [company.id, lead.id, opportunity.id, designerId, headId, salesId])).rows[0]!;
  const design = (await pool.query<{ id: string }>(`
    insert into design_package_revisions (company_id, design_job_id, revision_number, title, change_summary, status, created_by_user_id, submitted_by_user_id, submitted_at)
    values ($1, $2, 1, 'Approved package', 'Initial scope', 'customer_approved', $3, $3, now()) returning id
  `, [company.id, job.id, designerId])).rows[0]!;
  await pool.query(`insert into design_customer_decisions (company_id, revision_id, decision, evidence_reference, recorded_by_user_id) values ($1, $2, 'approved', 'Synthetic customer approval', $3)`, [company.id, design.id, salesId]);
  const unit = (await pool.query<{ id: string }>(`insert into units (company_id, code, name, name_normalized, symbol, created_by_user_id) values ($1, 'P3NOS', 'P3 Numbers', 'p3 numbers', 'No.', $2) returning id`, [company.id, salesId])).rows[0]!;
  const category = (await pool.query<{ id: string }>(`insert into item_categories (company_id, code, name, name_normalized, created_by_user_id) values ($1, 'P3CAT', 'P3 Category', 'p3 category', $2) returning id`, [company.id, salesId])).rows[0]!;
  const item = (await pool.query<{ id: string }>(`insert into items (company_id, code, name, name_normalized, specification, category_id, unit_id, created_by_user_id) values ($1, 'P3ITEM', 'P3 Smoke Detector', 'p3 smoke detector', 'Addressable smoke detector', $2, $3, $4) returning id`, [company.id, category.id, unit.id, salesId])).rows[0]!;
  const brand = (await pool.query<{ id: string }>(`insert into brands (company_id, code, name, name_normalized, created_by_user_id) values ($1, 'P3MAKE', 'P3 Detector Make', 'p3 detector make', $2) returning id`, [company.id, salesId])).rows[0]!;
  await pool.query(`insert into item_brands (company_id, item_id, brand_id, created_by_user_id) values ($1, $2, $3, $4)`, [company.id, item.id, brand.id, salesId]);
  const boq = (await pool.query<{ id: string }>(`
    insert into boq_revisions (company_id, design_job_id, design_revision_id, revision_number, title, change_summary, status, created_by_user_id, submitted_by_user_id, submitted_at)
    values ($1, $2, $3, 1, 'Approved BOQ', 'Initial BOQ', 'approved', $4, $4, now()) returning id
  `, [company.id, job.id, design.id, designerId])).rows[0]!;
  await pool.query(`
    insert into boq_lines (company_id, boq_revision_id, line_number, section, item_id, item_code_snapshot, item_name_snapshot, specification_snapshot, unit_id, unit_symbol_snapshot, quantity)
    values ($1, $2, 1, 'Detection', $3, 'P3ITEM', 'P3 Smoke Detector', 'Addressable smoke detector', $4, 'No.', '2.0000')
  `, [company.id, boq.id, item.id, unit.id]);
  return { jobId: job.id, boqId: boq.id };
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email, password });
  expect(response.status).toBe(200);
  return { agent, csrf: csrfFrom(response) };
}

describe('P3 quotation revisions and commercial evidence', () => {
  let fixture: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { fixture = await setup(); });
  afterAll(async () => { await cleanup(); await closeDatabase(); });

  it('preserves full scope, enforces independent approval, redacts payment plans, and accepts an exact issued revision', async () => {
    const app = createApp();
    const sales = await login(app, emails.sales);
    const paymentManager = await login(app, emails.paymentManager);
    const approver = await login(app, emails.approver);
    const outsider = await login(app, emails.outsider);
    expect((await outsider.agent.get('/api/v1/engineering/quotations')).status).toBe(403);

    const created = await sales.agent.post(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ boqRevisionId: fixture.boqId, title: 'Detector quotation', exclusions: 'Civil work excluded', deliveryTerms: 'Delivery in four weeks', paymentTerms: 'By agreed milestones' });
    expect(created.status).toBe(201);
    const revisionId = created.body.data.revision.id as string;

    let salesWorkspace = (await sales.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    expect(salesWorkspace.revisions[0].lines).toHaveLength(1);
    expect(salesWorkspace.revisions[0]).not.toHaveProperty('paymentPlan');
    let revision = salesWorkspace.revisions[0];
    const line = revision.lines[0];
    const priced = await sales.agent.patch(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/lines/${line.id}`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ brandId: line.brandOptions[0].id, unitRate: '1234.56', discountAmount: '34.56', expectedRevisionVersion: revision.rowVersion, expectedLineVersion: line.rowVersion });
    expect(priced.status).toBe(200);

    let managerWorkspace = (await paymentManager.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    revision = managerWorkspace.revisions[0];
    expect(revision.paymentPlan).toBeNull();
    const plan = await paymentManager.agent.patch(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/payment-plan`)
      .set('Origin', origin).set('X-CSRF-Token', paymentManager.csrf)
      .send({ cashPercentage: '30.00', nonCashPercentage: '70.00', expectedVersion: revision.rowVersion });
    expect(plan.status).toBe(200);

    salesWorkspace = (await sales.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    revision = salesWorkspace.revisions[0];
    expect(revision.grandTotal).toBe('2434.56');
    expect(revision).not.toHaveProperty('paymentPlan');
    const submitted = await sales.agent.post(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/submit`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf).send({ expectedVersion: revision.rowVersion });
    expect(submitted.status).toBe(200);

    managerWorkspace = (await paymentManager.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    revision = managerWorkspace.revisions[0];
    expect(revision.paymentPlan).toEqual({ cashPercentage: '30.00', nonCashPercentage: '70.00' });
    const selfApproval = await paymentManager.agent.post(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/review`)
      .set('Origin', origin).set('X-CSRF-Token', paymentManager.csrf).send({ decision: 'approved', expectedVersion: revision.rowVersion });
    expect(selfApproval.status).toBe(403);

    let approverWorkspace = (await approver.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    revision = approverWorkspace.revisions[0];
    const approved = await approver.agent.post(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/review`)
      .set('Origin', origin).set('X-CSRF-Token', approver.csrf).send({ decision: 'approved', expectedVersion: revision.rowVersion });
    expect(approved.status).toBe(200);
    const immutable = await sales.agent.patch(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/lines/${line.id}`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ brandId: line.brandOptions[0].id, unitRate: '1.00', discountAmount: '0.00', expectedRevisionVersion: approved.body.data.revision.rowVersion, expectedLineVersion: line.rowVersion + 1 });
    expect(immutable.status).toBe(409);

    salesWorkspace = (await sales.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    revision = salesWorkspace.revisions[0];
    const issued = await sales.agent.post(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/issue`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf).send({ expectedVersion: revision.rowVersion });
    expect(issued.status).toBe(200);
    const documentId = issued.body.data.document.id as string;
    const pdf = await sales.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/documents/${documentId}`).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect((pdf.body as Buffer).toString('ascii')).toContain('DEMO / NOT FOR PRODUCTION');

    salesWorkspace = (await sales.agent.get(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations`)).body.data;
    revision = salesWorkspace.revisions[0];
    const accepted = await sales.agent.post(`/api/v1/engineering/design-jobs/${fixture.jobId}/quotations/${revisionId}/customer-decision`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ decision: 'accepted', evidenceReference: 'Signed demo acceptance dated 2026-10-16', customerOrderReference: 'DEMO-PO-001', expectedVersion: revision.rowVersion });
    expect(accepted.status).toBe(200);
    const states = await pool.query<{ commercial_state: string; stage: string }>(`select opportunity.commercial_state, lead.stage from opportunities opportunity inner join leads lead on lead.id = opportunity.lead_id where opportunity.id = (select opportunity_id from design_jobs where id = $1)`, [fixture.jobId]);
    expect(states.rows[0]).toEqual({ commercial_state: 'awarded', stage: 'won' });
    const queue = await sales.agent.get('/api/v1/engineering/quotations?status=accepted&page=1&pageSize=10');
    expect(queue.status, JSON.stringify(queue.body)).toBe(200);
    expect(queue.body.data).toMatchObject({ total: 1, items: [{ status: 'accepted', grandTotal: '2434.56' }] });
  });
});
