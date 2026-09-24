import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const status = spawnSync(
  './node_modules/.bin/supabase',
  ['status', '-o', 'env'],
  {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  },
);
if (status.status !== 0)
  throw new Error('Local Supabase must be running for this smoke test.');
const env = Object.fromEntries(
  status.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const apiUrl = new globalThis.URL(env.API_URL ?? '');
if (!['127.0.0.1', 'localhost', '::1'].includes(apiUrl.hostname)) {
  throw new Error(
    'Refusing to run the smoke test against a non-local Supabase URL.',
  );
}
if (!env.SERVICE_ROLE_KEY || !env.ANON_KEY)
  throw new Error('Local Supabase status omitted test credentials.');

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = randomBytes(32).toString('base64url');
const suffix = randomBytes(8).toString('hex');
const teacherEmail = `phase5-teacher-${suffix}@example.test`;
const studentEmail = `phase5-student-${suffix}@example.test`;
let teacherId;
let studentId;

const assertNoError = (result, label) => {
  if (result.error)
    throw new Error(`${label} failed (${result.error.code ?? 'unknown'})`);
  return result.data;
};

async function provision(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(
      `Local test-user creation failed (${error?.status ?? 'unknown'}).`,
    );
  return data.user.id;
}

async function signIn(email) {
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    throw new Error(`Local test-user sign-in failed (${error.status}).`);
  return client;
}

try {
  teacherId = await provision(teacherEmail);
  studentId = await provision(studentEmail);
  const teacher = await signIn(teacherEmail);
  const student = await signIn(studentEmail);

  const workspaceRows = assertNoError(
    await teacher.rpc('ensure_personal_workspace'),
    'teacher workspace bootstrap',
  );
  const workspaceId = workspaceRows?.[0]?.workspace_id;
  assert.ok(workspaceId, 'teacher receives a personal workspace');

  const classRow = assertNoError(
    await teacher
      .from('classes')
      .insert({ workspace_id: workspaceId, name: 'Phase 5 local smoke class' })
      .select('id,name')
      .single(),
    'teacher class creation',
  );

  const assignment = assertNoError(
    await teacher
      .from('assignments')
      .insert({ class_id: classRow.id, title: 'Phase 5 vertical slice' })
      .select('id,title,status')
      .single(),
    'teacher draft creation',
  );
  const item = assertNoError(
    await teacher
      .from('assignment_items')
      .insert({
        assignment_id: assignment.id,
        position: 0,
        activity_contract_version: 1,
        activity_key: 'integration.basic_trig.v1',
        problem_count: 2,
      })
      .select('id,problem_count')
      .single(),
    'teacher practice-block creation',
  );
  const published = assertNoError(
    await teacher.rpc('publish_assignment', { p_assignment_id: assignment.id }),
    'teacher publication',
  );
  assert.equal(published?.[0]?.status, 'published');

  const joinCode = assertNoError(
    await teacher.rpc('get_class_join_code', { p_class_id: classRow.id }),
    'teacher join-code retrieval',
  );
  const joined = assertNoError(
    await student.rpc('join_class_by_code', { p_code: joinCode }),
    'student class join',
  );
  assert.equal(joined?.[0]?.class_id, classRow.id);
  assert.equal(joined?.[0]?.enrollment_status, 'active');

  const visibleAssignments = assertNoError(
    await student
      .from('assignments')
      .select('id,title,status')
      .eq('class_id', classRow.id)
      .eq('status', 'published'),
    'student published assignment read',
  );
  assert.equal(visibleAssignments?.length, 1);

  const record = async (ordinal, outcome, clientResultId) =>
    assertNoError(
      await student.rpc('record_assignment_problem_result', {
        p_assignment_item_id: item.id,
        p_problem_ordinal: ordinal,
        p_client_result_id: clientResultId,
        p_client_timestamp_ms: Date.now(),
        p_outcome: outcome,
        p_attempts: 2,
        p_surrenders: outcome === 'surrendered' ? 1 : 0,
        p_time_seconds: 30,
        p_grade_points: outcome === 'correct' ? 95 : 25,
        p_skill_id: 'basicTrig.standard',
        p_family: 'basicTrig',
        p_variant: 'standard',
        p_technique: 'fundamentals',
        p_source_difficulty: 'Beginner',
        p_tier: 1,
        p_schema_version: 1,
      }),
      `student result slot ${ordinal}`,
    );

  assert.equal(await record(1, 'correct', `smoke-${suffix}-1`), 'recorded');
  const partial = assertNoError(
    await teacher.rpc('get_assignment_student_progress', {
      p_assignment_id: assignment.id,
    }),
    'teacher partial progress',
  );
  assert.equal(partial.length, 1);
  assert.equal(partial[0].student_user_id, studentId);
  assert.equal(partial[0].student_email, studentEmail);
  assert.equal(partial[0].completed_problem_count, 1);
  assert.equal(partial[0].total_problem_count, item.problem_count);
  assert.equal(partial[0].progress_status, 'in_progress');

  assert.equal(await record(2, 'surrendered', `smoke-${suffix}-2`), 'recorded');
  const completed = assertNoError(
    await teacher.rpc('get_assignment_student_progress', {
      p_assignment_id: assignment.id,
    }),
    'teacher completed progress',
  );
  assert.equal(completed[0].completed_problem_count, 2);
  assert.equal(completed[0].total_problem_count, 2);
  assert.equal(completed[0].progress_status, 'completed');
  globalThis.console.log(
    'Local Supabase vertical-slice smoke passed: teacher published; student joined and recorded 1/2 then 2/2; teacher saw in_progress then completed.',
  );
} finally {
  if (studentId) await admin.auth.admin.deleteUser(studentId);
  if (teacherId) await admin.auth.admin.deleteUser(teacherId);
}
