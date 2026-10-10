import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './core/security/password.js';
import { closeDatabase, pool } from './infrastructure/database/db.js';

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
  await pool.query("delete from document_counters where document_type = 'LEAD'");
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
  await pool.query("delete from document_counters where document_type = 'LEAD'");
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

describe('P2 scoped CRM lifecycle', () => {
  beforeAll(resetP2Fixtures);
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

    const delegatedLead = await manager.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', manager.csrf)
      .set('X-Request-Id', 'p2-delegated-lead').send({
        inquiryName: 'Beta extinguisher enquiry',
        contactName: 'Bharat Patel',
        phone: '98250 10000',
        source: 'Website',
        serviceCategoryId: categoryId,
        ownerUserId: executiveId,
      });
    expect(delegatedLead.status).toBe(201);
    const delegatedLeadId = delegatedLead.body.data.lead.id as string;

    const executiveAfterAssignment = await executive.agent.get('/api/v1/crm/leads');
    expect(executiveAfterAssignment.body.data.total).toBe(1);
    expect(executiveAfterAssignment.body.data.items[0].id).toBe(delegatedLeadId);

    const unauthorizedAssignment = await executive.agent.post('/api/v1/crm/leads')
      .set('Origin', origin).set('X-CSRF-Token', executive.csrf)
      .set('X-Request-Id', 'p2-unauthorized-assignment').send({
        inquiryName: 'Gamma enquiry', contactName: 'Gita Shah', phone: '98980 11111',
        source: 'Walk-in', serviceCategoryId: categoryId, ownerUserId: managerId,
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
