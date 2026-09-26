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

    if (path.endsWith('/rpc/get_assignment_analytics')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          schema_version: 1,
          summary: {
            students_enrolled: 1,
            students_started: 1,
            students_completed: 0,
            completion_rate: 0,
            total_assigned_problem_slots: 5,
            problems_completed: 2,
            problems_correct: 1,
            accuracy: 0.5,
            average_attempts: 1.5,
            average_time_seconds: 30,
            surrenders: 1,
            surrender_rate: 0.5,
          },
          activities: [
            {
              assignment_item_id: '22222222-2222-4222-8222-222222222222',
              position: 0,
              activity_contract_version: 1,
              activity_key: 'integration.basic_trig.v1',
              problem_count: 5,
              assigned_problem_slots: 5,
              problems_completed: 2,
              problems_correct: 1,
              accuracy: 0.5,
              average_attempts: 1.5,
              average_time_seconds: 30,
              surrenders: 1,
              surrender_rate: 0.5,
              problem_positions: [
                {
                  problem_ordinal: 1,
                  problems_completed: 1,
                  problems_correct: 1,
                  accuracy: 1,
                  average_attempts: 1,
                  average_time_seconds: 20,
                  surrenders: 0,
                },
                {
                  problem_ordinal: 2,
                  problems_completed: 1,
                  problems_correct: 0,
                  accuracy: 0,
                  average_attempts: 2,
                  average_time_seconds: 40,
                  surrenders: 1,
                },
                {
                  problem_ordinal: 3,
                  problems_completed: 0,
                  problems_correct: 0,
                  accuracy: null,
                  average_attempts: null,
                  average_time_seconds: null,
                  surrenders: 0,
                },
                {
                  problem_ordinal: 4,
                  problems_completed: 0,
                  problems_correct: 0,
                  accuracy: null,
                  average_attempts: null,
                  average_time_seconds: null,
                  surrenders: 0,
                },
                {
                  problem_ordinal: 5,
                  problems_completed: 0,
                  problems_correct: 0,
                  accuracy: null,
                  average_attempts: null,
                  average_time_seconds: null,
                  surrenders: 0,
                },
              ],
            },
          ],
          students: [
            {
              student_user_id: '11111111-1111-4111-8111-111111111111',
              student_email: 'student@example.test',
              completed_problem_count: 2,
              total_problem_count: 5,
              progress_status: 'in_progress',
              problems_correct: 1,
              accuracy: 0.5,
              average_attempts: 1.5,
              average_time_seconds: 30,
              surrenders: 1,
              surrender_rate: 0.5,
              last_activity_at: now,
            },
          ],
        },
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
  await expect(
    page
      .getByRole('region', { name: 'Practice block analytics' })
      .getByText('Basic trigonometric integration'),
  ).toBeVisible();
  await expect(page.getByText('5 problems')).toBeVisible();
  const analytics = page.getByRole('region', { name: 'Assignment analytics' });
  const studentRow = analytics
    .getByRole('region', { name: 'Enrolled student analytics' })
    .getByRole('row')
    .filter({ hasText: 'student@example.test' });
  await expect(studentRow).toBeVisible();
  await expect(studentRow).toContainText('2 / 5');
  await expect(studentRow).toContainText('In progress');
  const activityRow = analytics
    .getByRole('region', { name: 'Practice block analytics' })
    .getByRole('row')
    .filter({ hasText: 'Basic trigonometric integration' });
  await expect(
    activityRow.getByText('Basic trigonometric integration'),
  ).toBeVisible();
  await expect(activityRow.getByText('50% (1/2)')).toBeVisible();
});
