import { expect, test, type Page } from '@playwright/test';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  companyId: '00000000-0000-4000-8000-000000000002',
  name: 'CRM Test Manager',
  email: 'crm@example.test',
  mustChangePassword: false,
  permissions: [
    'crm.service_category.read', 'crm.service_category.manage', 'crm.customer.read',
    'crm.customer_master.manage', 'crm.lead.read', 'crm.lead.write', 'crm.lead.assign',
    'crm.lead.qualify', 'crm.opportunity.read',
  ],
};

async function mockCrm(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ json: { data: { user }, requestId: 'e2e-session' } });
    } else if (path.endsWith('/crm/service-categories')) {
      await route.fulfill({ json: { data: { items: [{ id: 'category-1', code: 'ALARM', name: 'Fire alarm system', status: 'active', rowVersion: 1 }] }, requestId: 'e2e-category' } });
    } else if (path.endsWith('/crm/assignees')) {
      await route.fulfill({ json: { data: { items: [{ id: user.id, name: user.name, email: user.email }] }, requestId: 'e2e-assignees' } });
    } else if (path.endsWith('/crm/leads')) {
      await route.fulfill({ json: { data: { items: [{
        id: 'lead-1', leadNumber: 'FS-LEAD-2026-000001', inquiryName: 'Warehouse alarm enquiry',
        companyName: 'Example Industries', contactName: 'Anita Shah', phone: '9876543210', email: null,
        source: 'Referral', stage: 'new', ownerUserId: user.id, rowVersion: 1,
        updatedAt: '2026-10-10T10:00:00.000Z', serviceCategoryName: 'Fire alarm system',
      }], total: 1, page: 1, pageSize: 20 }, requestId: 'e2e-leads' } });
    } else if (path.endsWith('/crm/leads/lead-1')) {
      await route.fulfill({ json: { data: { lead: {
        id: 'lead-1', leadNumber: 'FS-LEAD-2026-000001', inquiryName: 'Warehouse alarm enquiry',
        companyName: 'Example Industries', contactName: 'Anita Shah', phone: '9876543210', email: null,
        address: null, source: 'Referral', serviceCategoryId: 'category-1', ownerUserId: user.id,
        customerId: null, primaryContactId: null, siteId: null, stage: 'new', lostReason: null,
        qualificationNotes: null, rowVersion: 1, createdAt: '2026-10-10T10:00:00.000Z',
        updatedAt: '2026-10-10T10:00:00.000Z',
      } }, requestId: 'e2e-lead' } });
    } else {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not mocked' }, requestId: 'e2e-missing' } });
    }
  });
}

test.describe('P2 CRM screens', () => {
  test('shows assigned leads and the create workflow on desktop', async ({ page }) => {
    await mockCrm(page);
    await page.goto('/crm/leads');
    await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible();
    const leadRow = page.getByRole('button', { name: /Warehouse alarm enquiry/ });
    await expect(leadRow).toBeVisible();
    await leadRow.click();
    await expect(page.getByRole('heading', { name: 'Warehouse alarm enquiry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Qualify' })).toBeVisible();
    await page.getByRole('button', { name: 'Add lead' }).click();
    await expect(page.getByRole('heading', { name: 'New lead' })).toBeVisible();
    await expect(page.getByLabel('Service')).toBeVisible();
  });

  test('keeps the CRM navigation and lead view usable on mobile', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await context.newPage();
    await mockCrm(page);
    await page.goto('/crm/leads');
    await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Opportunities' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
});
