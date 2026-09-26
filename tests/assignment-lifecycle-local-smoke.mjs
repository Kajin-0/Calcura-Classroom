import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workdir = process.env.SUPABASE_WORKDIR ?? repoRoot;
const status = spawnSync(
  path.join(repoRoot, 'node_modules/.bin/supabase'),
  ['status', '-o', 'env'],
  {
    encoding: 'utf8',
    cwd: workdir,
    env: { ...process.env, PWD: workdir },
    maxBuffer: 2 * 1024 * 1024,
  },
);
if (status.status !== 0) {
  throw new Error(
    `Local Supabase must be running: ${(status.stderr || status.stdout).slice(0, 250)}`,
  );
}
const env = Object.fromEntries(
  status.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const apiUrl = new globalThis.URL(env.API_URL ?? '');
if (
  apiUrl.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '::1'].includes(apiUrl.hostname)
) {
  throw new Error('Refusing to run lifecycle smoke outside loopback Supabase.');
}
if (!env.SERVICE_ROLE_KEY || !env.ANON_KEY) {
  throw new Error('Local Supabase status omitted test credentials.');
}

// The service credential is used only in this local, non-browser harness to
// provision and clean up its own temporary test accounts/workspace.
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = randomBytes(32).toString('base64url');
const suffix = randomBytes(8).toString('hex');
const emails = {
  teacher: `phase7-teacher-${suffix}@example.test`,
  student: `phase7-student-${suffix}@example.test`,
};
const userIds = [];
const clients = {};
let workspaceId;

function unwrap(result, label) {
  if (result.error) {
    throw new Error(`${label} failed (${result.error.code ?? 'unknown'}).`);
  }
  return result.data;
}

async function provisionAndSignIn(key) {
  const { data, error } = await admin.auth.admin.createUser({
    email: emails[key],
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `Local test-user provisioning failed (${error?.status ?? 'unknown'}).`,
    );
  }
  userIds.push(data.user.id);

  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({
    email: emails[key],
    password,
  });
  if (signIn.error) {
    throw new Error(`Local test-user sign-in failed (${signIn.error.status}).`);
  }
  clients[key] = client;
}

async function expectResultHistoryBlocked(assignmentId) {
  const blocked = await clients.teacher.rpc('delete_assignment', {
    p_assignment_id: assignmentId,
  });
  assert.equal(blocked.error?.code, 'P0001');
  assert.equal(blocked.error?.message, 'assignment_has_results');
}

async function main() {
  await provisionAndSignIn('teacher');
  await provisionAndSignIn('student');

  const workspaceRows = unwrap(
    await clients.teacher.rpc('ensure_personal_workspace'),
    'teacher workspace bootstrap',
  );
  workspaceId = workspaceRows?.[0]?.workspace_id;
  assert.ok(workspaceId);

  const classroom = unwrap(
    await clients.teacher
      .from('classes')
      .insert({ workspace_id: workspaceId, name: 'Phase 7 lifecycle smoke' })
      .select('id')
      .single(),
    'class creation',
  );
  const joinCode = unwrap(
    await clients.teacher.rpc('get_class_join_code', {
      p_class_id: classroom.id,
    }),
    'join-code retrieval',
  );
  const joined = unwrap(
    await clients.student.rpc('join_class_by_code', { p_code: joinCode }),
    'student class enrollment',
  );
  assert.equal(joined?.[0]?.class_id, classroom.id);

  const source = unwrap(
    await clients.teacher
      .from('assignments')
      .insert({
        class_id: classroom.id,
        title: `Lifecycle source ${suffix}`,
        due_at: '2030-01-01T12:00:00Z',
      })
      .select('id, class_id, title, due_at, status, published_at')
      .single(),
    'source draft creation',
  );
  const sourceItems = [];
  for (const [position, activityKey, problemCount] of [
    [0, 'integration.u_substitution.v1', 5],
    [1, 'integration.by_parts.v1', 7],
    [2, 'integration.inverse_trig.v1', 5],
  ]) {
    sourceItems.push(
      unwrap(
        await clients.teacher
          .from('assignment_items')
          .insert({
            assignment_id: source.id,
            position,
            activity_contract_version: 1,
            activity_key: activityKey,
            problem_count: problemCount,
          })
          .select(
            'id, position, activity_contract_version, activity_key, problem_count',
          )
          .single(),
        `source item ${position + 1} creation`,
      ),
    );
  }

  const metadataUpdate = unwrap(
    await clients.teacher
      .from('assignments')
      .update({ title: `Lifecycle revised ${suffix}`, due_at: null })
      .eq('id', source.id)
      .select('id, title, due_at')
      .single(),
    'draft metadata edit',
  );
  assert.equal(metadataUpdate.title, `Lifecycle revised ${suffix}`);
  assert.equal(metadataUpdate.due_at, null);

  const draftCopyId = unwrap(
    await clients.teacher.rpc('duplicate_assignment', {
      p_assignment_id: source.id,
    }),
    'draft duplication',
  );
  assert.notEqual(draftCopyId, source.id);
  const draftCopy = unwrap(
    await clients.teacher
      .from('assignments')
      .select('id, class_id, title, due_at, status, published_at')
      .eq('id', draftCopyId)
      .single(),
    'draft duplicate read',
  );
  assert.equal(draftCopy.status, 'draft');
  assert.equal(draftCopy.published_at, null);
  assert.equal(draftCopy.due_at, null);
  assert.equal(draftCopy.title, 'Lifecycle revised ' + suffix + ' (Copy)');
  const copiedItems = unwrap(
    await clients.teacher
      .from('assignment_items')
      .select(
        'id, position, activity_contract_version, activity_key, problem_count',
      )
      .eq('assignment_id', draftCopyId)
      .order('position'),
    'copied practice blocks read',
  );
  assert.equal(copiedItems.length, sourceItems.length);
  assert.deepEqual(
    copiedItems.map(
      ({
        position,
        activity_contract_version,
        activity_key,
        problem_count,
      }) => ({
        position,
        activity_contract_version,
        activity_key,
        problem_count,
      }),
    ),
    sourceItems.map(
      ({
        position,
        activity_contract_version,
        activity_key,
        problem_count,
      }) => ({
        position,
        activity_contract_version,
        activity_key,
        problem_count,
      }),
    ),
  );
  assert.equal(
    copiedItems.some((copy) => sourceItems.some((item) => item.id === copy.id)),
    false,
  );
  assert.equal(
    unwrap(
      await clients.teacher.rpc('get_assignment_delete_status', {
        p_assignment_id: draftCopyId,
      }),
      'draft duplicate result-status check',
    ),
    false,
  );
  unwrap(
    await clients.teacher.rpc('delete_assignment', {
      p_assignment_id: draftCopyId,
    }),
    'draft duplicate deletion',
  );

  const publishedNoResultsCopyId = unwrap(
    await clients.teacher.rpc('duplicate_assignment', {
      p_assignment_id: source.id,
    }),
    'second draft duplication',
  );
  unwrap(
    await clients.teacher.rpc('publish_assignment', {
      p_assignment_id: publishedNoResultsCopyId,
    }),
    'duplicate publication',
  );
  assert.equal(
    unwrap(
      await clients.teacher.rpc('get_assignment_delete_status', {
        p_assignment_id: publishedNoResultsCopyId,
      }),
      'published result-status check',
    ),
    false,
  );
  unwrap(
    await clients.teacher.rpc('delete_assignment', {
      p_assignment_id: publishedNoResultsCopyId,
    }),
    'published no-result deletion',
  );

  const publishedSource = unwrap(
    await clients.teacher.rpc('publish_assignment', {
      p_assignment_id: source.id,
    }),
    'source publication',
  );
  assert.equal(publishedSource[0]?.status, 'published');
  const resultRecord = unwrap(
    await clients.student.rpc('record_assignment_problem_result', {
      p_assignment_item_id: sourceItems[0].id,
      p_problem_ordinal: 1,
      p_client_result_id: `phase7-${suffix}-student-result`,
      p_client_timestamp_ms: Date.now(),
      p_outcome: 'correct',
      p_attempts: 2,
      p_surrenders: 0,
      p_time_seconds: 42,
      p_grade_points: 90,
      p_skill_id: 'uSub.basic',
      p_family: 'uSub',
      p_variant: 'basic',
      p_technique: 'uSub',
      p_source_difficulty: 'Intermediate',
      p_tier: 2,
      p_schema_version: 1,
    }),
    'student terminal result submission',
  );
  assert.equal(resultRecord, 'recorded');

  const analyticsBefore = unwrap(
    await clients.teacher.rpc('get_assignment_analytics', {
      p_assignment_id: source.id,
    }),
    'source analytics before protected duplicate',
  );
  assert.equal(analyticsBefore.summary.problems_completed, 1);
  assert.equal(
    unwrap(
      await clients.teacher.rpc('get_assignment_delete_status', {
        p_assignment_id: source.id,
      }),
      'source result-status check',
    ),
    true,
  );
  await expectResultHistoryBlocked(source.id);

  const immutableAttempt = await clients.teacher
    .from('assignment_items')
    .update({ problem_count: 6 })
    .eq('id', sourceItems[0].id)
    .select('id');
  assert.equal(immutableAttempt.error, null);
  assert.deepEqual(immutableAttempt.data, []);
  const unchangedItem = unwrap(
    await clients.teacher
      .from('assignment_items')
      .select('problem_count')
      .eq('id', sourceItems[0].id)
      .single(),
    'published item immutability verification',
  );
  assert.equal(unchangedItem.problem_count, 5);

  const protectedCopyId = unwrap(
    await clients.teacher.rpc('duplicate_assignment', {
      p_assignment_id: source.id,
    }),
    'result-bearing assignment duplication',
  );
  const analyticsAfter = unwrap(
    await clients.teacher.rpc('get_assignment_analytics', {
      p_assignment_id: source.id,
    }),
    'source analytics after protected duplicate',
  );
  assert.deepEqual(analyticsAfter, analyticsBefore);
  assert.equal(
    unwrap(
      await clients.teacher.rpc('get_assignment_delete_status', {
        p_assignment_id: protectedCopyId,
      }),
      'protected duplicate result-status check',
    ),
    false,
  );
  unwrap(
    await clients.teacher.rpc('delete_assignment', {
      p_assignment_id: protectedCopyId,
    }),
    'protected duplicate cleanup',
  );

  const studentMutation = await clients.student.rpc('delete_assignment', {
    p_assignment_id: source.id,
  });
  assert.equal(studentMutation.error?.code, '42501');

  process.stdout.write(
    `${JSON.stringify({
      smoke: 'PASS',
      sourceStatus: publishedSource[0]?.status,
      copiedBlocks: copiedItems.length,
      copiedItemIdsAreFresh: copiedItems.every(
        (copy) => !sourceItems.some((item) => item.id === copy.id),
      ),
      protectedSourceCompletedResults:
        analyticsAfter.summary.problems_completed,
      sourceAnalyticsUnchanged:
        JSON.stringify(analyticsBefore) === JSON.stringify(analyticsAfter),
    })}\n`,
  );
}

let smokeError;
try {
  await main();
} catch (error) {
  smokeError = error;
}
const cleanupFailures = [];
if (workspaceId) {
  const { error } = await admin
    .from('workspaces')
    .delete()
    .eq('id', workspaceId);
  if (error) cleanupFailures.push('workspace');
}
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) cleanupFailures.push('test user');
}
for (const client of Object.values(clients)) {
  await client.auth.signOut();
}
if (smokeError) throw smokeError;
if (cleanupFailures.length > 0) {
  throw new Error(
    `Local lifecycle smoke cleanup failed for ${[...new Set(cleanupFailures)].join(', ')}.`,
  );
}
