import { expect, test } from '@playwright/test';

test.describe('P1 responsive shell', () => {
  test('renders the completed login screen on desktop in light mode', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      colorScheme: 'light',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('login-desktop-light.png'), fullPage: true });
    await context.close();
  });

  test('renders the completed login screen on mobile in dark mode', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByText('Employee sign in')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('login-mobile-dark.png'), fullPage: true });
    await context.close();
  });

  test('signs in and exposes employee controls only to the administrator', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('p1-admin@example.test');
    await page.getByLabel('Password').fill('AdminUpdatedPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, P1 Test Administrator' })).toBeVisible();
    const browserStorageKeys = await page.evaluate(() => [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
    ]);
    expect(browserStorageKeys.filter((key) => /token|session|auth/i.test(key))).toEqual([]);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'fs_session')).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
    });
    await page.getByRole('link', { name: 'Employees' }).click();
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
    await expect(page.getByText('P1 Sales Fixture')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add employee' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('heading', { name: 'Reset temporary password' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
  });

  test('opens the authenticated navigation without horizontal overflow on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('Email').fill('p1-admin@example.test');
    await page.getByLabel('Password').fill('AdminUpdatedPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, P1 Test Administrator' })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
});
