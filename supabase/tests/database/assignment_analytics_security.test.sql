begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('92000000-0000-4000-8000-000000000001', 'analytics-owner@classroom.test'),
  ('92000000-0000-4000-8000-000000000002', 'analytics-student-a@classroom.test'),
  ('92000000-0000-4000-8000-000000000003', 'analytics-student-b@classroom.test'),
  ('92000000-0000-4000-8000-000000000004', 'analytics-student-c@classroom.test'),
  ('92000000-0000-4000-8000-000000000005', 'analytics-foreign-owner@classroom.test'),
  ('92000000-0000-4000-8000-000000000006', 'analytics-foreign-student@classroom.test'),
  ('92000000-0000-4000-8000-000000000007', 'analytics-outsider@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('93000000-0000-4000-8000-000000000001', 'organization', 'Analytics workspace A', '92000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002', 'organization', 'Analytics workspace B', '92000000-0000-4000-8000-000000000005');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'owner'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000005', 'owner');
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.classes (id, workspace_id, name, join_code, status) values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'Analytics class A', 'ABCDEFGHJK', 'active'),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', 'Analytics class B', 'BCDEFGHJKM', 'active'),
  ('94000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', 'Analytics empty class', 'CDEFGHJKMN', 'active');
insert into public.class_enrollments (class_id, student_user_id) values
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004'),
  ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000006');
insert into public.assignments (id, class_id, title) values
  ('95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'Ten-problem analytics assignment'),
  ('95000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002', 'Foreign assignment'),
  ('95000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000003', 'Empty-class analytics assignment'),
  ('95000000-0000-4000-8000-000000000004', '94000000-0000-4000-8000-000000000001', 'Draft analytics assignment');
insert into public.assignment_items (id, assignment_id, position, activity_key, problem_count) values
  ('96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 0, 'integration.basic_trig.v1', 10),
  ('96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000001', 1, 'integration.u_substitution.v1', 2),
  ('96000000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000002', 0, 'integration.inverse_trig.v1', 2),
  ('96000000-0000-4000-8000-000000000004', '95000000-0000-4000-8000-000000000003', 0, 'integration.by_parts.v1', 3);
update public.assignments set status = 'published', published_at = now()
where id in ('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000003');

select extensions.ok(has_function_privilege('authenticated', 'public.get_assignment_analytics(uuid)', 'execute') and not has_function_privilege('anon', 'public.get_assignment_analytics(uuid)', 'execute') and not has_function_privilege('public', 'public.get_assignment_analytics(uuid)', 'execute'), 'analytics RPC execute is authenticated-only');
select extensions.ok((select p.prosecdef and p.proconfig @> array['search_path=""']::text[] from pg_catalog.pg_proc p where p.oid = 'public.get_assignment_analytics(uuid)'::regprocedure), 'analytics RPC is SECURITY DEFINER with empty search_path');

-- Student A has three of twelve terminal slots: two correct and one
-- surrendered. Abandoned work is not represented by the Phase-5 contract.
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is(public.record_assignment_problem_result('96000000-0000-4000-8000-000000000001', 1::smallint, 'analytics-a-1', 1790270400001, 'correct', 1, 0, 30, 90, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'recorded', 'student A correct result is accepted');
select extensions.is(public.record_assignment_problem_result('96000000-0000-4000-8000-000000000001', 2::smallint, 'analytics-a-2', 1790270400002, 'correct', 3, 0, 60, 75, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'recorded', 'student A second correct result is accepted');
select extensions.is(public.record_assignment_problem_result('96000000-0000-4000-8000-000000000001', 3::smallint, 'analytics-a-3', 1790270400003, 'surrendered', 4, 1, 90, 20, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'recorded', 'surrender is persisted as a terminal completed slot');

-- Student B completes all twelve slots with a mixed number of attempts.
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is((
  select count(*)::integer
  from (
    select public.record_assignment_problem_result(
      '96000000-0000-4000-8000-000000000001', ord::smallint,
      'analytics-b-basic-' || ord::text, 1790270400100 + ord,
      case when ord = 10 then 'surrendered' else 'correct' end,
      2, case when ord = 10 then 1 else 0 end, 40,
      case when ord = 10 then 20 else 90 end,
      'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals',
      'Beginner', 1::smallint
    ) as result
    from pg_catalog.generate_series(1, 10) as ord
  ) as recorded
  where result = 'recorded'
), 10, 'student B records every slot in the ten-problem block');
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is((
  select count(*)::integer
  from (
    select public.record_assignment_problem_result(
      '96000000-0000-4000-8000-000000000002', ord::smallint,
      'analytics-b-usub-' || ord::text, 1790270400200 + ord,
      'correct', case when ord = 1 then 1 else 3 end, 0,
      case when ord = 1 then 40 else 60 end, 90,
      'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint
    ) as result
    from pg_catalog.generate_series(1, 2) as ord
  ) as recorded
  where result = 'recorded'
), 2, 'student B records both slots in the second block');

-- Summary arithmetic is derived from unique terminal result rows and active
-- enrollments, not from client retry delivery or partially used slots.
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'students_enrolled')::integer, 3, 'summary counts active enrollments only');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'students_started')::integer, 2, 'started means at least one terminal result is recorded');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'students_completed')::integer, 1, 'only a student with every assigned slot is completed');
select extensions.ok(abs((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'completion_rate')::numeric - (1::numeric / 3)) < 0.000000001, 'completion rate is completed students divided by active enrolled students');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'total_assigned_problem_slots')::integer, 36, 'ten-problem and two-problem blocks total twelve slots per enrolled student');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'problems_completed')::integer, 15, 'correct and surrendered results count as completed, without retry inflation');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'problems_correct')::integer, 13, 'surrendered slots are not counted as correct');
select extensions.ok(abs((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'accuracy')::numeric - (13::numeric / 15)) < 0.000000001, 'accuracy is correct terminal results divided by all terminal results');
select extensions.ok(abs((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'average_attempts')::numeric - (32::numeric / 15)) < 0.000000001, 'average attempts is weighted by completed problem result');
select extensions.ok(abs((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'average_time_seconds')::numeric - (680::numeric / 15)) < 0.000000001, 'average time is weighted by completed problem result');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'surrenders')::integer, 2, 'surrenders count terminal surrendered slots');
select extensions.ok(abs((public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'summary'->>'surrender_rate')::numeric - (2::numeric / 15)) < 0.000000001, 'surrender rate denominator is terminal result slots');

-- Activity and assignment-position aggregates preserve per-block ordering and
-- do not imply the generated expressions were the same for different students.
select extensions.is((
  select (activity->>'problems_completed')::integer
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'activities') as activities(activity)
  where activity->>'activity_key' = 'integration.basic_trig.v1'
), 13, 'ten-problem activity completion aggregates thirteen student slots');
select extensions.is((
  select (activity->>'problems_correct')::integer
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'activities') as activities(activity)
  where activity->>'activity_key' = 'integration.basic_trig.v1'
), 11, 'activity accuracy excludes surrendered results');
select extensions.is((
  select (activity->>'assigned_problem_slots')::integer
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'activities') as activities(activity)
  where activity->>'activity_key' = 'integration.u_substitution.v1'
), 6, 'second activity denominator is its problem count times active enrollments');
select extensions.ok(abs((
  select (activity->>'average_time_seconds')::numeric
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'activities') as activities(activity)
  where activity->>'activity_key' = 'integration.u_substitution.v1'
) - 50) < 0.000000001, 'second activity average time is correct');
select extensions.is((
  select (position->>'problems_completed')::integer
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'activities') as activities(activity)
  cross join lateral pg_catalog.jsonb_array_elements(activity->'problem_positions') as positions(position)
  where activity->>'activity_key' = 'integration.basic_trig.v1'
  and (position->>'problem_ordinal')::integer = 3
), 2, 'assignment position three has two terminal student results');
select extensions.is((
  select (position->>'surrenders')::integer
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'activities') as activities(activity)
  cross join lateral pg_catalog.jsonb_array_elements(activity->'problem_positions') as positions(position)
  where activity->>'activity_key' = 'integration.basic_trig.v1'
    and (position->>'problem_ordinal')::integer = 3
), 1, 'assignment position analysis marks the surrendered slot separately');

-- Per-student analytics include the not-started student with null rates and
-- contain only active enrollees from this assignment's class.
select extensions.is(pg_catalog.jsonb_array_length(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'students'), 3, 'analytics returns one row for each active enrollee and no unrelated Auth user');
select extensions.is((
  select student->>'progress_status'
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'students') as students(student)
  where student->>'student_user_id' = '92000000-0000-4000-8000-000000000002'
), 'in_progress', 'student A remains partial');
select extensions.is((
  select student->>'progress_status'
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'students') as students(student)
  where student->>'student_user_id' = '92000000-0000-4000-8000-000000000003'
), 'completed', 'student B is complete across multiple blocks');
select extensions.is((
  select student->>'progress_status'
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'students') as students(student)
  where student->>'student_user_id' = '92000000-0000-4000-8000-000000000004'
), 'not_started', 'student C with no terminal result remains not started');
select extensions.is((
  select student->'accuracy'
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'students') as students(student)
  where student->>'student_user_id' = '92000000-0000-4000-8000-000000000004'
), 'null'::jsonb, 'not-started student has null rather than misleading zero accuracy');
select extensions.ok(not exists (
  select 1
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')->'students') as students(student)
  where student->>'student_email' = 'analytics-foreign-student@classroom.test'
), 'foreign class student email is not returned');

-- Empty classes and not-yet-published assignments keep empty ratios null and
-- do not invent student rows or completion outcomes.
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'summary'->>'students_enrolled')::integer, 0, 'empty-class summary reports zero active enrollees');
select extensions.is((public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'summary'->>'total_assigned_problem_slots')::integer, 0, 'empty-class denominator is zero despite assignment problem count');
select extensions.is(public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'summary'->'completion_rate', 'null'::jsonb, 'completion rate is null with no enrolled students');
select extensions.is(public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'summary'->'accuracy', 'null'::jsonb, 'accuracy is null without terminal results');
select extensions.is(public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'summary'->'average_attempts', 'null'::jsonb, 'average attempts is null without terminal results');
select extensions.is(pg_catalog.jsonb_array_length(public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'students'), 0, 'empty class returns no unrelated student identities');
select extensions.is((
  select (activity->>'assigned_problem_slots')::integer
  from pg_catalog.jsonb_array_elements(public.get_assignment_analytics('95000000-0000-4000-8000-000000000003')->'activities') as activities(activity)
), 0, 'empty-class activity slot denominator is zero');
select extensions.throws_ok($$select public.get_assignment_analytics('95000000-0000-4000-8000-000000000004')$$, '42501', 'not_authorized', 'draft assignments have no teacher analytics');

-- IDOR/privacy checks: UUID knowledge does not grant analytics access.
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'student cannot query teacher aggregate analytics');
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'outsider cannot query by known assignment UUID');
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'foreign workspace staff cannot query assignment analytics');
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_assignment_analytics('95000000-0000-4000-8000-000000000002')$$, '42501', 'not_authorized', 'foreign assignment UUID is not authorized');
reset role;
set local role anon;
select extensions.throws_ok($$select public.get_assignment_analytics('95000000-0000-4000-8000-000000000001')$$, '42501', 'permission denied for function get_assignment_analytics', 'anonymous caller cannot execute analytics RPC');
reset role;

select * from extensions.finish();
rollback;
