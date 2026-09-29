import { expect, test } from '@playwright/test';
import { reviewSurface } from './ui-review';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const firstClassId = '22222222-2222-4222-8222-222222222222';
const secondClassId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';
const now = '2026-09-27T12:00:00Z';
const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS, HEAD',
};

const response = {
  schema_version: 1,
  summary: {
    active_classes: 2,
    students: 3,
    active_assignments: 1,
    student_assignment_opportunities: 2,
    students_completed: 1,
    completion_rate: 0.5,
    problems_completed: 3,
    problems_correct: 2,
    accuracy: 2 / 3,
  },
  classes: [
    {
      class_id: firstClassId,
      name: 'Calculus I',
      students_enrolled: 2,
      active_assignments: 1,
      student_assignment_opportunities: 2,
      students_completed: 1,
      completion_rate: 0.5,
      problems_completed: 3,
      problems_correct: 2,
      accuracy: 2 / 3,
      last_activity_at: now,
    },
    {
      class_id: secondClassId,
      name: 'Calculus II',
      students_enrolled: 1,
      active_assignments: 0,
      student_assignment_opportunities: 0,
      students_completed: 0,
      completion_rate: null,
      problems_completed: 0,
      problems_correct: 0,
      accuracy: null,
      last_activity_at: null,
    },
  ],
  assignments: [
    {
      assignment_id: assignmentId,
      class_id: firstClassId,
      title: 'Integration practice',
      due_at: null,
      published_at: now,
      total_problem_count: 2,
      students_enrolled: 2,
      students_started: 2,
      students_completed: 1,
      completion_rate: 0.5,
      problems_completed: 3,
      problems_correct: 2,
      accuracy: 2 / 3,
      average_attempts: 2,
      surrenders: 1,
      last_activity_at: now,
    },
  ],
  activities: [
    {
      activity_key: 'integration.basic_trig.v1',
      practice_blocks: 1,
      problems_completed: 3,
      problems_correct: 2,
      accuracy: 2 / 3,
      average_attempts: 2,
      surrenders: 1,
      surrender_rate: 1 / 3,
    },
  ],
};

async function mockLocalSession(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'playwright-fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: 'playwright-fake-refresh-token',
        user: {
          id: '55555555-5555-4555-8555-555555555555',
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
  });
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
            name: 'North Campus',
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
        json: response,
      });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { message: path },
    });
  });
}

test('teacher dashboard shows real aggregate sections, navigation, and class filtering', async ({
  page,
}) => {
  await mockLocalSession(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Plan · Teacher Free')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Completion by class' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Outcome quality' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Technique performance' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Integration practice/ }),
  ).toHaveAttribute(
    'href',
    `/app/classes/${firstClassId}/assignments/${assignmentId}`,
  );
  await page
    .getByRole('combobox', { name: 'Class' })
    .selectOption(secondClassId);
  await expect(
    page.getByText('No published assignments in this class.'),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Class' }).selectOption('all');
  await expect(
    page.getByRole('link', { name: /Integration practice/ }),
  ).toBeVisible();
  const classRow = page.locator('.dashboard-class-row').first();
  await classRow.focus();
  await expect(classRow).toBeFocused();
  await expect(classRow).toHaveCSS('outline-style', 'solid');
  await expect
    .poll(() =>
      classRow.evaluate(
        (element) => getComputedStyle(element, '::before').opacity,
      ),
    )
    .toBe('1');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/app/classes/${firstClassId}`);
});

test('dashboard remains legible and contained at desktop, tablet, and phone widths', async ({
  page,
}) => {
  await mockLocalSession(page);
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'Completion by class' }),
  ).toBeVisible();
  await reviewSurface(page, 'dashboard');
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Assignment performance' }),
    ).toBeVisible();
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      minText: parseFloat(
        getComputedStyle(document.querySelector('.dashboard-chart-caption')!)
          .fontSize,
      ),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    );
    expect(geometry.minText).toBeGreaterThanOrEqual(12);
    if (process.env.DASHBOARD_SCREENSHOTS === '1') {
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `/tmp/calcura-dashboard-${width}.png`,
        fullPage: true,
      });
    }
  }
});

test('dashboard has stable loading, recoverable error, and calm empty states', async ({
  page,
}) => {
  await mockLocalSession(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route('**/rpc/get_workspace_dashboard', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await pending;
    await route.fulfill(
      fail
        ? {
            status: 503,
            headers: corsHeaders,
            json: { message: 'Temporarily unavailable' },
          }
        : {
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
          },
    );
  });
  await page.goto('/app');
  await expect(
    page.getByRole('status', { name: 'Loading dashboard' }),
  ).toBeVisible();
  await reviewSurface(page, 'dashboard-loading');
  release();
  await expect(page.getByRole('alert')).toContainText('Dashboard unavailable');
  await reviewSurface(page, 'dashboard-error');
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No classes yet' }),
  ).toBeVisible();
  await reviewSurface(page, 'dashboard-empty');
  await page.getByRole('button', { name: 'Create your first class' }).click();
  await expect(page.getByRole('textbox', { name: 'Class name' })).toBeVisible();
});

test('branded shell preserves keyboard navigation and readable contrast', async ({
  page,
}) => {
  await mockLocalSession(page);
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'Outcome quality' }),
  ).toBeVisible();
  const brand = page.getByRole('link', {
    name: 'Calcura Classroom',
    exact: true,
  });
  const navigation = page.getByRole('navigation', {
    name: 'Teacher navigation',
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(brand).toBeVisible();
    await brand.focus();
    await page.keyboard.press('Tab');
    const active = navigation.getByRole('link', {
      name: 'Dashboard',
      exact: true,
    });
    await expect(active).toBeFocused();
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(
      navigation.getByRole('link', { name: 'Classes', exact: true }),
    ).toBeVisible();
    await expect(
      navigation.getByRole('link', { name: 'Billing', exact: true }),
    ).toBeVisible();

    const contrast = await page.evaluate(() => {
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((channel) => {
            const value = channel / 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      };
      const ratio = (foreground: string, background: string) => {
        const first = luminance(foreground);
        const second = luminance(background);
        return (
          (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
        );
      };
      const shell = getComputedStyle(
        document.querySelector('.workspace-header')!,
      );
      const active = getComputedStyle(
        document.querySelector('.workspace-nav a.active')!,
      );
      const textRatios = [
        ...document.querySelectorAll(
          '.workspace-header .workspace-brand-name, .workspace-brand-name > span, .workspace-plan-label, .workspace-header .button, .workspace-nav a:not(.active)',
        ),
      ].map((element) =>
        ratio(getComputedStyle(element).color, shell.backgroundColor),
      );
      const outcome = getComputedStyle(
        document.querySelector('.dashboard-outcomes')!,
      );
      const outcomeTextRatios = [
        ...document.querySelectorAll(
          '.dashboard-outcomes h2, .dashboard-outcomes .dashboard-overline, .dashboard-outcome-value, .dashboard-outcome-subtitle, .dashboard-outcome-legend dt, .dashboard-outcome-legend dd, .dashboard-outcome-footnote',
        ),
      ].map((element) =>
        ratio(getComputedStyle(element).color, outcome.backgroundColor),
      );
      const track = getComputedStyle(
        document.querySelector('.dashboard-outcome-track')!,
      );
      const fill = getComputedStyle(
        document.querySelector('.dashboard-outcome-track > span')!,
      );
      return {
        text: [
          ...textRatios,
          ...outcomeTextRatios,
          ratio(active.color, active.backgroundColor),
        ],
        chart: ratio(fill.backgroundColor, track.backgroundColor),
        focus: ratio(active.outlineColor, active.backgroundColor),
        outline: active.outlineStyle,
      };
    });
    for (const ratio of contrast.text)
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrast.focus).toBeGreaterThanOrEqual(3);
    expect(contrast.chart).toBeGreaterThanOrEqual(3);
    expect(contrast.outline).not.toBe('none');
  }
});

test('meter reveals preserve exact values and filtering does not replay the overview', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockLocalSession(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let dashboardRequests = 0;
  await page.route('**/rpc/get_workspace_dashboard', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    dashboardRequests += 1;
    await pending;
    await route.fulfill({ status: 200, headers: corsHeaders, json: response });
  });
  await page.goto('/app');
  await expect(
    page.getByRole('status', { name: 'Loading dashboard' }),
  ).toBeVisible();
  // Hold the actual CSS animation, so this checks its geometry without timing races.
  const paused = await page.addStyleTag({
    content: '.dashboard-page * { animation-play-state: paused !important; }',
  });
  release();
  await expect(
    page.locator('.dashboard-completion .dashboard-chart-line strong'),
  ).toHaveText('50%');
  const reveal = await page
    .locator('.dashboard-completion .dashboard-rate-fill')
    .evaluate((fill) => {
      const animation = fill.getAnimations()[0];
      if (!animation?.effect) throw new Error('Expected a meter reveal');
      const timing = animation.effect.getTiming();
      animation.currentTime = timing.delay;
      const start = fill.getBoundingClientRect().width;
      animation.currentTime = timing.delay + Number(timing.duration) / 2;
      const middle = fill.getBoundingClientRect().width;
      animation.finish();
      const end = fill.getBoundingClientRect().width;
      const trackWidth = fill.parentElement!.getBoundingClientRect().width;
      document.getAnimations().forEach((item) => item.finish());
      return { start, middle, end, ratio: end / trackWidth };
    });
  expect(reveal.start).toBe(0);
  expect(reveal.middle).toBeGreaterThan(0);
  expect(reveal.middle).toBeLessThan(reveal.end);
  expect(reveal.ratio).toBeCloseTo(0.5, 2);
  await paused.evaluate((element) => element.remove());
  // Development Strict Mode may make two initial requests. Filtering must add none.
  const initialRequests = dashboardRequests;
  expect(initialRequests).toBeGreaterThan(0);
  await page
    .getByRole('combobox', { name: 'Class' })
    .selectOption(secondClassId);
  await expect(
    page.getByText('No published assignments in this class.'),
  ).toBeVisible();
  const replaying = await page
    .locator('.dashboard-kpis, .dashboard-primary-grid')
    .evaluateAll(
      (elements) =>
        elements
          .flatMap((element) => element.getAnimations({ subtree: true }))
          .filter((animation) => animation.playState === 'running').length,
    );
  expect(replaying).toBe(0);
  expect(dashboardRequests).toBe(initialRequests);
  await expect(
    page.locator('.dashboard-completion .dashboard-chart-line strong'),
  ).toHaveText('50%');
});

test('reduced motion disables dashboard entrance and chart transitions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockLocalSession(page);
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'Completion by class' }),
  ).toBeVisible();
  const motion = await page.evaluate(() => ({
    entrance: getComputedStyle(document.querySelector('.dashboard-loaded')!)
      .animationName,
    track: getComputedStyle(document.querySelector('.dashboard-rate-fill')!)
      .transitionDuration,
    animations: document
      .querySelector('.dashboard-page')!
      .getAnimations({ subtree: true }).length,
    ratio:
      document
        .querySelector('.dashboard-completion .dashboard-rate-fill')!
        .getBoundingClientRect().width /
      document
        .querySelector('.dashboard-completion .dashboard-rate-track')!
        .getBoundingClientRect().width,
  }));
  expect(motion.entrance).toBe('none');
  expect(motion.track).toBe('0s');
  expect(motion.animations).toBe(0);
  expect(motion.ratio).toBeCloseTo(0.5, 2);
});
