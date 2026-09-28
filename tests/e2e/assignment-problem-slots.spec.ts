import { expect, test } from '@playwright/test';
import { reviewSurface } from './ui-review';

const apiOrigin = 'http://127.0.0.1:54321/rest/v1';
const classId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const itemId = '44444444-4444-4444-8444-444444444444';
const now = '2026-09-28T12:00:00.000Z';
const headers = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers':
    'Content-Range, Content-Profile, Preference, Location',
};

test('Pro teacher can preview and safely customize deterministic problem slots', async ({
  page,
}) => {
  const workspace = {
    id: workspaceId,
    workspace_type: 'personal',
    name: 'Personal workspace',
    status: 'active',
  };
  const classItem = {
    id: classId,
    workspace_id: workspaceId,
    name: 'Calculus I',
    status: 'active',
    created_at: now,
    updated_at: now,
  };
  const assignment = {
    id: assignmentId,
    class_id: classId,
    title: 'Problem-slot practice',
    due_at: null,
    status: 'draft',
    published_at: null,
    created_at: now,
    updated_at: now,
  };
  const item = {
    id: itemId,
    assignment_id: assignmentId,
    position: 0,
    activity_contract_version: 1,
    activity_key: 'integration.u_substitution.v1',
    problem_count: 3,
    generation_spec_version: 1,
    difficulty_profile: 'auto',
    variant_policy: 'individualized',
    generation_seed: '55555555-5555-4555-8555-555555555555',
    created_at: now,
    updated_at: now,
  };
  let slots: Array<{
    id: string;
    assignment_item_id: string;
    position: number;
    source_ordinal: number;
    regeneration_seed: string | null;
    locked: boolean;
    slot_spec_version: 1;
    created_at: string;
    updated_at: string;
  }> = [];
  let nextSeed = 0;
  const freshSeed = () =>
    `90000000-0000-4000-8000-${String(++nextSeed).padStart(12, '0')}`;
  const materialize = () => {
    if (slots.length === 0) {
      slots = Array.from({ length: item.problem_count }, (_, index) => ({
        id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`,
        assignment_item_id: itemId,
        position: index,
        source_ordinal: index + 1,
        regeneration_seed: null,
        locked: false,
        slot_spec_version: 1 as const,
        created_at: now,
        updated_at: now,
      }));
    }
    return slots;
  };

  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.matches('.problem-slot-row')) {
        const count = Number(
          document.documentElement.dataset.slotAnimations || 0,
        );
        document.documentElement.dataset.slotAnimations = String(count + 1);
      }
      return animate.call(this, keyframes, options);
    };
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'phase10-e2e-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: 'phase10-e2e-refresh-token',
        user: {
          id: 'teacher-phase10-e2e',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'teacher@example.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: '2026-09-28T12:00:00.000Z',
        },
      }),
    );
  });

  await page.route(
    /^http:\/\/127\.0\.0\.1:4173\/\?classroomProblemPreview=1$/,
    async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><body><p>Preview loading</p><script>
          const trustedOrigin = 'http://127.0.0.1:4173';
          window.addEventListener('message', (event) => {
            const data = event.data;
            if (event.source !== window.parent || event.origin !== trustedOrigin || data?.version !== 1) return;
            if (data.type === 'calcura-classroom-problem-preview-hello') {
              window.parent.postMessage({version: 1, type: 'calcura-classroom-problem-preview-ready'}, trustedOrigin);
              return;
            }
            if (data.type !== 'calcura-classroom-problem-preview-request' ||
                !Number.isInteger(data.problemOrdinal) || !Array.isArray(data.item?.problem_slots)) return;
            document.body.textContent = 'Rendered problem ' + data.problemOrdinal +
              ' of ' + data.item.problem_slots.length;
            window.parent.postMessage({version: 1, type: 'calcura-classroom-problem-preview-rendered', requestId: data.requestId}, trustedOrigin);
          });
        </script></body></html>`,
      }),
  );

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }

    if (path.endsWith('/rpc/ensure_personal_workspace')) {
      await route.fulfill({
        status: 200,
        headers,
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
      await route.fulfill({
        status: 200,
        headers,
        json: [
          {
            workspace_id: workspaceId,
            plan: 'pro',
            status: 'active',
            source: 'manual',
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
      });
      return;
    }
    if (path.endsWith('/classes')) {
      await route.fulfill({ status: 200, headers, json: classItem });
      return;
    }
    if (path.endsWith('/assignments')) {
      await route.fulfill({ status: 200, headers, json: assignment });
      return;
    }
    if (path.endsWith('/assignment_items')) {
      await route.fulfill({ status: 200, headers, json: [item] });
      return;
    }
    if (path.endsWith('/assignment_problem_slots')) {
      await route.fulfill({ status: 200, headers, json: slots });
      return;
    }
    if (path.endsWith('/rpc/prepare_assignment_problem_slots')) {
      await route.fulfill({ status: 200, headers, json: materialize() });
      return;
    }
    if (path.endsWith('/rpc/regenerate_assignment_problem_slot')) {
      const { p_slot_id } = request.postDataJSON() as { p_slot_id: string };
      const target = slots.find((slot) => slot.id === p_slot_id);
      if (!target || target.locked) {
        await route.fulfill({
          status: 400,
          headers,
          json: { message: 'slot unavailable' },
        });
        return;
      }
      target.regeneration_seed = freshSeed();
      target.updated_at = now;
      await route.fulfill({ status: 200, headers, json: [target] });
      return;
    }
    if (path.endsWith('/rpc/set_assignment_problem_slot_locked')) {
      const { p_slot_id, p_locked } = request.postDataJSON() as {
        p_slot_id: string;
        p_locked: boolean;
      };
      const target = slots.find((slot) => slot.id === p_slot_id);
      if (!target) {
        await route.fulfill({
          status: 404,
          headers,
          json: { message: 'slot missing' },
        });
        return;
      }
      target.locked = p_locked;
      target.updated_at = now;
      await route.fulfill({ status: 200, headers, json: [target] });
      return;
    }
    if (path.endsWith('/rpc/reorder_assignment_problem_slots')) {
      const { p_ordered_slot_ids } = request.postDataJSON() as {
        p_ordered_slot_ids: string[];
      };
      slots = p_ordered_slot_ids.map((id, position) => {
        const target = slots.find((slot) => slot.id === id);
        if (!target) throw new Error(`Unknown slot ${id}`);
        return { ...target, position };
      });
      await route.fulfill({ status: 200, headers, json: slots });
      return;
    }
    if (path.endsWith('/rpc/regenerate_unlocked_assignment_problem_slots')) {
      const updated = slots
        .filter((slot) => !slot.locked)
        .map((slot) => {
          slot.regeneration_seed = freshSeed();
          slot.updated_at = now;
          return slot;
        });
      await route.fulfill({ status: 200, headers, json: updated });
      return;
    }
    await route.fulfill({
      status: 404,
      headers,
      json: { message: `Unmocked request: ${method} ${path}` },
    });
  });

  await page.goto(`/app/classes/${classId}/assignments/${assignmentId}`);
  await expect(
    page.getByRole('heading', { name: 'Problem-slot practice' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Customize problems' }).click();
  await expect(
    page.getByRole('heading', { name: 'Individual problems' }),
  ).toBeVisible();
  const preview = page.frameLocator(
    'iframe[title^="Calcura preview for problem"]',
  );
  await expect(
    page.getByText(
      'Representative preview — students receive individualized variants.',
    ),
  ).toBeVisible();
  await expect(preview.locator('body')).toContainText(
    'Rendered problem 1 of 3',
  );

  await page.getByRole('button', { name: 'Problem 2, unlocked' }).click();
  await expect(preview.locator('body')).toContainText(
    'Rendered problem 2 of 3',
  );

  const slotRows = page.locator('.problem-slot-row');
  await page.getByRole('button', { name: 'Problem 1, unlocked' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    slotRows.nth(0).getByRole('button', { name: 'Regenerate' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    slotRows.nth(0).getByRole('button', { name: 'Lock', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    slotRows.nth(0).getByRole('button', { name: 'Move down' }),
  ).toBeFocused();
  await reviewSurface(page, 'problem-editor');
  await slotRows.nth(0).getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.locator('.problem-slot-feedback')).toContainText(
    'Problem 1 regenerated',
  );
  expect(slots[0]?.regeneration_seed).not.toBeNull();
  await slotRows
    .nth(0)
    .getByRole('button', { name: 'Lock', exact: true })
    .click();
  await expect(
    slotRows.nth(0).getByRole('button', { name: 'Problem 1, locked' }),
  ).toBeVisible();
  await expect(
    slotRows.nth(0).getByRole('button', { name: 'Regenerate' }),
  ).toBeDisabled();

  await slotRows.nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('.problem-slot-feedback')).toContainText(
    'Problem order updated',
  );
  expect(slots.map((slot) => slot.id)).toEqual([
    '77777777-7777-4777-8777-000000000002',
    '77777777-7777-4777-8777-000000000001',
    '77777777-7777-4777-8777-000000000003',
  ]);
  expect(
    await page.evaluate(() =>
      Number(document.documentElement.dataset.slotAnimations),
    ),
  ).toBe(2);
  const seedsBeforeReducedMove = slots
    .map(({ id, regeneration_seed }) => [id, regeneration_seed])
    .sort();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await slotRows.nth(0).getByRole('button', { name: 'Move down' }).click();
  await expect(slotRows.nth(0)).toHaveAttribute(
    'data-slot-id',
    '77777777-7777-4777-8777-000000000001',
  );
  expect(
    await page.evaluate(() =>
      Number(document.documentElement.dataset.slotAnimations),
    ),
  ).toBe(2);
  expect(
    slots.map(({ id, regeneration_seed }) => [id, regeneration_seed]).sort(),
  ).toEqual(seedsBeforeReducedMove);
  expect(
    await slotRows
      .nth(0)
      .evaluate((row) => getComputedStyle(row).transitionDuration),
  ).toBe('0s');

  const lockedSeed = slots.find((slot) => slot.locked)?.regeneration_seed;
  await page.getByRole('button', { name: 'Regenerate unlocked' }).click();
  const confirmation = page.getByRole('group', {
    name: 'Confirm bulk regeneration',
  });
  await expect(confirmation).toBeVisible();
  await reviewSurface(page, 'problem-confirmation');
  await confirmation
    .getByRole('button', { name: 'Confirm regeneration' })
    .click();
  await expect(page.locator('.problem-slot-feedback')).toContainText(
    '2 unlocked problems regenerated',
  );
  expect(slots.find((slot) => slot.locked)?.regeneration_seed).toBe(lockedSeed);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
