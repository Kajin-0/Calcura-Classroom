import { expect, test } from '@playwright/test';
import { reviewSurface } from './ui-review';

test('sign-in and signup expose production legal links without a consent checkbox', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/signin', '/signup']) {
    await page.goto(route);
    for (const [name, href] of [
      ['Privacy', 'https://calcura.study/privacy/'],
      ['Terms', 'https://calcura.study/terms/'],
      ['Contact', 'https://calcura.study/contact/'],
    ]) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
      await link.focus();
      await expect(link).toBeFocused();
    }
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
});

test('loads the classroom sign-in route with the isolated test configuration', async ({
  page,
}) => {
  // Cold Chromium startup and first-page navigation can exceed the default
  // per-test budget on this VPS; the overall command remains externally capped.
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/signin');
  await expect(page).toHaveTitle('Calcura Classroom');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeEnabled();
  expect(pageErrors).toEqual([]);
  await reviewSurface(page, 'signin');
});

test('sign-in retains visible keyboard focus and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/signin');
  await page.getByLabel('Email address').focus();
  await page.keyboard.press('Tab');
  const submit = page.getByRole('button', { name: 'Send sign-in code' });
  await expect(submit).toBeFocused();
  expect(
    await submit.evaluate((button) => getComputedStyle(button).outlineStyle),
  ).not.toBe('none');
  expect(
    await page
      .locator('.auth-card')
      .evaluate((card) => getComputedStyle(card).animationName),
  ).toBe('none');
  expect(
    await submit.evaluate(
      (button) => getComputedStyle(button).transitionDuration,
    ),
  ).toBe('0s');
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
