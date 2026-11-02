import { expect, test, type Page } from '@playwright/test';

const jobId = '0880f467-3164-4cbb-b6f7-59fd09654154';
const revisionId = 'c6bdea3b-8144-45eb-97d7-be705f45da79';
type DecisionPayload = { decision: string; evidenceReference: string; notes?: string; expectedVersion: number };

async function mockDesign(page: Page, onDecision: (payload: DecisionPayload) => boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/customer-decision')) {
      const accepted = onDecision(route.request().postDataJSON());
      await route.fulfill({ status: accepted ? 200 : 422, contentType: 'application/json', body: JSON.stringify(accepted
        ? { data: {}, requestId: 'decision-test' }
        : { error: { code: 'VALIDATION_ERROR', message: 'The request could not be validated.', fieldErrors: [{ path: 'evidenceReference', message: 'Enter a traceable evidence reference of at least 3 characters.' }] }, requestId: 'decision-test' }) });
      return;
    }
    const data = path.endsWith('/auth/me')
      ? { user: { id: 'sales', name: 'Sales test user', email: 'sales@example.test', companyId: 'test', mustChangePassword: false, permissions: ['engineering.design.read', 'engineering.design.customer_decision'] } }
      : path.endsWith(`/design-jobs/${jobId}`) ? {
        job: { id: jobId, title: 'Customer design review', leadNumber: 'LEAD-TEST', status: 'sent_to_customer', authorizationNotes: 'Approved for design', rowVersion: 4, designerUserId: 'designer', designHeadUserId: 'head', designDueAt: null, designerCompletedAt: null, bufferExtensionsUsed: 0 },
        surveyRevisions: [], deadlineExtensions: [],
        revisions: [{ id: revisionId, revisionNumber: 2, title: 'Revised layout', changeSummary: 'Updated floor plan', status: 'sent_to_customer', rowVersion: 7, files: [], review: null, customerDecision: null }],
      } : { items: [], unreadCount: 0 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, requestId: 'decision-test' }) });
  });
  await page.goto(`/engineering/design-jobs/${jobId}`);
}

for (const action of [{ button: 'Customer approved', decision: 'approved' }, { button: 'Changes requested', decision: 'changes_requested' }]) {
  test(`${action.decision} validates evidence before sending and preserves the exact revision`, async ({ page }) => {
    const requests: DecisionPayload[] = [];
    await mockDesign(page, (payload) => { requests.push(payload); return true; });
    await page.getByRole('button', { name: action.button, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const evidence = dialog.getByLabel('Evidence reference', { exact: true });
    await expect(evidence).toHaveAttribute('minlength', '3');
    await expect(evidence).toHaveAttribute('maxlength', '1000');
    await expect(dialog.getByLabel('Notes', { exact: true })).toHaveAttribute('maxlength', '1000');
    await evidence.fill('    ');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Enter a traceable evidence reference of at least 3 characters.');
    expect(requests).toHaveLength(0);
    await evidence.fill(' Email 2026-10-30, drawing R2 ');
    await dialog.getByLabel('Notes', { exact: true }).fill(' Customer confirmed this revision ');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests).toEqual([{ decision: action.decision, evidenceReference: 'Email 2026-10-30, drawing R2', notes: 'Customer confirmed this revision', expectedVersion: 7 }]);
  });
}

test('API validation shows the field error and keeps the customer evidence for correction', async ({ page }) => {
  let attempts = 0;
  await mockDesign(page, () => ++attempts > 1);
  await page.getByRole('button', { name: 'Customer approved', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Evidence reference', { exact: true }).fill('Customer email R2');
  await dialog.getByLabel('Notes', { exact: true }).fill('Keep these notes');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('evidenceReference: Enter a traceable evidence reference');
  await expect(dialog.getByLabel('Evidence reference', { exact: true })).toHaveValue('Customer email R2');
  await expect(dialog.getByLabel('Notes', { exact: true })).toHaveValue('Keep these notes');
  await dialog.getByLabel('Evidence reference', { exact: true }).fill('Customer signed drawing R2, 2026-10-30');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(attempts).toBe(2);
});
