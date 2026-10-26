import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './core/security/password.js';
import { closeDatabase, pool } from './infrastructure/database/db.js';
import { processOneOutboxJob } from './infrastructure/jobs/outboxWorker.js';

const origin = 'http://localhost:5173';
const adminEmail = 'p1-admin@example.test';
const initialAdminPassword = 'LocalAdminPassword123!';
const changedAdminPassword = 'AdminUpdatedPassword123!';
const employeeEmail = 'p1-sales@example.test';
const employeeTemporaryPassword = 'SalesTemporaryPassword123!';
const employeePassword = 'SalesUpdatedPassword123!';
const adminIssuedPassword = 'SalesAdminResetPassword123!';
const resetPassword = 'SalesResetPassword123!';

function csrfFrom(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('fs_csrf='));
  if (!csrfCookie) throw new Error('CSRF cookie was not returned.');
  return decodeURIComponent(csrfCookie.split(';', 1)[0]!.slice('fs_csrf='.length));
}

async function resetIntegrationFixtures() {
  const passwordHash = await hashPassword(initialAdminPassword);
  // Later-phase fixtures may reference users; keep this foundation test rerunnable as the schema grows.
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
  await pool.query('delete from boq_review_actions');
  await pool.query('delete from estimate_cost_lines');
  await pool.query('delete from boq_lines');
  await pool.query('delete from boq_revisions');
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
  await pool.query('delete from items');
  await pool.query('delete from brands');
  await pool.query('delete from item_categories');
  await pool.query('delete from units');
  await pool.query("delete from document_counters where document_type in ('LEAD', 'QUOTATION')");
  await pool.query('delete from idempotency_records');
  await pool.query('delete from password_reset_tokens');
  await pool.query('delete from auth_sessions');
  await pool.query('delete from audit_events');
  await pool.query('delete from outbox_jobs');
  await pool.query('delete from users where email_normalized <> $1', [adminEmail]);
  await pool.query('delete from roles where is_system = false');
  const result = await pool.query(`
    update users
    set password_hash = $2, status = 'active', disabled_at = null, disabled_reason = null,
        must_change_password = true, access_version = access_version + 1,
        row_version = row_version + 1, updated_at = now()
    where email_normalized = $1
    returning id
  `, [adminEmail, passwordHash]);
  if (result.rowCount !== 1) {
    throw new Error('Integration administrator is missing. Run the documented bootstrap command first.');
  }
}

describe('P1 database-backed employee access lifecycle', () => {
  beforeAll(resetIntegrationFixtures);
  afterAll(closeDatabase);

  it('handles password change, scoped access, revocation, reset, logout, and worker failure honestly', async () => {
    const app = createApp();
    const admin = request.agent(app);

    const initialLogin = await admin.post('/api/v1/auth/login').set('Origin', origin).send({
      email: adminEmail,
      password: initialAdminPassword,
    });
    expect(initialLogin.status).toBe(200);
    expect(initialLogin.body.data.user).toMatchObject({ email: adminEmail, mustChangePassword: true });
    let adminCsrf = csrfFrom(initialLogin);

    const blockedUntilPasswordChange = await admin.get('/api/v1/admin/users');
    expect(blockedUntilPasswordChange.status).toBe(403);

    const passwordChange = await admin.post('/api/v1/auth/password/change')
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({ currentPassword: initialAdminPassword, password: changedAdminPassword });
    expect(passwordChange.status).toBe(200);
    expect((await admin.get('/api/v1/auth/me')).status).toBe(401);

    const adminLogin = await admin.post('/api/v1/auth/login').set('Origin', origin).send({
      email: adminEmail,
      password: changedAdminPassword,
    });
    expect(adminLogin.status).toBe(200);
    adminCsrf = csrfFrom(adminLogin);

    const rolesResponse = await admin.get('/api/v1/admin/roles');
    expect(rolesResponse.status).toBe(200);
    const salesRole = rolesResponse.body.data.items.find((role: { code: string }) => role.code === 'sales_executive');
    expect(salesRole).toBeDefined();
    expect(salesRole.permissionCodes).toContain('crm.lead.read');

    const permissionsResponse = await admin.get('/api/v1/admin/permissions');
    expect(permissionsResponse.status).toBe(200);
    expect(permissionsResponse.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'crm.lead.read' }),
      expect.objectContaining({ code: 'identity.roles.manage' }),
    ]));

    const customRoleResponse = await admin.post('/api/v1/admin/roles')
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({
        code: 'crm_viewer',
        name: 'CRM viewer',
        description: 'Integration role for assigned CRM records.',
        permissionCodes: ['crm.service_category.read', 'crm.customer.read', 'crm.lead.read', 'crm.opportunity.read'],
      });
    expect(customRoleResponse.status).toBe(201);
    const customRole = customRoleResponse.body.data.role;

    const creation = await admin.post('/api/v1/admin/users')
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({
        employeeCode: 'P1-SALES',
        name: 'P1 Sales Fixture',
        email: employeeEmail,
        temporaryPassword: employeeTemporaryPassword,
        roleIds: [salesRole.id],
      });
    expect(creation.status).toBe(201);
    expect(creation.body.data.user).not.toHaveProperty('passwordHash');
    const employeeId = creation.body.data.user.id as string;

    const employee = request.agent(app);
    const employeeInitialLogin = await employee.post('/api/v1/auth/login').set('Origin', origin).send({
      email: employeeEmail,
      password: employeeTemporaryPassword,
    });
    expect(employeeInitialLogin.status).toBe(200);
    const employeeInitialCsrf = csrfFrom(employeeInitialLogin);
    const employeePasswordChange = await employee.post('/api/v1/auth/password/change')
      .set('Origin', origin).set('X-CSRF-Token', employeeInitialCsrf)
      .send({ currentPassword: employeeTemporaryPassword, password: employeePassword });
    expect(employeePasswordChange.status).toBe(200);

    const employeeLogin = await employee.post('/api/v1/auth/login').set('Origin', origin).send({
      email: employeeEmail,
      password: employeePassword,
    });
    expect(employeeLogin.status).toBe(200);
    expect((await employee.get('/api/v1/admin/users')).status).toBe(403);

    const currentEmployee = (await admin.get('/api/v1/admin/users')).body.data.items.find(
      (item: { id: string }) => item.id === employeeId,
    );
    const roleAssignment = await admin.put(`/api/v1/admin/users/${employeeId}/roles`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({
        rowVersion: currentEmployee.rowVersion,
        roleIds: [customRole.id],
        reason: 'P1 role administration verification',
      });
    expect(roleAssignment.status).toBe(200);
    expect((await employee.get('/api/v1/auth/me')).status).toBe(401);
    const employeeAfterRoleChange = await employee.post('/api/v1/auth/login').set('Origin', origin).send({
      email: employeeEmail,
      password: employeePassword,
    });
    expect(employeeAfterRoleChange.status).toBe(200);
    expect(employeeAfterRoleChange.body.data.user.permissions).toContain('crm.lead.read');

    const assignedRoleDeactivation = await admin.post(`/api/v1/admin/roles/${customRole.id}/deactivate`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({ expectedVersion: customRole.rowVersion, reason: 'Must fail while assigned' });
    expect(assignedRoleDeactivation.status).toBe(409);

    const employeeRow = await pool.query<{ row_version: number }>(
      'select row_version from users where id = $1', [employeeId],
    );
    const disable = await admin.post(`/api/v1/admin/users/${employeeId}/disable`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({ rowVersion: employeeRow.rows[0]!.row_version, reason: 'P1 revocation verification' });
    expect(disable.status).toBe(200);
    expect(disable.body.data.user).not.toHaveProperty('passwordHash');
    expect((await employee.get('/api/v1/auth/me')).status).toBe(401);

    const enable = await admin.post(`/api/v1/admin/users/${employeeId}/enable`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({ rowVersion: disable.body.data.user.rowVersion, reason: 'P1 reset verification' });
    expect(enable.status).toBe(200);

    const employeeAfterEnable = await employee.post('/api/v1/auth/login').set('Origin', origin).send({
      email: employeeEmail,
      password: employeePassword,
    });
    expect(employeeAfterEnable.status).toBe(200);

    const adminReset = await admin.post(`/api/v1/admin/users/${employeeId}/reset-password`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({
        rowVersion: enable.body.data.user.rowVersion,
        temporaryPassword: adminIssuedPassword,
        reason: 'P1 administrator reset verification',
      });
    expect(adminReset.status).toBe(200);
    expect(adminReset.body.data.user).not.toHaveProperty('passwordHash');
    expect((await employee.get('/api/v1/auth/me')).status).toBe(401);

    const employeeAfterAdminReset = await employee.post('/api/v1/auth/login').set('Origin', origin).send({
      email: employeeEmail,
      password: adminIssuedPassword,
    });
    expect(employeeAfterAdminReset.body.data.user.mustChangePassword).toBe(true);
    const adminResetCsrf = csrfFrom(employeeAfterAdminReset);
    expect((await employee.post('/api/v1/auth/password/change')
      .set('Origin', origin).set('X-CSRF-Token', adminResetCsrf)
      .send({ currentPassword: adminIssuedPassword, password: employeePassword })).status).toBe(200);

    expect((await employee.post('/api/v1/auth/login').set('Origin', origin).send({
      email: employeeEmail,
      password: employeePassword,
    })).status).toBe(200);

    const resetRequest = await request(app).post('/api/v1/auth/password-reset/request')
      .set('Origin', origin).send({ email: employeeEmail });
    expect(resetRequest.status).toBe(202);
    const resetJob = await pool.query<{ id: string; company_id: string; payload: { token: string } }>(`
      select id, company_id, payload from outbox_jobs
      where type = 'identity.password_reset_requested' and payload->>'email' = $1
      order by created_at desc limit 1
    `, [employeeEmail]);
    const resetToken = resetJob.rows[0]?.payload.token;
    expect(resetToken).toBeTypeOf('string');

    const resetConfirm = await request(app).post('/api/v1/auth/password-reset/confirm')
      .set('Origin', origin).send({ token: resetToken, password: resetPassword });
    expect(resetConfirm.status).toBe(200);
    expect((await employee.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').set('Origin', origin)
      .send({ email: employeeEmail, password: resetPassword })).status).toBe(200);

    expect(await processOneOutboxJob(pool, 'p1-integration-worker')).toBe(true);
    const processedJob = await pool.query<{ status: string; last_error: string }>(
      'select status, last_error from outbox_jobs where id = $1', [resetJob.rows[0]!.id],
    );
    expect(processedJob.rows[0]).toMatchObject({
      status: 'failed',
      last_error: expect.stringContaining('not configured'),
    });

    const abandonedJob = await pool.query<{ id: string }>(`
      insert into outbox_jobs (
        company_id, type, payload, dedup_key, status, attempts, max_attempts,
        lease_owner, lease_expires_at
      ) values ($1, 'p1.worker_recovery_probe', '{}'::jsonb, 'p1-expired-lease',
        'processing', 1, 5, 'stopped-worker', now() - interval '1 minute')
      returning id
    `, [resetJob.rows[0]!.company_id]);
    expect(await processOneOutboxJob(pool, 'p1-recovery-worker')).toBe(true);
    const recoveredJob = await pool.query<{ status: string; attempts: number; lease_owner: string | null }>(
      'select status, attempts, lease_owner from outbox_jobs where id = $1', [abandonedJob.rows[0]!.id],
    );
    expect(recoveredJob.rows[0]).toMatchObject({ status: 'failed', attempts: 2, lease_owner: null });

    const latestEmployee = (await admin.get('/api/v1/admin/users')).body.data.items.find(
      (item: { id: string }) => item.id === employeeId,
    );
    const restoreSalesRole = await admin.put(`/api/v1/admin/users/${employeeId}/roles`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({
        rowVersion: latestEmployee.rowVersion,
        roleIds: [salesRole.id],
        reason: 'Release custom role before deactivation test',
      });
    expect(restoreSalesRole.status).toBe(200);

    const customRoleUpdate = await admin.put(`/api/v1/admin/roles/${customRole.id}`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({
        expectedVersion: customRole.rowVersion,
        name: 'CRM read-only',
        description: 'Updated integration role.',
        permissionCodes: ['crm.service_category.read', 'crm.customer.read', 'crm.lead.read'],
        reason: 'P1 custom-role update verification',
      });
    expect(customRoleUpdate.status).toBe(200);
    expect(customRoleUpdate.body.data.role).toMatchObject({ name: 'CRM read-only', rowVersion: 2 });
    const customRoleDeactivation = await admin.post(`/api/v1/admin/roles/${customRole.id}/deactivate`)
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf)
      .send({ expectedVersion: 2, reason: 'P1 custom-role deactivation verification' });
    expect(customRoleDeactivation.status).toBe(200);
    expect(customRoleDeactivation.body.data.role.isActive).toBe(false);

    const logout = await admin.post('/api/v1/auth/logout')
      .set('Origin', origin).set('X-CSRF-Token', adminCsrf);
    expect(logout.status).toBe(200);
    expect((await admin.get('/api/v1/auth/me')).status).toBe(401);
  });
});
