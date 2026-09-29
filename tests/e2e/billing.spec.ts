import { expect, test, type Page } from '@playwright/test';
import { reviewSurface } from './ui-review';

const workspaceId = 'a7e04ca0-0864-48f2-9990-86df20d74bc2';
const userId = 'b8f15db1-1975-49f3-a291-97e31e8a6cd3';
const now = '2026-09-27T12:00:00Z';
const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS, HEAD',
};

async function mockTeacher(page: Page) {
  await page.addInitScript(
    ({ userId: seededUserId }) => {
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'playwright-phase9-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 4102444800,
          refresh_token: 'playwright-phase9-refresh',
          user: {
            id: seededUserId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'teacher@example.test',
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {},
            identities: [],
            created_at: '2026-09-27T12:00:00Z',
          },
        }),
      );
    },
    { userId },
  );

  await page.route('http://127.0.0.1:54321/rest/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/rpc/ensure_personal_workspace')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [
          {
            workspace_id: workspaceId,
            workspace_type: 'personal',
            name: 'Calculus workspace',
            status: 'active',
          },
        ],
      });
      return;
    }
    if (path.endsWith('/rpc/get_workspace_entitlement')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [
          {
            workspace_id: workspaceId,
            plan: 'teacher_free',
            status: 'active',
            source: 'default',
            effective_at: now,
            expires_at: null,
            capabilities: [
              'basic_classroom',
              'basic_assignments',
              'basic_analytics',
            ],
          },
        ],
      });
      return;
    }
    if (path.endsWith('/rpc/get_workspace_dashboard')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          schema_version: 1,
          summary: {
            active_classes: 0,
            students: 0,
            active_assignments: 0,
            student_assignment_opportunities: 0,
            students_completed: 0,
            completion_rate: null,
            problems_completed: 0,
            problems_correct: 0,
            accuracy: null,
          },
          classes: [],
          assignments: [],
          activities: [],
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { message: path },
    });
  });

  await page.route('http://127.0.0.1:54321/functions/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/billing-summary')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          billing_interval: null,
          subscription_status: null,
          current_period_end: null,
          cancel_at_period_end: false,
          can_manage_billing: true,
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { error: 'unavailable' },
    });
  });
}

test('teacher sees restrained workspace billing choices without changing Free access', async ({
  page,
}) => {
  await mockTeacher(page);
  await page.goto('/app');
  await page.getByRole('link', { name: 'Billing' }).click();

  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Teacher Free' }),
  ).toBeVisible();
  await expect(page.getByText('$19')).toBeVisible();
  await expect(page.getByText('$149')).toBeVisible();
  await expect(
    page.getByText(
      /current classroom, assignments, and basic analytics available/i,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upgrade monthly' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upgrade annually' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Upgrade monthly' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Upgrade annually' }),
  ).toBeFocused();
  await reviewSurface(page, 'billing-free');

  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(1280);
});

test('Pro billing stays neutral and its portal action remains keyboard reachable', async ({
  page,
}) => {
  await mockTeacher(page);
  await page.route('**/rest/v1/rpc/get_workspace_entitlement', (route) =>
    route.fulfill({
      status: 200,
      headers: corsHeaders,
      json: [
        {
          workspace_id: workspaceId,
          plan: 'pro',
          status: 'active',
          source: 'stripe',
          effective_at: now,
          expires_at: null,
          capabilities: [
            'basic_classroom',
            'basic_assignments',
            'basic_analytics',
            'advanced_analytics',
            'result_export',
            'larger_class_limits',
            'advanced_assignment_editing',
          ],
        },
      ],
    }),
  );
  await page.route('**/functions/v1/billing-summary', (route) =>
    route.fulfill({
      status: 200,
      headers: corsHeaders,
      json: {
        billing_interval: 'monthly',
        subscription_status: 'active',
        current_period_end: '2030-10-01T12:00:00Z',
        cancel_at_period_end: true,
        can_manage_billing: true,
      },
    }),
  );
  await page.goto('/app/billing');
  await expect(
    page.getByRole('heading', { name: 'Pro', exact: true }),
  ).toBeVisible();
  const portal = page.getByRole('button', { name: 'Manage billing' });
  await expect(portal).toBeVisible();
  await portal.focus();
  await expect(portal).toBeFocused();
  expect(
    await portal.evaluate((button) => getComputedStyle(button).outlineStyle),
  ).not.toBe('none');
  await reviewSurface(page, 'billing-pro');
});

test('an active checkout conflict is announced with recovery guidance and keeps Free access', async ({
  page,
}) => {
  await mockTeacher(page);
  await page.route('**/functions/v1/billing-checkout', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({
      workspace_id: workspaceId,
      billing_interval: 'annual',
    });
    await route.fulfill({
      status: 409,
      headers: corsHeaders,
      json: {
        error: 'checkout_in_progress',
        retry: true,
        message: 'PRIVATE provider detail',
      },
    });
  });
  await page.goto('/app/billing');
  const annual = page.getByRole('button', { name: 'Upgrade annually' });
  await expect(annual).toBeEnabled();
  await annual.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    'Another checkout is already active for this workspace. Open the plan you previously selected to resume it, or wait for that checkout to expire before changing billing interval.',
  );
  await expect(page.getByText('PRIVATE provider detail')).toHaveCount(0);
  await expect(
    page.getByText('We could not complete that request. Try again.'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Teacher Free' }),
  ).toBeVisible();
  await expect(annual).toBeEnabled();
  const monthly = page.getByRole('button', { name: 'Upgrade monthly' });
  await expect(monthly).toBeEnabled();
  await monthly.focus();
  await page.keyboard.press('Tab');
  await expect(annual).toBeFocused();
  await expect(page).toHaveURL(/\/app\/billing$/);
  await reviewSurface(page, 'billing-checkout-conflict');
  await expect(page.getByRole('alert')).toBeVisible();
});

test('an unknown billing HTTP failure shows only the safe fallback', async ({
  page,
}) => {
  await mockTeacher(page);
  await page.route('**/functions/v1/billing-checkout', async (route) => {
    await route.fulfill(
      route.request().method() === 'OPTIONS'
        ? { status: 204, headers: corsHeaders }
        : {
            status: 502,
            headers: corsHeaders,
            json: {
              error: 'something_else',
              message: 'PRIVATE Stripe exception',
              stripe_customer_id: 'cus_private',
            },
          },
    );
  });
  await page.goto('/app/billing');
  await page.getByRole('button', { name: 'Upgrade monthly' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'We could not complete that request. Try again.',
  );
  await expect(
    page.getByText(/PRIVATE Stripe exception|cus_private/),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Upgrade monthly' }),
  ).toBeEnabled();
});
