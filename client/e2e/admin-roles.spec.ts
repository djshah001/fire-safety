import { expect, test } from '@playwright/test';

const admin = {
  id: '00000000-0000-4000-8000-000000000101',
  companyId: '00000000-0000-4000-8000-000000000102',
  name: 'Local Administrator',
  email: 'admin@example.test',
  mustChangePassword: false,
  permissions: ['identity.users.read', 'identity.users.manage', 'identity.roles.manage'],
};
const salesManagerRole = {
  id: '00000000-0000-4000-8000-000000000103',
  code: 'sales_manager',
  name: 'Sales Manager',
  description: 'Assign and manage CRM work.',
  isSystem: true,
  isActive: true,
  rowVersion: 1,
  permissionCodes: ['crm.lead.read', 'crm.lead.write', 'crm.lead.assign'],
};

test('admin can inspect role permissions and open employee role assignment', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ json: { data: { user: admin }, requestId: 'admin-session' } });
    } else if (path.endsWith('/admin/permissions')) {
      await route.fulfill({ json: { data: { items: [
        { code: 'crm.lead.read', description: 'View explicitly assigned leads.' },
        { code: 'crm.lead.write', description: 'Create and edit explicitly assigned leads.' },
        { code: 'crm.lead.assign', description: 'Assign eligible employees to managed leads.' },
      ] }, requestId: 'permissions' } });
    } else if (path.endsWith('/admin/roles')) {
      await route.fulfill({ json: { data: { items: [salesManagerRole] }, requestId: 'roles' } });
    } else if (path.endsWith('/admin/users')) {
      await route.fulfill({ json: { data: { items: [{
        id: admin.id,
        employeeCode: null,
        name: admin.name,
        email: admin.email,
        status: 'active',
        mustChangePassword: false,
        rowVersion: 1,
        lastLoginAt: '2026-10-10T10:00:00.000Z',
        roles: [salesManagerRole],
      }], total: 1, page: 1, pageSize: 25 }, requestId: 'users' } });
    } else {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not mocked' } } });
    }
  });

  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Roles & permissions' })).toBeVisible();
  await expect(page.getByText('Sales Manager', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByRole('heading', { name: 'Configure Sales Manager' })).toBeVisible();
  await expect(page.getByText('crm.lead.assign', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'Employees' }).click();
  await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
  await page.getByRole('button', { name: 'Roles' }).click();
  await expect(page.getByRole('heading', { name: 'Roles for Local Administrator' })).toBeVisible();
  await expect(page.getByLabel('Sales Manager')).toBeChecked();
});
