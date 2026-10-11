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
    'crm.lead.qualify', 'crm.lead.authorize_design', 'crm.opportunity.read',
    'procurement.vendor.read', 'procurement.vendor.manage',
    'procurement.item.read', 'procurement.item.manage',
  ],
};

async function mockCrm(page: Page, leadStage: 'new' | 'qualified' = 'new') {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ json: { data: { user }, requestId: 'e2e-session' } });
    } else if (path.endsWith('/crm/service-categories')) {
      await route.fulfill({ json: { data: { items: [{ id: 'category-1', code: 'ALARM', name: 'Fire alarm system', status: 'active', rowVersion: 1 }] }, requestId: 'e2e-category' } });
    } else if (path.endsWith('/crm/assignees')) {
      await route.fulfill({ json: { data: { items: [{ id: user.id, name: user.name, email: user.email }] }, requestId: 'e2e-assignees' } });
    } else if (path.endsWith('/crm/design-assignees')) {
      const designUser = url.searchParams.get('role') === 'design_head'
        ? { id: 'head-1', name: 'Design Head', email: 'head@example.test' }
        : { id: 'designer-1', name: 'Design Engineer', email: 'designer@example.test' };
      await route.fulfill({ json: { data: { items: [designUser] }, requestId: 'e2e-design-assignees' } });
    } else if (path.endsWith('/masters/items')) {
      await route.fulfill({ json: { data: { items: [{ id: 'item-1', code: 'SD-001', name: 'Smoke detector', specification: 'Addressable optical detector', categoryId: 'item-category-1', categoryName: 'Fire alarm equipment', unitId: 'unit-1', unitName: 'Numbers', unitSymbol: 'No.', status: 'active', rowVersion: 1, updatedAt: '2026-10-10T10:00:00.000Z' }], total: 1, page: 1, pageSize: 20 }, requestId: 'e2e-items' } });
    } else if (path.endsWith('/masters/units')) {
      await route.fulfill({ json: { data: { items: [{ id: 'unit-1', code: 'NOS', name: 'Numbers', symbol: 'No.', status: 'active', rowVersion: 1, updatedAt: '2026-10-10T10:00:00.000Z' }], total: 1, page: 1, pageSize: 100 }, requestId: 'e2e-units' } });
    } else if (path.endsWith('/masters/item-categories')) {
      await route.fulfill({ json: { data: { items: [{ id: 'item-category-1', code: 'ALARM', name: 'Fire alarm equipment', status: 'active', rowVersion: 1, updatedAt: '2026-10-10T10:00:00.000Z' }], total: 1, page: 1, pageSize: 100 }, requestId: 'e2e-item-categories' } });
    } else if (path.endsWith('/crm/leads')) {
      await route.fulfill({ json: { data: { items: [{
        id: 'lead-1', leadNumber: 'FS-LEAD-2026-000001', inquiryName: 'Warehouse alarm enquiry',
        companyName: 'Example Industries', contactName: 'Anita Shah', phone: '9876543210', email: null,
        source: 'Referral', stage: leadStage, ownerUserId: user.id, rowVersion: 1,
        updatedAt: '2026-10-10T10:00:00.000Z', serviceCategoryName: 'Fire alarm system',
      }], total: 1, page: 1, pageSize: 20 }, requestId: 'e2e-leads' } });
    } else if (path.endsWith('/crm/reminders')) {
      await route.fulfill({ json: { data: { items: [{
        id: 'reminder-1', ruleId: 'rule-1', leadId: 'lead-1', leadNumber: 'FS-LEAD-2026-000001',
        leadName: 'Warehouse alarm enquiry', title: 'Call customer', dueAt: '2026-10-12T10:00:00.000Z',
        timezone: 'Asia/Kolkata', recurrence: 'none', status: 'pending', rowVersion: 1, completedAt: null,
      }], total: 1, page: 1, pageSize: 5 }, requestId: 'e2e-reminders' } });
    } else if (path.endsWith('/crm/customers')) {
      await route.fulfill({ json: { data: { items: [], total: 3, page: 1, pageSize: 1 }, requestId: 'e2e-customers' } });
    } else if (path.endsWith('/crm/opportunities')) {
      await route.fulfill({ json: { data: { items: [], total: 2, page: 1, pageSize: 1 }, requestId: 'e2e-opportunities' } });
    } else if (path.endsWith('/crm/leads/lead-1/authorize-design')) {
      await route.fulfill({ status: 201, json: { data: { designJob: { id: 'design-job-1', leadId: 'lead-1', opportunityId: 'opportunity-1', title: 'Warehouse alarm design', status: 'authorized', designerUserId: 'designer-1', designHeadUserId: 'head-1', surveyRequested: false, authorizationNotes: 'Prepare layout', authorizedByUserId: user.id, authorizedAt: '2026-10-11T10:00:00.000Z', rowVersion: 1 }, replayed: false }, requestId: 'e2e-design-authorized' } });
    } else if (path.endsWith('/crm/leads/lead-1')) {
      await route.fulfill({ json: { data: { lead: {
        id: 'lead-1', leadNumber: 'FS-LEAD-2026-000001', inquiryName: 'Warehouse alarm enquiry',
        companyName: 'Example Industries', contactName: 'Anita Shah', phone: '9876543210', email: null,
        address: null, source: 'Referral', serviceCategoryId: 'category-1', ownerUserId: user.id,
        customerId: leadStage === 'qualified' ? 'customer-1' : null, primaryContactId: leadStage === 'qualified' ? 'contact-1' : null, siteId: null, stage: leadStage, lostReason: null,
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
    const leadRow = page.getByRole('row', { name: /Warehouse alarm enquiry/ });
    await expect(leadRow).toBeVisible();
    await page.getByLabel('Select Warehouse alarm enquiry').click();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign owner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schedule reminder' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('heading', { name: 'Import open leads' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await leadRow.click();
    await expect(page.getByRole('heading', { name: 'Warehouse alarm enquiry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Qualify' })).toBeVisible();
    await page.getByRole('button', { name: 'Add lead' }).click();
    await expect(page.getByRole('heading', { name: 'New lead' })).toBeVisible();
    await expect(page.getByLabel('Service')).toBeVisible();
  });

  test('shows permission-scoped CRM metrics on the dashboard', async ({ page }) => {
    await mockCrm(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: `Welcome back, ${user.name}` })).toBeVisible();
    await expect(page.getByText('Visible leads', { exact: true })).toBeVisible();
    await expect(page.getByText('Pending follow-ups', { exact: true })).toBeVisible();
    await expect(page.getByText('Unawarded opportunities', { exact: true })).toBeVisible();
    await expect(page.getByText('Active customers', { exact: true })).toBeVisible();
    const recentLeads = page.getByRole('region', { name: 'Recently updated leads' });
    const followUps = page.getByRole('region', { name: 'Next follow-ups' });
    await expect(recentLeads.getByRole('link', { name: /Warehouse alarm enquiry/ })).toBeVisible();
    await expect(followUps.getByRole('link', { name: /Call customer/ })).toBeVisible();
  });

  test('shows purchasing masters and creates the free-design handoff', async ({ page }) => {
    await mockCrm(page, 'qualified');
    await page.goto('/masters/items');
    await expect(page.getByRole('heading', { name: 'Items', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('row', { name: /Smoke detector/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByRole('heading', { name: 'Add item' })).toBeVisible();
    await expect(page.getByLabel('Category')).toBeVisible();
    await expect(page.getByLabel('Unit')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.goto('/crm/leads');
    await page.getByRole('row', { name: /Warehouse alarm enquiry/ }).click();
    await page.getByRole('button', { name: 'Authorize free design' }).click();
    await expect(page.getByRole('heading', { name: 'Authorize free design' })).toBeVisible();
    await page.getByLabel('Design engineer').click();
    await page.getByRole('option', { name: 'Design Engineer' }).click();
    await page.getByLabel('Design head').click();
    await page.getByRole('option', { name: 'Design Head' }).click();
    await page.getByLabel('Authorization notes').fill('Prepare the preliminary alarm layout.');
    await page.getByRole('button', { name: 'Authorize design' }).click();
    await expect(page.getByText('Free design authorized.', { exact: true })).toBeVisible();
  });

  test('keeps the CRM navigation and lead view usable on mobile', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await context.newPage();
    await mockCrm(page);
    await page.goto('/crm/leads');
    await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Opportunities' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
});
