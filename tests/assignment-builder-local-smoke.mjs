// Real local Data API + browser regression. Run only with a loopback Supabase
// stack and a loopback Classroom Vite server; no PostgREST routes are mocked.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const status = spawnSync(
  path.join(repoRoot, 'node_modules/.bin/supabase'),
  ['status', '-o', 'env'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  },
);
if (status.status !== 0)
  throw new Error('Local Supabase stack is not running.');
const env = Object.fromEntries(
  status.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const apiUrl = new globalThis.URL(env.API_URL ?? '');
const appUrl = new globalThis.URL(
  process.env.CLASSROOM_LOCAL_URL ?? 'http://127.0.0.1:5174',
);
for (const url of [apiUrl, appUrl]) {
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  ) {
    throw new Error('Refusing to run the builder smoke outside loopback.');
  }
}
if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY)
  throw new Error('Local Supabase keys unavailable.');

const suffix = randomBytes(8).toString('hex');
const email = `builder-smoke-${suffix}@example.test`;
const password = randomBytes(32).toString('base64url');
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const teacher = createClient(env.API_URL, env.ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const cases = [
  {
    name: 'three-mixed',
    activities: [
      'integration.u_substitution.v1',
      'integration.by_parts.v1',
      'integration.inverse_trig.v1',
    ],
    counts: [5, 5, 5],
  },
  {
    name: 'repeated-activity',
    activities: [
      'integration.u_substitution.v1',
      'integration.u_substitution.v1',
      'integration.by_parts.v1',
    ],
    counts: [5, 5, 5],
  },
  {
    name: 'four-mixed',
    activities: [
      'integration.basic_trig.v1',
      'integration.u_substitution.v1',
      'integration.by_parts.v1',
      'integration.inverse_trig.v1',
    ],
    counts: [5, 5, 7, 5],
  },
];
let userId;
let workspaceId;
let browser;

function unwrap(result, label) {
  if (result.error)
    throw new Error(
      `${label}: ${result.error.code ?? result.error.status ?? 'unknown'}`,
    );
  return result.data;
}

async function rows(assignmentId) {
  return unwrap(
    await teacher
      .from('assignment_items')
      .select(
        'id,assignment_id,position,activity_key,problem_count,created_at,updated_at',
      )
      .eq('assignment_id', assignmentId)
      .order('position'),
    'query assignment items',
  );
}

async function runCase(caseSpec, session) {
  const classItem = unwrap(
    await teacher
      .from('classes')
      .insert({
        workspace_id: workspaceId,
        name: `Builder ${caseSpec.name} ${suffix}`,
      })
      .select('id')
      .single(),
    'create class',
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const network = [];
  page.on('response', (response) => {
    if (!response.url().includes('/rest/v1/assignment_items')) return;
    const request = response.request();
    network.push({
      method: request.method(),
      endpoint: new globalThis.URL(request.url()).pathname,
      status: response.status(),
      requestBody: request.postData(),
      responseBody: response.text().catch(() => '<unavailable>'),
    });
  });
  await page.addInitScript((authSession) => {
    globalThis.localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify(authSession),
    );
  }, session);
  try {
    await page.goto(
      `${appUrl.origin}/app/classes/${classItem.id}/assignments/new`,
    );
    await expect(
      page.getByRole('heading', { name: 'Create an assignment' }),
    ).toBeVisible();
    await page.getByLabel('Title').fill(`Builder ${caseSpec.name} ${suffix}`);
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(
      page.getByRole('heading', { name: `Builder ${caseSpec.name} ${suffix}` }),
    ).toBeVisible();
    const assignmentId = new globalThis.URL(page.url()).pathname
      .split('/')
      .at(-1);
    await expect(
      page.getByRole('heading', { name: 'New practice block' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add block to assignment' }),
    ).toBeVisible();
    const snapshots = [];
    let firstButtonY;
    for (let index = 0; index < caseSpec.activities.length; index += 1) {
      await page
        .locator('#block-editor-activity')
        .selectOption(caseSpec.activities[index]);
      await page
        .locator('#block-editor-count')
        .fill(String(caseSpec.counts[index]));
      const [response] = await Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.url().includes('/rest/v1/assignment_items') &&
            candidate.request().method() === 'POST',
        ),
        page.getByRole('button', { name: 'Add block to assignment' }).click(),
      ]);
      await expect(page.locator('.practice-block-list > li')).toHaveCount(
        index + 1,
      );
      const expectedTotal = caseSpec.counts
        .slice(0, index + 1)
        .reduce((a, b) => a + b, 0);
      await expect(
        page.getByRole('status').filter({ hasText: 'total' }),
      ).toHaveText(
        `${index + 1} ${index === 0 ? 'block' : 'blocks'} · ${expectedTotal} problems total`,
      );
      const database = await rows(assignmentId);
      const rendered = await page.locator('.practice-block-list > li').count();
      const statusText = await page
        .getByRole('status')
        .filter({ hasText: 'total' })
        .textContent();
      const builderStateLength = Number(
        statusText?.trim().match(/^(\d+) blocks?/)?.[1],
      );
      const addButtonBounds = await page
        .getByRole('button', { name: 'Add block to assignment' })
        .boundingBox();
      assert.ok(addButtonBounds, 'Add control must remain visible.');
      if (index === 0) firstButtonY = addButtonBounds.y;
      assert.ok(
        Math.abs(addButtonBounds.y - firstButtonY) <= 1,
        'Adding a block must not move the Add control away from the pointer.',
      );
      snapshots.push({
        action: index + 1,
        builderStateLength,
        renderedBlockCount: rendered,
        displayedTotal: statusText?.trim(),
        addButtonBounds,
        responseStatus: response.status(),
        database,
      });
      assert.equal(database.length, index + 1);
      assert.deepEqual(
        database.map((item) => item.problem_count),
        caseSpec.counts.slice(0, index + 1),
      );
      assert.equal(
        new Set(database.map((item) => item.id)).size,
        database.length,
      );
      assert.deepEqual(
        database.map((item) => item.position),
        database.map((_, ordinal) => ordinal),
      );
    }
    await page.reload();
    await expect(page.locator('.practice-block-list > li')).toHaveCount(
      caseSpec.activities.length,
    );
    const originalTotal = caseSpec.counts.reduce((a, b) => a + b, 0);
    await expect(
      page.getByRole('status').filter({ hasText: 'total' }),
    ).toContainText(`${originalTotal} problems total`);
    assert.deepEqual(
      (await rows(assignmentId)).map((item) => item.problem_count),
      caseSpec.counts,
    );

    if (caseSpec.name === 'three-mixed') {
      const second = page.locator('.practice-block-list > li').nth(1);
      await second.getByRole('button', { name: 'Edit block 2' }).click();
      await expect(
        page.getByRole('heading', { name: 'Edit practice block 2' }),
      ).toBeVisible();
      await page.getByLabel('Problems').fill('7');
      await expect(page.getByText('Unsaved changes')).toBeVisible();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'total' }),
      ).toHaveText('3 blocks · 17 problems total');
      await page.reload();
      await expect(
        page.getByRole('status').filter({ hasText: 'total' }),
      ).toHaveText('3 blocks · 17 problems total');
      assert.deepEqual(
        (await rows(assignmentId)).map((item) => item.problem_count),
        [5, 7, 5],
      );
    }
    const resolvedNetwork = await Promise.all(
      network.map(async (entry) => ({
        ...entry,
        responseBody: await entry.responseBody,
      })),
    );
    return {
      case: caseSpec.name,
      assignmentId,
      snapshots,
      thirdInsert: resolvedNetwork.filter(
        (entry) => entry.method === 'POST',
      )[2],
    };
  } finally {
    await context.close();
  }
}

let runError;
try {
  const created = unwrap(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'create local teacher',
  );
  userId = created.user.id;
  const signedIn = unwrap(
    await teacher.auth.signInWithPassword({ email, password }),
    'teacher sign-in',
  );
  const workspaceRows = unwrap(
    await teacher.rpc('ensure_personal_workspace'),
    'teacher workspace',
  );
  workspaceId = workspaceRows?.[0]?.workspace_id;
  assert.ok(workspaceId);
  browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const caseSpec of cases)
    reports.push(await runCase(caseSpec, signedIn.session));
  globalThis.console.log(
    JSON.stringify(
      {
        localOnly: true,
        realDataApi: true,
        reports: reports.map((report) => ({
          ...report,
          snapshots: report.snapshots.map((snapshot) => ({
            ...snapshot,
            database: snapshot.database.map(
              ({ id, position, activity_key, problem_count }) => ({
                id,
                position,
                activity_key,
                problem_count,
              }),
            ),
          })),
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  runError = error;
} finally {
  await browser?.close();
  await teacher.auth.signOut();
  if (workspaceId) {
    const { error } = await admin
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);
    if (error) runError ??= error;
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) runError ??= error;
  }
}
if (runError) throw runError;
