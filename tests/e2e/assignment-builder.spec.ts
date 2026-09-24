import { expect, test } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:54321/rest/v1';
const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers':
    'Content-Range, Content-Profile, Preference, Location',
};

test('teacher creates a draft, adds a practice block, and publishes it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const now = '2026-09-24T12:00:00.000Z';
  const workspace = {
    id: 'workspace-playwright',
    workspace_type: 'personal',
    name: 'Personal workspace',
    status: 'active',
  };
  const classItem = {
    id: 'class-playwright',
    workspace_id: workspace.id,
    name: 'Calculus I',
    status: 'active',
    created_at: now,
    updated_at: now,
  };
  let assignment = {
    id: 'assignment-playwright',
    class_id: classItem.id,
    title: 'Integration practice',
    due_at: null as string | null,
    status: 'draft',
    published_at: null as string | null,
    created_at: now,
    updated_at: now,
  };
  let items: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    const session = {
      access_token: 'playwright-fake-access-token',
      token_type: 'bearer',
      expires_in: 3_600,
      expires_at: 4_102_444_800,
      refresh_token: 'playwright-fake-refresh-token',
      user: {
        id: 'teacher-playwright',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'teacher@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: '2026-09-24T00:00:00.000Z',
      },
    };
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  });

  await page.route(`${baseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (path.endsWith('/rpc/ensure_personal_workspace')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [
          {
            workspace_id: workspace.id,
            workspace_type: workspace.workspace_type,
            name: workspace.name,
            status: workspace.status,
          },
        ],
      });
      return;
    }

    if (path.endsWith('/rpc/get_class_join_code')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: 'ABCDEFGHJK',
      });
      return;
    }

    if (path.endsWith('/rpc/publish_assignment')) {
      assignment = {
        ...assignment,
        status: 'published',
        published_at: now,
        updated_at: now,
      };
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [assignment],
      });
      return;
    }

    if (path.endsWith('/rpc/get_assignment_student_progress')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [
          {
            student_user_id: '11111111-1111-4111-8111-111111111111',
            student_email: 'student@example.test',
            completed_problem_count: 2,
            total_problem_count: 5,
            progress_status: 'in_progress',
            last_activity_at: now,
          },
        ],
      });
      return;
    }

    if (path.endsWith('/class_enrollments')) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'content-range': '0-1/2' },
        body: '',
      });
      return;
    }

    if (path.endsWith('/classes')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: url.searchParams.has('id') ? classItem : [classItem],
      });
      return;
    }

    if (path.endsWith('/assignments')) {
      if (method === 'POST') {
        const body = request.postDataJSON() as {
          title: string;
          due_at: string | null;
        };
        assignment = {
          ...assignment,
          title: body.title,
          due_at: body.due_at,
        };
        await route.fulfill({
          status: 201,
          headers: corsHeaders,
          json: assignment,
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: url.searchParams.has('id') ? assignment : [],
      });
      return;
    }

    if (path.endsWith('/assignment_items')) {
      if (method === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        const item = {
          id: 'item-playwright',
          assignment_id: assignment.id,
          created_at: now,
          updated_at: now,
          ...body,
        };
        items = [item];
        await route.fulfill({
          status: 201,
          headers: corsHeaders,
          json: item,
        });
        return;
      }
      await route.fulfill({ status: 200, headers: corsHeaders, json: items });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { message: `Unmocked local API request: ${method} ${path}` },
    });
  });

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();
  await page.getByRole('link', { name: /Calculus I/ }).click();
  await expect(page.getByRole('heading', { name: 'Calculus I' })).toBeVisible();
  await page.getByRole('link', { name: 'New assignment' }).click();

  await page.getByLabel('Title').fill('  Integration practice  ');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Integration practice' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('button', { name: 'Publish assignment' }).click();
  const confirmation = page.getByRole('group', {
    name: 'Publish this assignment?',
  });
  await page
    .getByRole('group', { name: 'Publish this assignment?' })
    .getByRole('button', { name: 'Publish assignment' })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByText('Content locked')).toBeVisible();
  await expect(page.getByText('Basic trigonometric integration')).toBeVisible();
  await expect(page.getByText('5 problems')).toBeVisible();
  const progress = page.getByRole('region', { name: 'Student progress' });
  await expect(progress.getByText('student@example.test')).toBeVisible();
  await expect(progress.getByText('2 / 5')).toBeVisible();
  await expect(progress.getByText('In progress')).toBeVisible();
});
