begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('12000000-0000-4000-8000-000000000001', 'results-owner-a@classroom.test'),
  ('12000000-0000-4000-8000-000000000002', 'results-educator-a@classroom.test'),
  ('12000000-0000-4000-8000-000000000003', 'results-student-a@classroom.test'),
  ('12000000-0000-4000-8000-000000000004', 'results-student-a2@classroom.test'),
  ('12000000-0000-4000-8000-000000000005', 'results-owner-b@classroom.test'),
  ('12000000-0000-4000-8000-000000000006', 'results-student-b@classroom.test'),
  ('12000000-0000-4000-8000-000000000007', 'results-outsider@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('52000000-0000-4000-8000-000000000001', 'organization', 'Results workspace A', '12000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000002', 'organization', 'Results workspace B', '12000000-0000-4000-8000-000000000005');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('52000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'owner'),
  ('52000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'educator'),
  ('52000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000005', 'owner');
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.classes (id, workspace_id, name, join_code, status) values
  ('62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Results class A', '23456789AA', 'active'),
  ('62000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'Results class B', '23456789AB', 'active');
insert into public.class_enrollments (class_id, student_user_id) values
  ('62000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003'),
  ('62000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000004'),
  ('62000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000006');
insert into public.assignments (id, class_id, title) values
  ('72000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'Published result assignment'),
  ('72000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', 'Draft result assignment'),
  ('72000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000002', 'Foreign result assignment');
insert into public.assignment_items (id, assignment_id, position, activity_key, problem_count) values
  ('82000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 0, 'integration.basic_trig.v1', 2),
  ('82000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 1, 'integration.u_substitution.v1', 1),
  ('82000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000002', 0, 'integration.by_parts.v1', 2),
  ('82000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000003', 0, 'integration.inverse_trig.v1', 2);
update public.assignments set status = 'published', published_at = now()
where id = '72000000-0000-4000-8000-000000000001';
update public.assignments set status = 'published', published_at = now()
where id = '72000000-0000-4000-8000-000000000003';

select extensions.ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.assignment_problem_results'::regclass), 'result table has RLS enabled');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignment_problem_results'::regclass and conname = 'assignment_problem_results_pkey'), 'result table has a primary key');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignment_problem_results'::regclass and conname = 'assignment_problem_results_assignment_item_id_fkey'), 'results reference assignment items');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignment_problem_results'::regclass and conname = 'assignment_problem_results_student_user_id_fkey'), 'results reference Auth users');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignment_problem_results'::regclass and conname = 'assignment_problem_results_slot_key'), 'one result is allowed per student/item/ordinal slot');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignment_problem_results'::regclass and conname = 'assignment_problem_results_client_id_key'), 'client result IDs are unique per student');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'assignment_problem_results_student_item_idx'), 'student result lookup index exists');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'assignment_problem_results_assignment_item_idx'), 'item foreign key and cascade path are indexed');
select extensions.ok(not has_table_privilege('anon', 'public.assignment_problem_results', 'select') and not has_table_privilege('anon', 'public.assignment_problem_results', 'insert'), 'anon cannot read or write assignment results');
select extensions.ok(has_table_privilege('authenticated', 'public.assignment_problem_results', 'select') and not has_table_privilege('authenticated', 'public.assignment_problem_results', 'insert') and not has_table_privilege('authenticated', 'public.assignment_problem_results', 'update') and not has_table_privilege('authenticated', 'public.assignment_problem_results', 'delete'), 'authenticated has select-only direct table access');
select extensions.ok(has_function_privilege('authenticated', 'public.record_assignment_problem_result(uuid,smallint,text,bigint,text,integer,integer,integer,double precision,text,text,text,text,text,smallint,smallint)', 'execute') and not has_function_privilege('anon', 'public.record_assignment_problem_result(uuid,smallint,text,bigint,text,integer,integer,integer,double precision,text,text,text,text,text,smallint,smallint)', 'execute') and not has_function_privilege('public', 'public.record_assignment_problem_result(uuid,smallint,text,bigint,text,integer,integer,integer,double precision,text,text,text,text,text,smallint,smallint)', 'execute'), 'record RPC is authenticated-only');
select extensions.ok(has_function_privilege('authenticated', 'public.get_assignment_student_progress(uuid)', 'execute') and not has_function_privilege('anon', 'public.get_assignment_student_progress(uuid)', 'execute') and not has_function_privilege('public', 'public.get_assignment_student_progress(uuid)', 'execute'), 'progress RPC is authenticated-only');
select extensions.ok((select count(*)::integer = 2 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_assignment_problem_result','get_assignment_student_progress') and p.prosecdef and p.proconfig @> array['search_path=""']::text[]), 'both public RPCs are SECURITY DEFINER with empty search_path');
select extensions.ok(not exists (select 1 from information_schema.columns where table_schema='public' and table_name='assignment_problem_results' and column_name in ('problem_latex','answer','solution','guided_steps','hint','generator_name','problem_json')), 'result table stores no generated mathematics');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 1::smallint, 'invalid-outcome', 1790270400006, 'abandoned', 1, 0, 1, 50, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint)$$, '23514', 'new row for relation "assignment_problem_results" violates check constraint "assignment_problem_results_outcome_check"', 'abandoned does not count as assignment completion');
select extensions.is(public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 1::smallint, 'result-a-1', 1790270400000, 'correct', 3, 0, 42, 90, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'recorded', 'active enrollee can submit a correct terminal slot');
select extensions.is(public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 1::smallint, 'result-a-1', 1790270400000, 'correct', 3, 0, 42, 90, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'duplicate', 'same client result retry is idempotently acknowledged');
select extensions.is(public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 1::smallint, 'different-retry-for-slot', 1790270400001, 'surrendered', 4, 1, 60, 20, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'duplicate', 'later delivery cannot overwrite the first accepted slot result');
select extensions.is(public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 2::smallint, 'result-a-2', 1790270400002, 'surrendered', 4, 1, 60, 20, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint), 'recorded', 'a distinct problem ordinal can be recorded');
select extensions.is((select count(*)::integer from public.assignment_problem_results), 2, 'duplicate delivery does not create a second row');
select extensions.is((select count(*)::integer from public.assignment_problem_results where student_user_id = (select auth.uid())), 2, 'student reads only their own result rows');
select extensions.is((select count(*)::integer from public.assignment_problem_results where student_user_id = '12000000-0000-4000-8000-000000000004'), 0, 'student cannot read classmate result rows');
select extensions.throws_ok($$insert into public.assignment_problem_results (assignment_item_id,student_user_id,problem_ordinal,client_result_id,client_timestamp_ms,outcome,attempts,surrenders,time_seconds,skill_id,family,variant,technique,source_difficulty,tier) values ('82000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000004',1,'spoof',1,'correct',1,0,1,'skill','family','variant','other','Beginner',1)$$, '42501', 'permission denied for table assignment_problem_results', 'student cannot directly insert a result or choose another user identity');
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 3::smallint, 'ordinal-too-high', 1790270400003, 'correct', 1, 0, 1, 50, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint)$$, 'P0001', 'assignment_unavailable', 'ordinal cannot exceed the immutable item problem count');
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000003', 1::smallint, 'draft-result', 1790270400004, 'correct', 1, 0, 1, 50, 'byParts.basic', 'byParts', 'basic', 'byParts', 'Intermediate', 2::smallint)$$, 'P0001', 'assignment_unavailable', 'student cannot record against a draft assignment');
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000004', 1::smallint, 'foreign-result', 1790270400005, 'correct', 1, 0, 1, 50, 'inverseTrig.basic', 'inverseTrig', 'basic', 'inverseTrig', 'Intermediate', 2::smallint)$$, '42501', 'not_authorized', 'student cannot record against another tenant assignment');
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000002', 1::smallint, 'result-a-1', 1790270400007, 'correct', 1, 0, 1, 50, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint)$$, 'P0001', 'client_result_id_conflict', 'a client result ID cannot be reused for a different slot');
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001', 0::smallint, 'zero-ordinal', 1790270400008, 'correct', 1, 0, 1, 50, 'basicTrig.standard', 'basicTrig', 'standard', 'fundamentals', 'Beginner', 1::smallint)$$, 'P0001', 'assignment_unavailable', 'ordinal zero is rejected');

-- Existing identities and known IDs do not bypass current publication,
-- class/workspace state, or enrollment state.
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.lives_ok($$select public.archive_assignment('72000000-0000-4000-8000-000000000001')$$, 'authorized owner can archive assignment for lifecycle fixture');
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000002', 1::smallint, 'archived-assignment-result', 1790270400009, 'correct', 1, 0, 1, 50, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint)$$, 'P0001', 'assignment_unavailable', 'new results cannot be recorded after assignment archival');
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.lives_ok($$select public.reactivate_assignment('72000000-0000-4000-8000-000000000001')$$, 'authorized owner can reactivate assignment fixture');
update public.classes set status = 'archived' where id = '62000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000002', 1::smallint, 'archived-class-result', 1790270400011, 'correct', 1, 0, 1, 50, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint)$$, 'P0001', 'assignment_unavailable', 'new results cannot be recorded for an archived class');
reset role;
update public.classes set status = 'active' where id = '62000000-0000-4000-8000-000000000001';
update public.workspaces set status = 'archived' where id = '52000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000002', 1::smallint, 'archived-workspace-result', 1790270400012, 'correct', 1, 0, 1, 50, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint)$$, 'P0001', 'assignment_unavailable', 'new results cannot be recorded for an archived workspace');
reset role;
update public.workspaces set status = 'active' where id = '52000000-0000-4000-8000-000000000001';
update public.class_enrollments set status = 'removed' where class_id = '62000000-0000-4000-8000-000000000001' and student_user_id = '12000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000002', 1::smallint, 'removed-student-result', 1790270400013, 'correct', 1, 0, 1, 50, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint)$$, '42501', 'not_authorized', 'removed enrollees cannot record new results');
reset role;
update public.class_enrollments set status = 'active' where class_id = '62000000-0000-4000-8000-000000000001' and student_user_id = '12000000-0000-4000-8000-000000000003';

-- Partial progress is visible only to workspace staff; the RPC returns the
-- enrolled learners and their email only after independently authorizing staff.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*)::integer from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001')), 2, 'authorized educator receives one progress row per active enrollee');
select extensions.is((select progress_status from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001') where student_user_id = '12000000-0000-4000-8000-000000000003'), 'in_progress', 'partial result slots report in_progress');
select extensions.is((select completed_problem_count from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001') where student_user_id = '12000000-0000-4000-8000-000000000003'), 2, 'completed count is derived from unique persisted slots');
select extensions.is((select total_problem_count from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001') where student_user_id = '12000000-0000-4000-8000-000000000003'), 3, 'total count derives from immutable assignment items');
select extensions.is((select progress_status from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001') where student_user_id = '12000000-0000-4000-8000-000000000004'), 'not_started', 'zero results report not_started');
select extensions.is((select student_email from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001') where student_user_id = '12000000-0000-4000-8000-000000000003'), 'results-student-a@classroom.test', 'authorized progress includes only the enrolled learner email');
select extensions.throws_ok($$select * from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'teacher cannot enumerate users from another tenant assignment');

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(public.record_assignment_problem_result('82000000-0000-4000-8000-000000000002', 1::smallint, 'result-a-3', 1790270400010, 'surrendered', 5, 1, 75, 30, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2::smallint), 'recorded', 'second practice block slot can be recorded');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is((select progress_status from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001') where student_user_id = '12000000-0000-4000-8000-000000000003'), 'completed', 'all terminal slots report completed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select * from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'student cannot invoke teacher progress RPC');
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select extensions.throws_ok($$select * from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'outsider cannot invoke progress by known assignment UUID');
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select extensions.throws_ok($$select * from public.get_assignment_student_progress('72000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'foreign workspace staff cannot query progress by known UUID');
reset role;

set local role anon;
select extensions.throws_ok($$select * from public.assignment_problem_results$$, '42501', 'permission denied for table assignment_problem_results', 'anon cannot read result rows');
select extensions.throws_ok($$select public.record_assignment_problem_result('82000000-0000-4000-8000-000000000001',1::smallint,'anon-result',1790270400009,'correct',1,0,1,50,'skill','family','variant','other','Beginner',1::smallint)$$, '42501', 'permission denied for function record_assignment_problem_result', 'anon cannot call the result recording RPC');
reset role;

select * from extensions.finish();
rollback;
