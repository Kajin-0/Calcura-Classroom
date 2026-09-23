import { expect, test } from '@playwright/test';

test('loads the classroom sign-in route and explains missing local configuration', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/signin');
  await expect(page).toHaveTitle('Calcura Classroom');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('VITE_SUPABASE_URL');
  await expect(page.getByLabel('Email address')).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

test('protected workspace redirects to sign in without configured credentials', async ({
  page,
}) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('keeps the sign-in surface within a narrow mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/signin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(390);
});
