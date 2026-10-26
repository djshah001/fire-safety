import request from 'supertest';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './core/security/password.js';
import { closeDatabase, pool } from './infrastructure/database/db.js';
import { ensureUploadRoot, removePrivateFile } from './infrastructure/storage/localFileStorage.js';
import { processOneOutboxJob } from './infrastructure/jobs/outboxWorker.js';

const origin = 'http://localhost:5173';
const managerEmail = 'p2-manager@example.test';
const executiveEmail = 'p2-executive@example.test';
const administratorEmail = 'p2-system-admin@example.test';
const password = 'P2IntegrationPassword123!';

function csrfFrom(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('fs_csrf='));
  if (!csrfCookie) throw new Error('CSRF cookie was not returned.');
  return decodeURIComponent(csrfCookie.split(';', 1)[0]!.slice('fs_csrf='.length));
}

async function resetP2Fixtures() {
  const passwordHash = await hashPassword(password);
  for (const table of [
    'procurement_selection_decisions', 'procurement_substitution_reviews', 'vendor_offer_lines', 'vendor_offers', 'purchase_comparisons',
    'procurement_rfq_vendors', 'procurement_rfq_lines', 'procurement_rfqs',
    'procurement_requisition_lines', 'procurement_requisitions',
    'project_commercial_baselines', 'project_design_baselines', 'project_members', 'projects',
  ]) await pool.query(`delete from ${table}`);
  const files = await pool.query<{ storageName: string }>(`
    select storage_name as "storageName" from lead_attachments
    union all
    select storage_name as "storageName" from crm_import_batches
    union all
    select storage_name as "storageName" from design_revision_files
    union all
    select storage_name as "storageName" from survey_revision_files
  `);
  await Promise.all(files.rows.map((file) => removePrivateFile(file.storageName)));
  await pool.query('delete from crm_import_batches');
  await pool.query("delete from outbox_jobs where type = 'crm.reminder_due'");
  await pool.query('delete from reminder_occurrences');
  await pool.query('delete from reminder_rules');
  await pool.query('delete from lead_attachments');
  await pool.query('delete from crm_activities');
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
  await pool.query("delete from document_counters where document_type in ('LEAD', 'QUOTATION')");
  await pool.query('delete from auth_sessions');
  await pool.query('delete from audit_events');
  await pool.query('delete from users where email_normalized = any($1)', [[
    managerEmail, executiveEmail, administratorEmail,
  ]]);

  const company = await pool.query<{ id: string }>('select id from companies order by created_at limit 1');
  if (!company.rows[0]) throw new Error('Integration company is missing. Run the documented bootstrap command first.');

  for (const fixture of [
    { email: managerEmail, name: 'P2 Sales Manager', code: 'P2-MANAGER', role: 'sales_manager' },
    { email: executiveEmail, name: 'P2 Sales Executive', code: 'P2-EXEC', role: 'sales_executive' },
    { email: administratorEmail, name: 'P2 System Admin', code: 'P2-ADMIN', role: 'system_admin' },
  ]) {
    const inserted = await pool.query<{ id: string }>(`
      insert into users (
        company_id, employee_code, name, email, email_normalized, password_hash,
        status, must_change_password
      ) values ($1, $2, $3, $4, $4, $5, 'active', false)
      returning id
    `, [company.rows[0].id, fixture.code, fixture.name, fixture.email, passwordHash]);
    await pool.query(`
      insert into user_role_assignments (company_id, user_id, role_id)
      select $1, $2, id from roles where company_id = $1 and code = $3
    `, [company.rows[0].id, inserted.rows[0]!.id, fixture.role]);
  }
}

async function cleanP2Fixtures() {
  for (const table of [
    'procurement_selection_decisions', 'procurement_substitution_reviews', 'vendor_offer_lines', 'vendor_offers', 'purchase_comparisons',
    'procurement_rfq_vendors', 'procurement_rfq_lines', 'procurement_rfqs',
    'procurement_requisition_lines', 'procurement_requisitions',
    'project_commercial_baselines', 'project_design_baselines', 'project_members', 'projects',
  ]) await pool.query(`delete from ${table}`);
  const files = await pool.query<{ storageName: string }>(`
    select storage_name as "storageName" from lead_attachments
    union all
    select storage_name as "storageName" from crm_import_batches
    union all
    select storage_name as "storageName" from design_revision_files
    union all
    select storage_name as "storageName" from survey_revision_files
  `);
  await Promise.all(files.rows.map((file) => removePrivateFile(file.storageName)));
  await pool.query('delete from crm_import_batches');
  await pool.query("delete from outbox_jobs where type = 'crm.reminder_due'");
  await pool.query('delete from reminder_occurrences');
  await pool.query('delete from reminder_rules');
  await pool.query('delete from lead_attachments');
  await pool.query('delete from crm_activities');
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
  await pool.query("delete from document_counters where document_type in ('LEAD', 'QUOTATION')");
  await pool.query('delete from auth_sessions');
  await pool.query('delete from audit_events');
  await pool.query('delete from users where email_normalized = any($1)', [[
    managerEmail, executiveEmail, administratorEmail,
  ]]);
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email, password });
  expect(response.status).toBe(200);
  return { agent, csrf: csrfFrom(response) };
}

async function workbookBuffer(headers: string[], values: string[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(headers);
  sheet.addRow(values);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function formulaWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['display_name', 'contact_name', 'phone']);
  const row = sheet.addRow(['', 'Formula Contact', '9876509999']);
  row.getCell(1).value = { formula: 'CONCAT("Formula", " Customer")', result: 'Formula Customer' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('P2 scoped CRM lifecycle', () => {
  beforeAll(async () => { await ensureUploadRoot(); await resetP2Fixtures(); });
  afterAll(async () => {
    await cleanP2Fixtures();
    await closeDatabase();
  });

  it('keeps customer, lead and opportunity access assignment-scoped through qualification', async () => {
    const app = createApp();
    const manager = await login(app, managerEmail);
    const executive = await login(app, executiveEmail);
    const administrator = await login(app, administratorEmail);

    const categoryResponse = await manager.agent.post('/api/v1/crm/service-categories')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-category').send({ code: 'FIRE_ALARM', name: 'Fire alarm system' });
    expect(categoryResponse.status).toBe(201);
    const categoryId = categoryResponse.body.data.category.id as string;
    const purposeId = (await manager.agent.get('/api/v1/crm/classifications/lead-purposes')).body.data.items
      .find((item: { code: string }) => item.code === 'NEW_PROJECT').id as string;
    const sectorId = (await manager.agent.get('/api/v1/crm/classifications/market-sectors')).body.data.items
      .find((item: { code: string }) => item.code === 'INDUSTRIAL').id as string;

    expect((await administrator.agent.get('/api/v1/crm/service-categories')).status).toBe(403);

    const customerResponse = await manager.agent.post('/api/v1/crm/customers')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-customer').send({
        displayName: 'Acme Safety Works',
        legalName: 'Acme Safety Works Private Limited',
        contacts: [{
          name: 'Asha Mehta', phone: '+91 98765 43210', email: 'ASHA@ACME.EXAMPLE', isPrimary: true,
        }],
        addresses: [],
        sites: [{ name: 'Acme Plant One', addressLine1: 'Plot 12 Industrial Estate', city: 'Ahmedabad' }],
      });
    expect(customerResponse.status, JSON.stringify(customerResponse.body)).toBe(201);
    expect(customerResponse.body.data.customer).not.toHaveProperty('taxIdentifier');
    const customer = customerResponse.body.data.customer;

    const secondPrimary = await manager.agent.post(`/api/v1/crm/customers/${customer.id}/contacts`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-second-primary').send({
        name: 'Another Primary', phone: '9876500000', isPrimary: true,
      });
    expect(secondPrimary.status).toBe(409);
    expect(secondPrimary.body.error.code).toBe('CONFLICT');

    const managerLead = await manager.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-manager-lead').send({
        inquiryName: 'Acme alarm enquiry',
        companyName: 'Acme Safety Works',
        contactName: 'Asha Mehta',
        phone: '+91 98765 43210',
        email: 'asha@acme.example',
        source: 'Referral',
        serviceCategoryId: categoryId,
        purposeId, sectorId,
      });
    expect(managerLead.status).toBe(201);
    expect(managerLead.body.data.lead.leadNumber).toMatch(/^FS-LEAD-\d{4}-000001$/);
    expect(managerLead.body.data.duplicateHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'customer', id: customer.id }),
    ]));
    const managerLeadId = managerLead.body.data.lead.id as string;

    const executiveBeforeAssignment = await executive.agent.get('/api/v1/crm/leads');
    expect(executiveBeforeAssignment.status).toBe(200);
    expect(executiveBeforeAssignment.body.data).toMatchObject({ total: 0, items: [] });
    expect((await executive.agent.get(`/api/v1/crm/leads/${managerLeadId}`)).status).toBe(404);
    expect((await executive.agent.get('/api/v1/crm/customers')).body.data.total).toBe(0);

    const assignees = await manager.agent.get('/api/v1/crm/assignees');
    expect(assignees.body.data.items.some(
      (item: { email: string }) => item.email === administratorEmail,
    )).toBe(false);
    const executiveId = assignees.body.data.items.find(
      (item: { email: string }) => item.email === executiveEmail,
    ).id as string;
    const managerId = assignees.body.data.items.find(
      (item: { email: string }) => item.email === managerEmail,
    ).id as string;

    const bulkCandidate = await manager.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-bulk-candidate').send({
        inquiryName: 'Bulk assignment candidate',
        contactName: 'Bhavna Desai',
        phone: '9825019999',
        source: 'Campaign',
        serviceCategoryId: categoryId,
        purposeId, sectorId,
      });
    expect(bulkCandidate.status).toBe(201);
    const bulkCandidateId = bulkCandidate.body.data.lead.id as string;

    const unauthorizedBulkAssignment = await executive.agent.post('/api/v1/crm/leads/bulk/assign')
      .set('Origin', origin).set('X-CSRF-Token', executive.csrf)
      .set('X-Request-Id', 'p2-unauthorized-bulk-assignment').send({
        targets: [{ id: bulkCandidateId, expectedVersion: 1 }],
        assigneeUserId: managerId,
      });
    expect(unauthorizedBulkAssignment.status).toBe(403);

    const bulkAssignment = await manager.agent.post('/api/v1/crm/leads/bulk/assign')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-bulk-assignment').send({
        targets: [{ id: bulkCandidateId, expectedVersion: 1 }],
        assigneeUserId: executiveId,
      });
    expect(bulkAssignment.status, JSON.stringify(bulkAssignment.body)).toBe(200);
    expect(bulkAssignment.body.data).toMatchObject({ selected: 1, updated: 1, unchanged: 0 });
    const staleBulkAssignment = await manager.agent.post('/api/v1/crm/leads/bulk/assign')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-stale-bulk-assignment').send({
        targets: [{ id: bulkCandidateId, expectedVersion: 1 }],
        assigneeUserId: managerId,
      });
    expect(staleBulkAssignment.status).toBe(404);

    const delegatedLead = await manager.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-delegated-lead').send({
        inquiryName: 'Beta extinguisher enquiry',
        contactName: 'Bharat Patel',
        phone: '98250 10000',
        source: 'Website',
        serviceCategoryId: categoryId,
        purposeId, sectorId,
        ownerUserId: executiveId,
      });
    expect(delegatedLead.status).toBe(201);
    const delegatedLeadId = delegatedLead.body.data.lead.id as string;

    const executiveAfterAssignment = await executive.agent.get('/api/v1/crm/leads');
    expect(executiveAfterAssignment.body.data.total).toBe(2);
    expect(executiveAfterAssignment.body.data.items.map((item: { id: string }) => item.id))
      .toEqual(expect.arrayContaining([bulkCandidateId, delegatedLeadId]));

    const sortedPage = await manager.agent.get('/api/v1/crm/leads?sort=inquiryName&direction=asc&pageSize=1');
    expect(sortedPage.body.data).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(sortedPage.body.data.items[0].inquiryName).toBe('Acme alarm enquiry');

    const activity = await manager.agent.post(`/api/v1/crm/leads/${delegatedLeadId}/activities`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-activity').send({
        type: 'call', summary: 'Confirmed the initial extinguisher requirement.', occurredAt: new Date().toISOString(),
      });
    expect(activity.status).toBe(201);
    expect((await executive.agent.get(`/api/v1/crm/leads/${delegatedLeadId}/activities`)).body.data.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'call' })]));

    const reminder = await manager.agent.post(`/api/v1/crm/leads/${delegatedLeadId}/reminders`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-reminder').send({
        title: 'Call about extinguisher quantities',
        assigneeUserId: executiveId,
        timezone: 'Asia/Kolkata',
        dueAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        recurrence: 'weekly',
      });
    expect(reminder.status, JSON.stringify(reminder.body)).toBe(201);
    const executiveReminders = await executive.agent.get('/api/v1/crm/reminders?status=pending');
    expect(executiveReminders.body.data.total).toBe(1);
    expect((await manager.agent.get('/api/v1/crm/reminders?status=pending')).body.data.total).toBe(0);
    await pool.query("update outbox_jobs set due_at = now() where type = 'crm.reminder_due'");
    expect(await processOneOutboxJob(pool, 'p2-reminder-worker-failure', {
      mailDeliveryMode: 'smtp',
      smtpFrom: 'notifications@example.test',
      smtpSend: async (message) => ({ accepted: [], rejected: [message.to] }),
    })).toBe(true);
    const recurringAfterRejectedEmail = await pool.query<{ count: string }>(
      'select count(*) from reminder_occurrences where rule_id = $1',
      [reminder.body.data.reminder.ruleId],
    );
    expect(Number(recurringAfterRejectedEmail.rows[0]!.count)).toBe(2);
    const retryingReminderJob = await pool.query<{ status: string; attempts: number }>(`
      select status, attempts from outbox_jobs
      where type = 'crm.reminder_due' and payload->>'occurrenceId' = $1
    `, [reminder.body.data.reminder.id]);
    expect(retryingReminderJob.rows[0]).toMatchObject({ status: 'pending', attempts: 1 });
    await pool.query(`
      update outbox_jobs set due_at = now()
      where type = 'crm.reminder_due' and payload->>'occurrenceId' = $1
    `, [reminder.body.data.reminder.id]);
    const reminderEmails: Array<{ to: string; subject: string; messageId: string; text: string }> = [];
    expect(await processOneOutboxJob(pool, 'p2-reminder-worker', {
      mailDeliveryMode: 'smtp',
      smtpFrom: 'notifications@example.test',
      appOrigin: origin,
      smtpSend: async (message) => {
        reminderEmails.push(message);
        return { accepted: [message.to], rejected: [] };
      },
    })).toBe(true);
    expect(reminderEmails).toEqual([expect.objectContaining({
      to: executiveEmail,
      subject: 'Follow-up due: Call about extinguisher quantities',
      messageId: expect.stringMatching(/^<outbox-.+@example\.test>$/),
      text: expect.stringContaining(`${origin}/crm/follow-ups`),
    })]);
    const recurringOccurrences = await pool.query<{ count: string }>(
      'select count(*) from reminder_occurrences where rule_id = $1',
      [reminder.body.data.reminder.ruleId],
    );
    expect(Number(recurringOccurrences.rows[0]!.count)).toBe(2);
    expect(await processOneOutboxJob(pool, 'p2-reminder-worker')).toBe(false);
    const completed = await executive.agent.post(`/api/v1/crm/reminders/${reminder.body.data.reminder.id}/complete`)
      .set('Origin', origin).set('X-CSRF-Token', executive.csrf)
      .set('X-Request-Id', 'p2-reminder-complete').send({ expectedVersion: 1 });
    expect(completed.status).toBe(200);
    expect(completed.body.data.reminder.status).toBe('completed');

    const bulkReminders = await manager.agent.post('/api/v1/crm/leads/bulk/reminders')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-bulk-reminders').send({
        targets: [
          { id: managerLeadId, expectedVersion: 1 },
          { id: delegatedLeadId, expectedVersion: 1 },
        ],
        title: 'Review next CRM action',
        assigneeUserId: executiveId,
        timezone: 'Asia/Kolkata',
        dueAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        recurrence: 'none',
      });
    expect(bulkReminders.status, JSON.stringify(bulkReminders.body)).toBe(201);
    expect(bulkReminders.body.data.created).toBe(2);

    const attachment = await manager.agent.post(`/api/v1/crm/leads/${managerLeadId}/attachments`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-attachment')
      .attach('file', Buffer.from('%PDF-1.4 scoped test'), { filename: 'survey-note.pdf', contentType: 'application/pdf' });
    expect(attachment.status, JSON.stringify(attachment.body)).toBe(201);
    expect(attachment.body.data.attachment).not.toHaveProperty('storageName');
    expect(attachment.body.data.attachment.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    const attachmentId = attachment.body.data.attachment.id as string;
    expect((await manager.agent.get(`/api/v1/crm/leads/${managerLeadId}/attachments/${attachmentId}/download`)).status).toBe(200);
    expect((await executive.agent.get(`/api/v1/crm/leads/${managerLeadId}/attachments/${attachmentId}/download`)).status).toBe(404);

    const unauthorizedAssignment = await executive.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', executive.csrf)
      .set('X-Request-Id', 'p2-unauthorized-assignment').send({
        inquiryName: 'Gamma enquiry', contactName: 'Gita Shah', phone: '98980 11111',
        source: 'Walk-in', serviceCategoryId: categoryId, purposeId, sectorId, ownerUserId: managerId,
      });
    expect(unauthorizedAssignment.status).toBe(403);

    const contacted = await manager.agent.post(`/api/v1/crm/leads/${delegatedLeadId}/stage`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-contacted').send({ expectedVersion: 1, stage: 'contacted' });
    expect(contacted.status).toBe(200);
    const staleStageChange = await manager.agent.post(`/api/v1/crm/leads/${delegatedLeadId}/stage`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-stale').send({ expectedVersion: 1, stage: 'on_hold' });
    expect(staleStageChange.status).toBe(409);

    const qualification = await manager.agent.post(`/api/v1/crm/leads/${managerLeadId}/qualify`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-qualification').send({
        expectedVersion: 1,
        customerId: customer.id,
        primaryContactId: customer.contacts[0].id,
        siteId: customer.sites[0].id,
        title: 'Acme fire alarm opportunity',
        qualificationNotes: 'Customer confirmed scope discussion can proceed.',
      });
    expect(qualification.status).toBe(201);
    expect(qualification.body.data).toMatchObject({
      replayed: false,
      opportunity: { commercialState: 'unawarded', customerId: customer.id },
    });
    expect((await manager.agent.get('/api/v1/crm/opportunities')).body.data.total).toBe(1);
    expect((await executive.agent.get('/api/v1/crm/opportunities')).body.data.total).toBe(0);

    expect((await manager.agent.get('/api/v1/crm/imports/customers/template')).status).toBe(200);
    expect((await manager.agent.get('/api/v1/crm/imports/open_leads/template')).status).toBe(200);
    expect((await administrator.agent.get('/api/v1/crm/imports/customers/template')).status).toBe(403);

    const formulaImport = await manager.agent.post('/api/v1/crm/imports/customers/stage')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .attach('file', await formulaWorkbookBuffer(), {
        filename: 'formula-customers.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(formulaImport.status).toBe(422);
    expect(formulaImport.body.error.message).toContain('Formula values are not allowed');

    const customerWorkbook = await workbookBuffer(
      ['display_name', 'legal_name', 'contact_name', 'phone', 'email', 'site_name', 'site_address', 'city'],
      ['Imported Customer', 'Imported Customer Private Limited', 'Isha Patel', '9876501234', '', 'Imported Site', 'Station Road', 'Surat'],
    );
    const stagedCustomers = await manager.agent.post('/api/v1/crm/imports/customers/stage')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-customer-import-stage')
      .attach('file', customerWorkbook, {
        filename: 'customers.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(stagedCustomers.status, JSON.stringify(stagedCustomers.body)).toBe(201);
    expect(stagedCustomers.body.data.batch).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0, status: 'staged' });
    expect(stagedCustomers.body.data.batch).not.toHaveProperty('storageName');
    const committedCustomers = await manager.agent.post(`/api/v1/crm/imports/${stagedCustomers.body.data.batch.id}/commit`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-customer-import-commit')
      .send({ expectedVersion: stagedCustomers.body.data.batch.rowVersion });
    expect(committedCustomers.status, JSON.stringify(committedCustomers.body)).toBe(200);
    expect(committedCustomers.body.data.batch).toMatchObject({ status: 'completed' });
    expect(committedCustomers.body.data.batch.rows[0]).toMatchObject({ status: 'created' });
    expect((await manager.agent.post(`/api/v1/crm/imports/${stagedCustomers.body.data.batch.id}/commit`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .send({ expectedVersion: stagedCustomers.body.data.batch.rowVersion })).status).toBe(409);

    const leadWorkbook = await workbookBuffer(
      ['inquiry_name', 'company_name', 'contact_name', 'phone', 'email', 'address', 'source', 'service_category_code', 'purpose_code', 'sector_code', 'owner_email'],
      ['Imported open lead', 'Imported Customer', 'Isha Patel', '9876501234', '', 'Station Road, Surat', 'Excel import', 'FIRE_ALARM', 'NEW_PROJECT', 'INDUSTRIAL', managerEmail],
    );
    const stagedLeads = await manager.agent.post('/api/v1/crm/imports/open_leads/stage')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-lead-import-stage')
      .attach('file', leadWorkbook, {
        filename: 'open-leads.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(stagedLeads.status, JSON.stringify(stagedLeads.body)).toBe(201);
    expect(stagedLeads.body.data.batch).toMatchObject({ validRows: 1, invalidRows: 0 });
    expect(stagedLeads.body.data.batch.rows[0].warnings.length).toBeGreaterThan(0);
    const committedLeads = await manager.agent.post(`/api/v1/crm/imports/${stagedLeads.body.data.batch.id}/commit`)
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-lead-import-commit')
      .send({ expectedVersion: stagedLeads.body.data.batch.rowVersion });
    expect(committedLeads.status, JSON.stringify(committedLeads.body)).toBe(200);
    expect(committedLeads.body.data.batch.rows[0]).toMatchObject({ status: 'created' });

    const audit = await pool.query<{ action: string }>(`
      select action from audit_events
      where request_id in ('p2-category', 'p2-customer', 'p2-manager-lead', 'p2-qualification')
      order by occurred_at
    `);
    expect(audit.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      'crm.service_category_created', 'crm.customer_created', 'crm.lead_created', 'crm.lead_qualified',
    ]));
  });
});
