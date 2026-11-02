import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './core/security/password.js';
import { closeDatabase, pool } from './infrastructure/database/db.js';
import { ensureUploadRoot, removePrivateFile } from './infrastructure/storage/localFileStorage.js';

const origin = 'http://localhost:5173';
const password = 'P2MastersPassword123!';
const emails = {
  purchaser: 'p2-purchaser@example.test',
  sales: 'p2-design-sales@example.test',
  outsider: 'p2-design-outsider@example.test',
  designer: 'p2-designer@example.test',
  head: 'p2-design-head@example.test',
  admin: 'p2-masters-admin@example.test',
};

function csrfFrom(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('fs_csrf='));
  if (!csrfCookie) throw new Error('CSRF cookie was not returned.');
  return decodeURIComponent(csrfCookie.split(';', 1)[0]!.slice('fs_csrf='.length));
}

async function cleanFixtures() {
  for (const table of [
    'procurement_selection_decisions', 'procurement_substitution_reviews', 'vendor_offer_lines', 'vendor_offers', 'purchase_comparisons',
    'procurement_rfq_vendors', 'procurement_rfq_lines', 'procurement_rfqs',
    'procurement_requisition_lines', 'procurement_requisitions',
    'project_commercial_baselines', 'project_design_baselines', 'project_members', 'projects',
  ]) await pool.query(`delete from ${table}`);
  const files = await pool.query<{ storageName: string }>('select storage_name as "storageName" from survey_revision_files');
  await Promise.all(files.rows.map((file) => removePrivateFile(file.storageName)));
  await pool.query('delete from quotation_customer_decisions');
  await pool.query('delete from quotation_issue_documents');
  await pool.query('delete from quotation_review_actions');
  await pool.query('delete from quotation_revision_contributors');
  await pool.query('delete from quotation_lines');
  await pool.query('delete from quotation_revisions');
  await pool.query('delete from quotations');
  await pool.query('delete from design_customer_decisions');
  await pool.query('delete from design_review_actions');
  await pool.query('delete from design_revision_files');
  await pool.query('delete from survey_revision_files');
  await pool.query('delete from survey_revisions');
  await pool.query('delete from boq_review_actions');
  await pool.query('delete from boq_revision_contributors');
  await pool.query('delete from estimate_cost_lines');
  await pool.query('delete from boq_lines');
  await pool.query('delete from boq_revisions');
  await pool.query('delete from boq_template_items');
  await pool.query('delete from boq_templates');
  await pool.query('delete from design_package_revisions');
  await pool.query('delete from design_jobs');
  await pool.query('delete from opportunity_members');
  await pool.query('delete from opportunities');
  await pool.query('delete from lead_members');
  await pool.query('delete from leads');
  await pool.query('delete from customer_members');
  await pool.query('delete from customer_addresses');
  await pool.query('delete from customer_contacts');
  await pool.query('delete from sites');
  await pool.query('delete from customers');
  await pool.query('delete from service_categories');
  await pool.query('delete from vendor_contacts');
  await pool.query('delete from vendors');
  await pool.query('delete from item_rate_versions');
  await pool.query('delete from item_brands');
  await pool.query('delete from items');
  await pool.query('delete from item_family_specifications');
  await pool.query('delete from item_families');
  await pool.query('delete from brands');
  await pool.query('delete from item_categories');
  await pool.query('delete from units');
  await pool.query("delete from document_counters where document_type in ('LEAD', 'QUOTATION')");
  await pool.query('delete from auth_sessions');
  await pool.query('delete from audit_events');
  await pool.query('delete from users where email_normalized = any($1)', [Object.values(emails)]);
}

async function resetFixtures() {
  await cleanFixtures();
  const passwordHash = await hashPassword(password);
  const company = await pool.query<{ id: string }>('select id from companies order by created_at limit 1');
  if (!company.rows[0]) throw new Error('Integration company is missing.');
  const fixtures = [
    [emails.purchaser, 'P2 Purchase Executive', 'P2-PURCHASE', 'purchase_executive'],
    [emails.sales, 'P2 Design Sales', 'P2-DESIGN-SALES', 'sales_manager'],
    [emails.outsider, 'P2 Design Outsider', 'P2-DESIGN-OUT', 'sales_executive'],
    [emails.designer, 'P2 Designer', 'P2-DESIGNER', 'design_engineer'],
    [emails.head, 'P2 Design Head', 'P2-DESIGN-HEAD', 'design_head'],
    [emails.admin, 'P2 Masters Admin', 'P2-MASTER-ADMIN', 'system_admin'],
  ];
  for (const [email, name, code, role] of fixtures) {
    const inserted = await pool.query<{ id: string }>(`
      insert into users (company_id, employee_code, name, email, email_normalized, password_hash, status, must_change_password)
      values ($1, $2, $3, $4, $4, $5, 'active', false) returning id
    `, [company.rows[0].id, code, name, email, passwordHash]);
    await pool.query(`
      insert into user_role_assignments (company_id, user_id, role_id)
      select $1, $2, id from roles where company_id = $1 and code = $3
    `, [company.rows[0].id, inserted.rows[0]!.id, role]);
  }
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email, password });
  expect(response.status).toBe(200);
  return { agent, csrf: csrfFrom(response) };
}

describe('P2 purchasing masters and free-design authorization', () => {
  beforeAll(async () => { await ensureUploadRoot(); await resetFixtures(); });
  afterAll(async () => { await cleanFixtures(); await closeDatabase(); });

  it('manages versioned vendor/item/unit masters without destructive deletion', async () => {
    const app = createApp();
    const purchaser = await login(app, emails.purchaser);
    const admin = await login(app, emails.admin);

    expect((await admin.agent.get('/api/v1/masters/vendors')).status).toBe(403);

    const unitResponse = await purchaser.agent.post('/api/v1/masters/units')
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ code: 'NOS', name: 'Numbers', symbol: 'No.' });
    expect(unitResponse.status).toBe(201);
    const unit = unitResponse.body.data.unit;

    const categoryResponse = await purchaser.agent.post('/api/v1/masters/item-categories')
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ code: 'ALARM', name: 'Fire alarm equipment' });
    expect(categoryResponse.status).toBe(201);
    const category = categoryResponse.body.data.category;

    const brandResponse = await purchaser.agent.post('/api/v1/masters/brands')
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ code: 'NOTIFIER', name: 'Notifier' });
    expect(brandResponse.status).toBe(201);
    const brand = brandResponse.body.data.brand;

    const itemResponse = await purchaser.agent.post('/api/v1/masters/items')
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ code: 'SD-001', name: 'Smoke detector', specification: 'Addressable optical detector', categoryId: category.id, unitId: unit.id, brandIds: [brand.id] });
    expect(itemResponse.status).toBe(201);
    const item = itemResponse.body.data.item;

    const blockedUnit = await purchaser.agent.post(`/api/v1/masters/units/${unit.id}/deactivate`)
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ expectedVersion: unit.rowVersion, reason: 'Attempt while referenced' });
    expect(blockedUnit.status).toBe(409);

    const invalidVendor = await purchaser.agent.post('/api/v1/masters/vendors')
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ code: 'VEN-BAD', displayName: 'Invalid Vendor', primaryContact: { name: 'Invalid Contact', phone: 'abc' } });
    expect(invalidVendor.status).toBe(422);

    const vendorResponse = await purchaser.agent.post('/api/v1/masters/vendors')
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({
        code: 'VEN-001', displayName: 'Detector Supplies', legalName: 'Detector Supplies Private Limited',
        city: 'Ahmedabad', primaryContact: { name: 'Nisha Patel', phone: '9876501234' },
      });
    expect(vendorResponse.status).toBe(201);
    const vendor = vendorResponse.body.data.vendor;

    const vendorList = await purchaser.agent.get('/api/v1/masters/vendors?search=Detector&page=1&pageSize=10&sort=code&direction=asc');
    expect(vendorList.status).toBe(200);
    expect(vendorList.body.data).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(vendorList.body.data.items[0]).toMatchObject({ code: 'VEN-001', primaryContact: { name: 'Nisha Patel' } });

    const vendorUpdate = await purchaser.agent.put(`/api/v1/masters/vendors/${vendor.id}`)
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({
        expectedVersion: vendor.rowVersion, code: 'VEN-001', displayName: 'Detector Supplies',
        legalName: 'Detector Supplies Private Limited', city: 'Surat',
        primaryContact: { name: 'Nisha Patel', email: 'nisha@example.test' },
      });
    expect(vendorUpdate.status).toBe(200);
    expect(vendorUpdate.body.data.vendor).toMatchObject({ city: 'Surat', rowVersion: 2 });

    expect((await purchaser.agent.post(`/api/v1/masters/items/${item.id}/deactivate`)
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ expectedVersion: item.rowVersion, reason: 'Superseded test item' })).status).toBe(200);
    expect((await purchaser.agent.post(`/api/v1/masters/units/${unit.id}/deactivate`)
      .set('Origin', origin).set('X-CSRF-Token', purchaser.csrf)
      .send({ expectedVersion: unit.rowVersion, reason: 'No remaining active items' })).status).toBe(200);

    const stored = await pool.query('select count(*)::int as count from vendors where id = $1', [vendor.id]);
    expect(stored.rows[0].count).toBe(1);
  });

  it('creates one assigned design handoff without changing commercial award', async () => {
    const app = createApp();
    const sales = await login(app, emails.sales);
    const outsider = await login(app, emails.outsider);
    const head = await login(app, emails.head);
    const designer = await login(app, emails.designer);

    const service = await sales.agent.post('/api/v1/crm/service-categories')
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ code: 'DESIGN', name: 'Fire protection design' });
    const customer = await sales.agent.post('/api/v1/crm/customers')
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ displayName: 'Design Customer', contacts: [{ name: 'Customer Contact', phone: '9876509998', isPrimary: true }], addresses: [], sites: [] });
    const customerId = customer.body.data.customer.id as string;
    const contactId = customer.body.data.customer.contacts[0].id as string;
    const purposeId = (await sales.agent.get('/api/v1/crm/classifications/lead-purposes')).body.data.items
      .find((item: { code: string }) => item.code === 'NEW_PROJECT').id as string;
    const sectorId = (await sales.agent.get('/api/v1/crm/classifications/market-sectors')).body.data.items
      .find((item: { code: string }) => item.code === 'INDUSTRIAL').id as string;
    const leadResponse = await sales.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ inquiryName: 'Warehouse sprinkler design', contactName: 'Customer Contact', phone: '9876509998', source: 'Referral', serviceCategoryId: service.body.data.category.id, purposeId, sectorId });
    const lead = leadResponse.body.data.lead;
    const qualification = await sales.agent.post(`/api/v1/crm/leads/${lead.id}/qualify`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf)
      .send({ expectedVersion: lead.rowVersion, customerId, primaryContactId: contactId, title: 'Warehouse sprinkler opportunity', qualificationNotes: 'Customer requested a free layout proposal.' });
    expect(qualification.status).toBe(201);

    const qualifiedLead = (await sales.agent.get(`/api/v1/crm/leads/${lead.id}`)).body.data.lead;
    expect((await outsider.agent.get(`/api/v1/crm/leads/${lead.id}`)).status).toBe(404);

    const heads = await sales.agent.get('/api/v1/crm/design-assignees?role=design_head');
    const headId = heads.body.data.items.find((item: { email: string }) => item.email === emails.head).id;

    const payload = {
      expectedVersion: qualifiedLead.rowVersion,
      title: 'Warehouse sprinkler free design', designHeadUserId: headId,
      surveyRequested: false, authorizationNotes: 'Prepare the preliminary CAD layout from customer dimensions.',
    };
    const authorization = await sales.agent.post(`/api/v1/crm/leads/${lead.id}/authorize-design`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf).send(payload);
    expect(authorization.status).toBe(201);
    expect(authorization.body.data).toMatchObject({ replayed: false, designJob: { status: 'awaiting_designer', designerUserId: null, surveyRequested: false } });
    const jobId = authorization.body.data.designJob.id as string;
    const eligibleDesigners = await head.agent.get(`/api/v1/engineering/design-jobs/${jobId}/eligible-designers`);
    const designerId = eligibleDesigners.body.data.items.find((item: { email: string }) => item.email === emails.designer).id;
    const assigned = await head.agent.post(`/api/v1/engineering/design-jobs/${jobId}/assign-designer`)
      .set('Origin', origin).set('X-CSRF-Token', head.csrf)
      .send({ designerUserId: designerId, expectedVersion: authorization.body.data.designJob.rowVersion });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.job).toMatchObject({ status: 'authorized', designerUserId: designerId });

    const survey = await designer.agent.post(`/api/v1/engineering/design-jobs/${jobId}/surveys`)
      .set('Origin', origin).set('X-CSRF-Token', designer.csrf)
      .set('X-Request-Id', 'p3-survey-created')
      .send({ title: 'Initial warehouse survey', changeSummary: 'Pump room and riser route', surveyedOn: '2026-10-26' });
    expect(survey.status, JSON.stringify(survey.body)).toBe(201);
    expect(survey.body.data.revision).toMatchObject({ revisionNumber: 1, status: 'draft', rowVersion: 1 });
    const surveyRevisionId = survey.body.data.revision.id as string;

    const secondDraft = await designer.agent.post(`/api/v1/engineering/design-jobs/${jobId}/surveys`)
      .set('Origin', origin).set('X-CSRF-Token', designer.csrf)
      .send({ title: 'Concurrent draft', changeSummary: 'Must be blocked', surveyedOn: '2026-10-26' });
    expect(secondDraft.status).toBe(409);

    const surveyFile = await designer.agent.post(`/api/v1/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/files`)
      .set('Origin', origin).set('X-CSRF-Token', designer.csrf)
      .set('X-Request-Id', 'p3-survey-file')
      .attach('file', Buffer.from('%PDF-1.4 private survey evidence'), { filename: 'warehouse-survey.pdf', contentType: 'application/pdf' });
    expect(surveyFile.status, JSON.stringify(surveyFile.body)).toBe(201);
    expect(surveyFile.body.data.file).not.toHaveProperty('storageName');
    expect(surveyFile.body.data.file.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    const surveyFileId = surveyFile.body.data.file.id as string;
    expect((await head.agent.get(`/api/v1/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/files/${surveyFileId}`)).status).toBe(200);
    expect((await outsider.agent.get(`/api/v1/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/files/${surveyFileId}`)).status).toBe(404);

    const finalizedSurvey = await designer.agent.post(`/api/v1/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/finalize`)
      .set('Origin', origin).set('X-CSRF-Token', designer.csrf)
      .set('X-Request-Id', 'p3-survey-finalized').send({ expectedVersion: 1 });
    expect(finalizedSurvey.status, JSON.stringify(finalizedSurvey.body)).toBe(200);
    expect(finalizedSurvey.body.data.revision).toMatchObject({ status: 'finalized', rowVersion: 2 });
    const immutableUpload = await designer.agent.post(`/api/v1/engineering/design-jobs/${jobId}/surveys/${surveyRevisionId}/files`)
      .set('Origin', origin).set('X-CSRF-Token', designer.csrf)
      .attach('file', Buffer.from('%PDF-1.4 late file'), { filename: 'late.pdf', contentType: 'application/pdf' });
    expect(immutableUpload.status).toBe(409);

    const nextSurvey = await designer.agent.post(`/api/v1/engineering/design-jobs/${jobId}/surveys`)
      .set('Origin', origin).set('X-CSRF-Token', designer.csrf)
      .send({ title: 'Follow-up survey', changeSummary: 'Updated riser route', surveyedOn: '2026-10-27' });
    expect(nextSurvey.status).toBe(201);
    expect(nextSurvey.body.data.revision).toMatchObject({ revisionNumber: 2, status: 'draft' });

    const replay = await sales.agent.post(`/api/v1/crm/leads/${lead.id}/authorize-design`)
      .set('Origin', origin).set('X-CSRF-Token', sales.csrf).send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);

    const leadAfter = await sales.agent.get(`/api/v1/crm/leads/${lead.id}`);
    expect(leadAfter.body.data.lead.stage).toBe('design_authorized');
    const opportunity = await pool.query('select commercial_state from opportunities where lead_id = $1', [lead.id]);
    expect(opportunity.rows[0].commercial_state).toBe('unawarded');
    expect((await pool.query('select count(*)::int as count from design_jobs where lead_id = $1', [lead.id])).rows[0].count).toBe(1);
  });
});
