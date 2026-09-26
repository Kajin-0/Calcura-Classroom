import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const supabaseWorkdir = process.env.SUPABASE_WORKDIR ?? process.cwd();
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cliEnv = { ...process.env, PWD: supabaseWorkdir };
delete cliEnv.SUPABASE_WORKDIR;
const status = spawnSync(
  path.join(repoRoot, 'node_modules/.bin/supabase'),
  ['status', '-o', 'env'],
  {
    encoding: 'utf8',
    cwd: supabaseWorkdir,
    env: cliEnv,
    maxBuffer: 2 * 1024 * 1024,
  },
);
if (status.status !== 0)
  throw new Error(
    `The local Supabase stack must be running (${status.error?.message ?? status.status ?? status.signal}): ${(status.stderr || status.stdout).slice(0, 300)}`,
  );

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
  throw new Error('Refusing to run analytics smoke outside loopback Supabase.');
}
if (!env.SERVICE_ROLE_KEY || !env.ANON_KEY)
  throw new Error('Local Supabase status omitted test credentials.');

// This local-only admin client provisions/cleans test fixtures; all teacher
// and student product operations below use ordinary authenticated clients.
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = randomBytes(32).toString('base64url');
const suffix = randomBytes(8).toString('hex');
const emails = {
  teacher: `phase6-teacher-${suffix}@example.test`,
  studentA: `phase6-student-a-${suffix}@example.test`,
  studentB: `phase6-student-b-${suffix}@example.test`,
  studentC: `phase6-student-c-${suffix}@example.test`,
};
const userIds = {};
const clients = {};
const itemIds = {};
let workspaceId;

function unwrap(result, label) {
  if (result.error)
    throw new Error(`${label} failed (${result.error.code ?? 'unknown'}).`);
  return result.data;
}

async function provision(key) {
  const { data, error } = await admin.auth.admin.createUser({
    email: emails[key],
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(
      `Local test-user creation failed (${error?.status ?? 'unknown'}).`,
    );
  userIds[key] = data.user.id;
}

async function signIn(key) {
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: emails[key],
    password,
  });
  if (error)
    throw new Error(`Local test-user sign-in failed (${error.status}).`);
  clients[key] = client;
}

const mean = (values) =>
  values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
const close = (actual, expected, message) => {
  assert.equal(typeof actual, 'number', message);
  assert.ok(Math.abs(actual - expected) < 1e-12, message);
};

async function main() {
  for (const key of Object.keys(emails)) await provision(key);
  for (const key of Object.keys(emails)) await signIn(key);

  const workspaceRows = unwrap(
    await clients.teacher.rpc('ensure_personal_workspace'),
    'teacher workspace bootstrap',
  );
  workspaceId = workspaceRows?.[0]?.workspace_id;
  assert.ok(workspaceId);
  const classroom = unwrap(
    await clients.teacher
      .from('classes')
      .insert({ workspace_id: workspaceId, name: 'Phase 6 analytics smoke' })
      .select('id')
      .single(),
    'teacher class creation',
  );
  const assignment = unwrap(
    await clients.teacher
      .from('assignments')
      .insert({ class_id: classroom.id, title: 'Ten-slot analytics smoke' })
      .select('id')
      .single(),
    'teacher assignment creation',
  );
  const basicItem = unwrap(
    await clients.teacher
      .from('assignment_items')
      .insert({
        assignment_id: assignment.id,
        position: 0,
        activity_contract_version: 1,
        activity_key: 'integration.basic_trig.v1',
        problem_count: 10,
      })
      .select('id')
      .single(),
    'teacher ten-problem block creation',
  );
  const substitutionItem = unwrap(
    await clients.teacher
      .from('assignment_items')
      .insert({
        assignment_id: assignment.id,
        position: 1,
        activity_contract_version: 1,
        activity_key: 'integration.u_substitution.v1',
        problem_count: 2,
      })
      .select('id')
      .single(),
    'teacher second practice block creation',
  );
  itemIds.basic = basicItem.id;
  itemIds.substitution = substitutionItem.id;
  const published = unwrap(
    await clients.teacher.rpc('publish_assignment', {
      p_assignment_id: assignment.id,
    }),
    'teacher assignment publication',
  );
  assert.equal(published?.[0]?.status, 'published');

  const joinCode = unwrap(
    await clients.teacher.rpc('get_class_join_code', {
      p_class_id: classroom.id,
    }),
    'teacher join-code retrieval',
  );
  for (const key of ['studentA', 'studentB', 'studentC']) {
    const joined = unwrap(
      await clients[key].rpc('join_class_by_code', { p_code: joinCode }),
      `${key} class join`,
    );
    assert.equal(joined?.[0]?.class_id, classroom.id);
    assert.equal(joined?.[0]?.enrollment_status, 'active');
  }

  const submitted = [];
  let sequence = 0;
  async function record(key, item, ordinal, outcome, attempts, timeSeconds) {
    const result = {
      student: key,
      item,
      ordinal,
      outcome,
      attempts,
      timeSeconds,
    };
    const answer = unwrap(
      await clients[key].rpc('record_assignment_problem_result', {
        p_assignment_item_id: itemIds[item],
        p_problem_ordinal: ordinal,
        p_client_result_id: `phase6-${suffix}-${++sequence}`,
        p_client_timestamp_ms: Date.now(),
        p_outcome: outcome,
        p_attempts: attempts,
        p_surrenders: outcome === 'surrendered' ? 1 : 0,
        p_time_seconds: timeSeconds,
        p_grade_points: outcome === 'correct' ? 90 : 20,
        p_skill_id: item === 'basic' ? 'basicTrig.standard' : 'uSub.basic',
        p_family: item === 'basic' ? 'basicTrig' : 'uSub',
        p_variant: item === 'basic' ? 'standard' : 'basic',
        p_technique: item === 'basic' ? 'fundamentals' : 'uSub',
        p_source_difficulty: item === 'basic' ? 'Beginner' : 'Intermediate',
        p_tier: item === 'basic' ? 1 : 2,
        p_schema_version: 1,
      }),
      `result ${key}/${item}/${ordinal}`,
    );
    assert.equal(answer, 'recorded');
    submitted.push(result);
  }

  await record('studentA', 'basic', 1, 'correct', 1, 30);
  await record('studentA', 'basic', 2, 'correct', 3, 60);
  await record('studentA', 'basic', 3, 'surrendered', 4, 90);
  for (let ordinal = 1; ordinal <= 10; ordinal += 1) {
    await record(
      'studentB',
      'basic',
      ordinal,
      ordinal === 10 ? 'surrendered' : 'correct',
      2,
      40,
    );
  }
  await record('studentB', 'substitution', 1, 'correct', 1, 40);
  await record('studentB', 'substitution', 2, 'correct', 3, 60);

  const actual = unwrap(
    await clients.teacher.rpc('get_assignment_analytics', {
      p_assignment_id: assignment.id,
    }),
    'teacher assignment analytics',
  );

  // Compute expectations from the submitted terminal results independently of
  // the server-side aggregation; this intentionally excludes empty slots.
  function stats(rows) {
    const correct = rows.filter((row) => row.outcome === 'correct').length;
    const surrendered = rows.filter(
      (row) => row.outcome === 'surrendered',
    ).length;
    return {
      completed: rows.length,
      correct,
      accuracy: rows.length ? correct / rows.length : null,
      averageAttempts: mean(rows.map((row) => row.attempts)),
      averageTime: mean(rows.map((row) => row.timeSeconds)),
      surrendered,
      surrenderRate: rows.length ? surrendered / rows.length : null,
    };
  }
  const assignedSlotsPerStudent = 10 + 2;
  const summary = {
    studentsEnrolled: 3,
    studentsStarted: 2,
    studentsCompleted: 1,
    completionRate: 1 / 3,
    totalAssignedProblemSlots: 3 * assignedSlotsPerStudent,
    ...stats(submitted),
  };
  const pick = (rows, predicate) => rows.filter(predicate);
  const actualSummary = actual.summary;
  assert.equal(actualSummary.students_enrolled, summary.studentsEnrolled);
  assert.equal(actualSummary.students_started, summary.studentsStarted);
  assert.equal(actualSummary.students_completed, summary.studentsCompleted);
  close(
    actualSummary.completion_rate,
    summary.completionRate,
    'completion rate',
  );
  assert.equal(
    actualSummary.total_assigned_problem_slots,
    summary.totalAssignedProblemSlots,
  );
  assert.equal(actualSummary.problems_completed, summary.completed);
  assert.equal(actualSummary.problems_correct, summary.correct);
  close(actualSummary.accuracy, summary.accuracy, 'overall accuracy');
  close(
    actualSummary.average_attempts,
    summary.averageAttempts,
    'overall average attempts',
  );
  close(
    actualSummary.average_time_seconds,
    summary.averageTime,
    'overall average time',
  );
  assert.equal(actualSummary.surrenders, summary.surrendered);
  close(
    actualSummary.surrender_rate,
    summary.surrenderRate,
    'overall surrender rate',
  );

  const expectedActivities = [
    { key: 'basic', activityKey: 'integration.basic_trig.v1' },
    { key: 'substitution', activityKey: 'integration.u_substitution.v1' },
  ];
  for (const { key, activityKey } of expectedActivities) {
    const rows = pick(submitted, (row) => row.item === key);
    const expected = stats(rows);
    const activity = actual.activities.find(
      (row) => row.activity_key === activityKey,
    );
    assert.ok(activity, `activity ${activityKey} is present`);
    assert.equal(activity.problems_completed, expected.completed);
    assert.equal(activity.problems_correct, expected.correct);
    close(activity.accuracy, expected.accuracy, `${key} accuracy`);
    close(
      activity.average_attempts,
      expected.averageAttempts,
      `${key} attempts`,
    );
    close(activity.average_time_seconds, expected.averageTime, `${key} time`);
    assert.equal(activity.surrenders, expected.surrendered);
    close(
      activity.surrender_rate,
      expected.surrenderRate,
      `${key} surrender rate`,
    );
    assert.equal(
      activity.assigned_problem_slots,
      (key === 'basic' ? 10 : 2) * 3,
    );
  }

  for (const key of ['studentA', 'studentB', 'studentC']) {
    const rows = pick(submitted, (row) => row.student === key);
    const expected = stats(rows);
    const student = actual.students.find(
      (row) => row.student_user_id === userIds[key],
    );
    assert.ok(student, `${key} analytics row is present`);
    assert.equal(student.student_email, emails[key]);
    assert.equal(student.completed_problem_count, expected.completed);
    assert.equal(student.total_problem_count, assignedSlotsPerStudent);
    assert.equal(student.problems_correct, expected.correct);
    assert.equal(
      student.progress_status,
      key === 'studentB'
        ? 'completed'
        : key === 'studentA'
          ? 'in_progress'
          : 'not_started',
    );
    assert.equal(student.accuracy, expected.accuracy);
    assert.equal(student.average_attempts, expected.averageAttempts);
    assert.equal(student.average_time_seconds, expected.averageTime);
    assert.equal(student.surrenders, expected.surrendered);
    assert.equal(student.surrender_rate, expected.surrenderRate);
  }

  const basicActivity = actual.activities.find(
    (row) => row.activity_key === 'integration.basic_trig.v1',
  );
  const thirdPosition = basicActivity.problem_positions.find(
    (row) => row.problem_ordinal === 3,
  );
  assert.equal(thirdPosition.problems_completed, 2);
  assert.equal(thirdPosition.problems_correct, 1);
  assert.equal(thirdPosition.surrenders, 1);
  assert.equal(actual.students.length, 3);

  globalThis.console.log(
    JSON.stringify(
      {
        localOnly: true,
        assignment: 'published',
        activeEnrollees: summary.studentsEnrolled,
        expectedSummary: summary,
        actualSummary,
        exactAssertions: 'PASS',
      },
      null,
      2,
    ),
  );
}

let runError;
try {
  await main();
} catch (error) {
  runError = error;
}

let cleanupError;
for (const client of Object.values(clients)) {
  try {
    await client.auth.signOut();
  } catch (error) {
    cleanupError ??= error;
  }
}
if (workspaceId) {
  try {
    const { error } = await admin
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);
    if (error)
      cleanupError ??= new Error(
        `Local smoke workspace cleanup failed (${error.code ?? error.status}).`,
      );
  } catch (error) {
    cleanupError ??= error;
  }
}
for (const key of Object.keys(userIds)) {
  try {
    const { error } = await admin.auth.admin.deleteUser(userIds[key]);
    if (error && error.status !== 404)
      cleanupError ??= new Error(
        `Local smoke user cleanup failed (${error.code ?? error.status}).`,
      );
  } catch (error) {
    cleanupError ??= error;
  }
}

if (runError) throw runError;
if (cleanupError)
  throw new Error('Local smoke test data cleanup failed.', {
    cause: cleanupError,
  });
