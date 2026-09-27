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
  let assignments: (typeof assignment)[] = [];
  let nextItemId = 1;
  let nextAssignmentId = 1;
  let items: Array<{
    id: string;
    assignment_id: string;
    position: number;
    activity_contract_version: number;
    activity_key: string;
    problem_count: number;
    created_at: string;
    updated_at: string;
  }> = [];

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

    if (path.endsWith('/rpc/get_workspace_entitlement')) {
      const body = request.postDataJSON() as { p_workspace_id: string };
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [
          {
            workspace_id: body.p_workspace_id,
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

    if (path.endsWith('/rpc/get_class_join_code')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: 'ABCDEFGHJK',
      });
      return;
    }

    if (path.endsWith('/rpc/publish_assignment')) {
      const body = request.postDataJSON() as { p_assignment_id: string };
      const target = assignments.find((row) => row.id === body.p_assignment_id);
      if (!target)
        throw new Error(`Unknown assignment ${body.p_assignment_id}`);
      Object.assign(target, {
        status: 'published',
        published_at: now,
        updated_at: now,
      });
      assignment = target;
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [target],
      });
      return;
    }

    if (path.endsWith('/rpc/get_assignment_delete_status')) {
      const body = request.postDataJSON() as { p_assignment_id: string };
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: body.p_assignment_id === 'assignment-playwright',
      });
      return;
    }

    if (path.endsWith('/rpc/duplicate_assignment')) {
      const body = request.postDataJSON() as { p_assignment_id: string };
      const source = assignments.find((row) => row.id === body.p_assignment_id);
      if (!source)
        throw new Error(`Unknown assignment ${body.p_assignment_id}`);
      const copyId = `11111111-1111-4111-8111-${String(nextAssignmentId++).padStart(12, '0')}`;
      const copy = {
        ...source,
        id: copyId,
        title: `${source.title} (Copy)`,
        due_at: null,
        status: 'draft',
        published_at: null,
        updated_at: now,
      };
      assignments.push(copy);
      const copiedItems = items
        .filter((item) => item.assignment_id === source.id)
        .map((item) => ({
          ...item,
          id: `00000000-0000-4000-8000-${String(nextItemId++).padStart(12, '0')}`,
          assignment_id: copyId,
          created_at: now,
          updated_at: now,
        }));
      items = [...items, ...copiedItems];
      await route.fulfill({ status: 200, headers: corsHeaders, json: copyId });
      return;
    }

    if (path.endsWith('/rpc/delete_assignment')) {
      const body = request.postDataJSON() as { p_assignment_id: string };
      if (body.p_assignment_id === 'assignment-playwright') {
        await route.fulfill({
          status: 400,
          headers: corsHeaders,
          json: { code: 'P0001', message: 'assignment_has_results' },
        });
        return;
      }
      assignments = assignments.filter(
        (row) => row.id !== body.p_assignment_id,
      );
      items = items.filter(
        (item) => item.assignment_id !== body.p_assignment_id,
      );
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (path.endsWith('/rpc/get_assignment_analytics')) {
      const body = request.postDataJSON() as { p_assignment_id: string };
      const assignmentItems = items.filter(
        (item) => item.assignment_id === body.p_assignment_id,
      );
      const totalAssignedProblemSlots = items.reduce(
        (total, item) =>
          total +
          (item.assignment_id === body.p_assignment_id
            ? item.problem_count
            : 0),
        0,
      );
      const activities = assignmentItems.map((item, itemIndex) => {
        const problemPositions = Array.from(
          { length: item.problem_count },
          (_, index) => {
            if (itemIndex === 0 && index === 0) {
              return {
                problem_ordinal: index + 1,
                problems_completed: 1,
                problems_correct: 1,
                accuracy: 1,
                average_attempts: 1,
                average_time_seconds: 20,
                surrenders: 0,
              };
            }
            if (itemIndex === 0 && index === 1) {
              return {
                problem_ordinal: index + 1,
                problems_completed: 1,
                problems_correct: 0,
                accuracy: 0,
                average_attempts: 2,
                average_time_seconds: 40,
                surrenders: 1,
              };
            }
            return {
              problem_ordinal: index + 1,
              problems_completed: 0,
              problems_correct: 0,
              accuracy: null,
              average_attempts: null,
              average_time_seconds: null,
              surrenders: 0,
            };
          },
        );
        const hasResults = itemIndex === 0;
        return {
          assignment_item_id: item.id,
          position: item.position,
          activity_contract_version: item.activity_contract_version,
          activity_key: item.activity_key,
          problem_count: item.problem_count,
          assigned_problem_slots: item.problem_count,
          problems_completed: hasResults ? 2 : 0,
          problems_correct: hasResults ? 1 : 0,
          accuracy: hasResults ? 0.5 : null,
          average_attempts: hasResults ? 1.5 : null,
          average_time_seconds: hasResults ? 30 : null,
          surrenders: hasResults ? 1 : 0,
          surrender_rate: hasResults ? 0.5 : null,
          problem_positions: problemPositions,
        };
      });
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
            total_assigned_problem_slots: totalAssignedProblemSlots,
            problems_completed: 2,
            problems_correct: 1,
            accuracy: 0.5,
            average_attempts: 1.5,
            average_time_seconds: 30,
            surrenders: 1,
            surrender_rate: 0.5,
          },
          activities,
          students: [
            {
              student_user_id: '11111111-1111-4111-8111-111111111111',
              student_email: 'student@example.test',
              completed_problem_count: 2,
              total_problem_count: totalAssignedProblemSlots,
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
          id: 'assignment-playwright',
          title: body.title,
          due_at: body.due_at,
        };
        assignments.push(assignment);
        await route.fulfill({
          status: 201,
          headers: corsHeaders,
          json: assignment,
        });
        return;
      }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const target = assignments.find((row) => row.id === id);
        if (!target) throw new Error(`Unknown assignment ${id}`);
        Object.assign(target, request.postDataJSON(), { updated_at: now });
        assignment = target;
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: target,
        });
        return;
      }
      const requestedId = url.searchParams.get('id')?.replace('eq.', '');
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: requestedId
          ? (assignments.find((row) => row.id === requestedId) ?? [])
          : assignments.filter(
              (row) =>
                row.class_id ===
                url.searchParams.get('class_id')?.replace('eq.', ''),
            ),
      });
      return;
    }

    if (path.endsWith('/rpc/reorder_assignment_items')) {
      const body = request.postDataJSON() as {
        p_assignment_id: string;
        p_item_ids: string[];
      };
      const currentItems = items.filter(
        (item) => item.assignment_id === body.p_assignment_id,
      );
      const reordered = body.p_item_ids.map((id, position) => {
        const item = currentItems.find((candidate) => candidate.id === id);
        if (!item) throw new Error(`Unknown assignment item ${id}`);
        return { ...item, position };
      });
      items = [
        ...items.filter((item) => item.assignment_id !== body.p_assignment_id),
        ...reordered,
      ];
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (path.endsWith('/assignment_items')) {
      if (method === 'POST') {
        const body = request.postDataJSON() as Omit<
          (typeof items)[number],
          'id' | 'created_at' | 'updated_at'
        >;
        const item = {
          id: `00000000-0000-4000-8000-${String(nextItemId++).padStart(12, '0')}`,
          assignment_id: body.assignment_id,
          created_at: now,
          updated_at: now,
          ...body,
        };
        items = [...items, item];
        await route.fulfill({
          status: 201,
          headers: corsHeaders,
          json: item,
        });
        return;
      }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const patch = request.postDataJSON() as Partial<(typeof items)[number]>;
        const index = items.findIndex((candidate) => candidate.id === id);
        if (index < 0) throw new Error(`Unknown assignment item ${id}`);
        items[index] = { ...items[index]!, ...patch, updated_at: now };
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: items[index],
        });
        return;
      }
      if (method === 'GET') {
        const assignmentId = url.searchParams
          .get('assignment_id')
          ?.replace('eq.', '');
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: items
            .filter(
              (item) => !assignmentId || item.assignment_id === assignmentId,
            )
            .sort((left, right) => left.position - right.position),
        });
        return;
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const removed = items.find((item) => item.id === id);
        items = items.filter((item) => item.id !== id);
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: removed ? { id: removed.id } : [],
        });
        return;
      }
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { message: `Unmocked local API request: ${method} ${path}` },
    });
  });

  await page.goto('/app');
  await expect(page.getByText('Plan · Teacher Free')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();
  await page.getByRole('link', { name: /Calculus I/ }).click();
  await expect(page.getByRole('heading', { name: 'Calculus I' })).toBeVisible();
  await page.getByRole('link', { name: 'New assignment' }).click();

  await page.getByLabel('Title').fill('  Integration practice  ');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Integration practice' }),
  ).toBeVisible();

  const addBlock = page.getByRole('button', {
    name: 'Add block to assignment',
  });
  await expect(
    page.getByRole('heading', { name: 'New practice block' }),
  ).toBeVisible();
  await expect(
    page.getByText('New block · not yet part of the assignment.'),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    '0 blocks · 0 problems total',
  );
  await addBlock.click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText(
    '1 block · 5 problems total',
  );
  const firstAddButtonBounds = await addBlock.boundingBox();
  expect(firstAddButtonBounds).not.toBeNull();
  await addBlock.click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveText(
    '2 blocks · 10 problems total',
  );
  const secondAddButtonBounds = await addBlock.boundingBox();
  expect(secondAddButtonBounds).not.toBeNull();
  expect(
    Math.abs(secondAddButtonBounds!.y - firstAddButtonBounds!.y),
  ).toBeLessThanOrEqual(1);
  await page
    .locator('#block-editor-activity')
    .selectOption('integration.by_parts.v1');
  await addBlock.click();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('status')).toHaveText(
    '3 blocks · 15 problems total',
  );
  expect(items).toHaveLength(3);
  expect(new Set(items.map((item) => item.id)).size).toBe(3);
  expect(
    items.map(({ position, activity_key, problem_count }) => ({
      position,
      activity_key,
      problem_count,
    })),
  ).toEqual([
    {
      position: 0,
      activity_key: 'integration.basic_trig.v1',
      problem_count: 5,
    },
    {
      position: 1,
      activity_key: 'integration.basic_trig.v1',
      problem_count: 5,
    },
    {
      position: 2,
      activity_key: 'integration.by_parts.v1',
      problem_count: 5,
    },
  ]);

  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('status')).toHaveText(
    '3 blocks · 15 problems total',
  );
  const secondBlock = page.getByRole('listitem').nth(1);
  await secondBlock.getByRole('button', { name: 'Edit block 2' }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit practice block 2' }),
  ).toBeVisible();
  await page.getByLabel('Problems').fill('7');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await secondBlock.getByText('5 problems').waitFor();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText(
    '3 blocks · 17 problems total',
  );
  await expect(
    page.getByRole('heading', { name: 'New practice block' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('status')).toHaveText(
    '3 blocks · 17 problems total',
  );
  const persistedBlocks = page.getByRole('listitem');
  await expect(
    persistedBlocks.nth(0).getByText('Basic trigonometric integration'),
  ).toBeVisible();
  await expect(persistedBlocks.nth(0).getByText('5 problems')).toBeVisible();
  await expect(
    persistedBlocks.nth(1).getByText('Basic trigonometric integration'),
  ).toBeVisible();
  await expect(persistedBlocks.nth(1).getByText('7 problems')).toBeVisible();
  await expect(
    persistedBlocks.nth(2).getByText('Integration by parts'),
  ).toBeVisible();
  await expect(persistedBlocks.nth(2).getByText('5 problems')).toBeVisible();

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
      .getByText('Basic trigonometric integration')
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('7 problems', { exact: true })).toBeVisible();
  const analytics = page.getByRole('region', { name: 'Assignment analytics' });
  const studentRow = analytics
    .getByRole('region', { name: 'Enrolled student analytics' })
    .getByRole('row')
    .filter({ hasText: 'student@example.test' });
  await expect(studentRow).toBeVisible();
  await expect(studentRow).toContainText('2 / 17');
  await expect(studentRow).toContainText('In progress');
  const activityRow = analytics
    .getByRole('region', { name: 'Practice block analytics' })
    .getByRole('row')
    .filter({ hasText: 'Basic trigonometric integration' })
    .first();
  await expect(
    activityRow.getByText('Basic trigonometric integration'),
  ).toBeVisible();
  await expect(activityRow.getByText('50% (1/2)')).toBeVisible();

  await page.getByRole('button', { name: 'Duplicate assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Integration practice (Copy)' }),
  ).toBeVisible();
  expect(assignments).toHaveLength(2);
  const sourceItems = items.filter(
    (item) => item.assignment_id === 'assignment-playwright',
  );
  const copyItems = items.filter(
    (item) => item.assignment_id !== 'assignment-playwright',
  );
  expect(sourceItems).toHaveLength(3);
  expect(copyItems).toHaveLength(3);
  expect(copyItems.map((item) => item.id)).not.toEqual(
    sourceItems.map((item) => item.id),
  );
  expect(copyItems.map((item) => item.problem_count)).toEqual([5, 7, 5]);
  await page.getByRole('button', { name: 'Delete assignment' }).click();
  const deleteConfirmation = page.getByRole('group', {
    name: 'Delete assignment?',
  });
  await expect(deleteConfirmation).toBeVisible();
  await deleteConfirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteConfirmation).not.toBeVisible();
  expect(assignments).toHaveLength(2);
  await page.getByRole('button', { name: 'Delete assignment' }).click();
  await page
    .getByRole('group', { name: 'Delete assignment?' })
    .getByRole('button', { name: 'Delete assignment' })
    .click();
  await expect(page.getByRole('heading', { name: 'Calculus I' })).toBeVisible();
  expect(assignments.map((row) => row.id)).toEqual(['assignment-playwright']);

  await page.getByRole('link', { name: 'Edit Integration practice' }).click();
  await expect(
    page.getByRole('heading', { name: 'Integration practice' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete assignment' }).click();
  await expect(
    page.getByRole('status').filter({
      hasText:
        'This assignment has student results and cannot be deleted. Duplicate it to make changes.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Delete assignment?' }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Duplicate assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Integration practice (Copy)' }),
  ).toBeVisible();
  expect(assignments).toHaveLength(2);
});
