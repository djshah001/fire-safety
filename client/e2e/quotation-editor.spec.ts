import { expect, test } from '@playwright/test';

const jobId = '11111111-1111-4111-8111-111111111111';
const terms = [
  '1. GST: 18% Goods & Services Tax will be charged extra, as applicable.',
  '2. Quotation Validity: This quotation is valid for 7 days from the date of issue.',
  '3. Civil Works: Any civil work, including excavation, pedestal construction, RCC road cutting, and backfilling, is not included unless specifically agreed.',
  '4. Cabling: Supply of cabling from main source to our panel is in your scope.',
  '5. Documentation Charges: Legal or statutory fees are in your scope.',
  '6. Installation Works: Actual installation executed will be invoiced.',
  '8. NOC Charges: AMC and consultancy charges will be charged separately.',
  '9. Site Utilities: Water and electricity are provided by the client.',
  '10. Invoicing: Invoices are prepared using actual measurements.',
].join('\n');

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`quotation clause editor fits ${viewport.width}px and preserves saved wording`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    let submitted: { exclusions: string; deliveryTerms: string; paymentTerms: string } | undefined;
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      let data: unknown = {};
      if (url.pathname.endsWith('/auth/me')) data = { user: { id: 'admin', name: 'Test administrator', email: 'admin@example.test', companyId: 'test-company', mustChangePassword: false, permissions: ['system.access.all', 'engineering.quotation.read', 'engineering.quotation.write', 'engineering.quotation.approve'] } };
      else if (url.pathname.endsWith('/notifications/summary')) data = { items: [], unreadCount: 0 };
      else if (url.pathname.endsWith('/quotations')) {
        if (route.request().method() === 'POST') { submitted = route.request().postDataJSON(); data = {}; }
        else data = {
          job: { id: jobId, title: 'Example fire protection design', leadNumber: 'LEAD-001' },
          context: { leadNumber: 'LEAD-001', customerName: 'Example customer', opportunityCommercialState: 'unawarded' },
          quotation: null, revisions: [], eligibleBoqs: [{ id: 'boq-1', revisionNumber: 1, title: 'Approved BOQ' }],
          capabilities: { canWrite: true, canApprove: true, canOverrideApprovals: true, canIssue: true, canRecordDecision: true, canViewPaymentPlan: true, canWritePaymentPlan: true },
          defaults: { validityDays: 7, exclusions: terms, deliveryTerms: 'Delivery by agreement.', paymentTerms: '50% advance, remaining by milestones.' }, documentMode: 'demo',
        };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, requestId: 'ui-test' }) });
    });
    await page.goto(`/engineering/design-jobs/${jobId}/quotations`);
    await page.getByRole('button', { name: 'New quotation revision' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('9 clauses', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    await dialog.getByLabel('Title', { exact: true }).fill('Example quotation');
    await dialog.getByRole('button', { name: /Civil Works/ }).click();
    const wording = dialog.getByLabel('Clause 3 wording');
    await expect(wording).toBeVisible();
    expect(await wording.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(192);
    await wording.fill('3. Civil Works: Excavation is excluded.');
    await dialog.getByRole('button', { name: /Civil Works/ }).click();
    await expect(wording).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`quotation-terms-${viewport.width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(submitted?.exclusions).toBe(terms.replace(terms.split('\n')[2]!, '3. Civil Works: Excavation is excluded.'));
    expect(submitted?.deliveryTerms).toBe('Delivery by agreement.');
    expect(submitted?.paymentTerms).toBe('50% advance, remaining by milestones.');
  });
}

test('administrator can review a quotation they contributed to', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/me')
      ? { user: { id: 'admin', name: 'Administrator', email: 'admin@example.test', companyId: 'test', mustChangePassword: false, permissions: ['system.access.all', 'engineering.quotation.read', 'engineering.quotation.approve'] } }
      : path.endsWith('/quotations') ? {
        job: { id: jobId, title: 'Fire design', leadNumber: 'LEAD-001' }, context: { leadNumber: 'LEAD-001', customerName: 'Customer', opportunityCommercialState: 'unawarded' },
        quotation: { id: 'quote', quotationNumber: 'QUO-001' }, eligibleBoqs: [], defaults: { exclusions: terms, deliveryTerms: 'Agreed', paymentTerms: 'Agreed', validityDays: 7 },
        capabilities: { canApprove: true, canOverrideApprovals: true, canWrite: false, canIssue: false, canRecordDecision: false, canViewPaymentPlan: true, canWritePaymentPlan: true },
        revisions: [{ id: 'revision', boqRevisionId: 'boq', revisionNumber: 1, status: 'submitted', title: 'Administrator contributed quotation', isContributor: true, rowVersion: 1, currency: 'INR', validityDays: 7, subtotal: '100', lineDiscountTotal: '0', additionalDiscount: '0', taxAmount: '0', grandTotal: '100', lines: [], exclusions: 'Excluded', deliveryTerms: 'Agreed', paymentTerms: 'Agreed', paymentPlan: null }],
      } : { items: [], unreadCount: 0 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, requestId: 'admin-ui' }) });
  });
  await page.goto(`/engineering/design-jobs/${jobId}/quotations`);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Return', exact: true })).toBeEnabled();
  await expect(page.getByText('Independent approval required', { exact: true })).toHaveCount(0);
});

test('document details saves the letterhead tagline and customer contact fields', async ({ page }) => {
  let submitted: { details: Record<string, string>; expectedVersion: number } | undefined;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PATCH' && path.endsWith('/document-details')) {
      submitted = route.request().postDataJSON();
    }
    const data = path.endsWith('/auth/me')
      ? { user: { id: 'purchase', name: 'Test purchase user', email: 'purchase@example.test', companyId: 'test', mustChangePassword: false, permissions: ['engineering.quotation.read', 'engineering.quotation.write'] } }
      : path.endsWith('/quotations') ? {
        job: { id: jobId, title: 'Fire design', leadNumber: 'LEAD-001' }, context: { leadNumber: 'LEAD-001', customerName: 'Customer', opportunityCommercialState: 'unawarded' },
        quotation: { id: 'quote', quotationNumber: 'QUO-001' }, eligibleBoqs: [], defaults: { exclusions: terms, deliveryTerms: 'Agreed', paymentTerms: 'Agreed', validityDays: 7 },
        capabilities: { canWrite: true, canApprove: false, canIssue: false, canRecordDecision: false, canViewPaymentPlan: false, canWritePaymentPlan: false },
        revisions: [{ id: 'revision', boqRevisionId: 'boq', revisionNumber: 1, status: 'draft', title: 'Draft quotation', isContributor: true, rowVersion: 1, currency: 'INR', validityDays: 7, subtotal: '100', lineDiscountTotal: '0', additionalDiscount: '0', taxAmount: '0', roundingAdjustment: '0', grandTotal: '100', lines: [], exclusions: terms, deliveryTerms: 'Agreed', paymentTerms: 'Agreed', documentDetails: {} }],
      } : { items: [], unreadCount: 0 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, requestId: 'document-ui-test' }) });
  });
  await page.goto(`/engineering/design-jobs/${jobId}/quotations`);
  await page.getByRole('button', { name: 'Document details', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Company / sender name', { exact: true }).fill('Test fire services');
  await dialog.getByLabel('Company tagline (optional)', { exact: true }).fill('Industrial fire safety');
  await dialog.getByLabel('Customer contact person', { exact: true }).fill('Site manager');
  await dialog.getByLabel('Customer contact phone', { exact: true }).fill('9000000000');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(submitted).toMatchObject({ details: { senderName: 'Test fire services', senderTagline: 'Industrial fire safety', recipientContact: 'Site manager', recipientPhone: '9000000000' }, expectedVersion: 1 });
});
