begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('a2000000-0000-4000-8000-000000000001', 'dashboard-owner@classroom.test'),
  ('a2000000-0000-4000-8000-000000000002', 'dashboard-student-a@classroom.test'),
  ('a2000000-0000-4000-8000-000000000003', 'dashboard-student-b@classroom.test'),
  ('a2000000-0000-4000-8000-000000000004', 'dashboard-foreign@classroom.test'),
  ('a2000000-0000-4000-8000-000000000005', 'dashboard-outsider@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('a3000000-0000-4000-8000-000000000001', 'organization', 'Dashboard workspace', 'a2000000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-000000000002', 'organization', 'Foreign dashboard workspace', 'a2000000-0000-4000-8000-000000000004');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'owner'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000004', 'owner');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select extensions.ok(
  has_function_privilege('authenticated', 'public.get_workspace_dashboard(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_workspace_dashboard(uuid)', 'execute')
    and not has_function_privilege('public', 'public.get_workspace_dashboard(uuid)', 'execute'),
  'dashboard RPC is executable by authenticated clients only'
);
select extensions.ok((
  select p.prosecdef and p.proconfig @> array['search_path=""']::text[]
  from pg_catalog.pg_proc as p
  where p.oid = 'public.get_workspace_dashboard(uuid)'::regprocedure
), 'dashboard RPC has a fixed empty search path');
select extensions.is(
  (public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'active_classes')::integer,
  0, 'empty workspace has no active classes'
);
select extensions.is(
  public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->'accuracy',
  'null'::jsonb, 'empty workspace does not claim zero accuracy'
);

insert into public.classes (id, workspace_id, name, join_code, status) values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Class A', 'ABCDE23456', 'active'),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'Class B', 'BCDEF23456', 'active'),
  ('a4000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000001', 'Archived class', 'CDEFG23456', 'archived'),
  ('a4000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000002', 'Foreign class', 'DEFGH23456', 'active');
insert into public.class_enrollments (class_id, student_user_id) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002'),
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003'),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002');

insert into public.assignments (id, class_id, title) values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Two-problem set'),
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'One-problem set'),
  ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'Draft set'),
  ('a5000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000003', 'Archived-class set'),
  ('a5000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000004', 'Foreign set');
insert into public.assignment_items (id, assignment_id, position, activity_key, problem_count) values
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 0, 'integration.basic_trig.v1', 2),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002', 0, 'integration.u_substitution.v1', 1),
  ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000003', 0, 'integration.by_parts.v1', 2),
  ('a6000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000004', 0, 'integration.inverse_trig.v1', 1),
  ('a6000000-0000-4000-8000-000000000005', 'a5000000-0000-4000-8000-000000000005', 0, 'integration.partial_fractions.v1', 1);
update public.assignments set status = 'published', published_at = now()
where id in (
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000004',
  'a5000000-0000-4000-8000-000000000005'
);

insert into public.assignment_problem_results (
  assignment_item_id, student_user_id, problem_ordinal, client_result_id,
  client_timestamp_ms, outcome, attempts, surrenders, time_seconds,
  skill_id, family, variant, technique, source_difficulty, tier
) values
  ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 1, 'dashboard-a-1', 1790270400001, 'correct', 1, 0, 30, 'basic', 'basic', 'standard', 'basic', 'Beginner', 1),
  ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 2, 'dashboard-a-2', 1790270400002, 'surrendered', 2, 1, 45, 'basic', 'basic', 'standard', 'basic', 'Beginner', 1),
  ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 1, 'dashboard-b-1', 1790270400003, 'correct', 3, 0, 60, 'basic', 'basic', 'standard', 'basic', 'Beginner', 1),
  ('a6000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 1, 'dashboard-a-3', 1790270400004, 'correct', 1, 0, 30, 'usub', 'usub', 'standard', 'usub', 'Intermediate', 2);

select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'active_classes')::integer, 2, 'only active classes are counted');
select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'students')::integer, 2, 'student in two classes is counted once');
select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'active_assignments')::integer, 2, 'draft and archived-class work excluded');
select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'student_assignment_opportunities')::integer, 3, 'completion denominator uses active student-assignment pairs');
select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'students_completed')::integer, 2, 'surrendered slots count as complete');
select extensions.ok(abs((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'completion_rate')::numeric - 2::numeric/3) < 0.000000001, 'completion rate uses student-assignment pairs');
select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'problems_completed')::integer, 4, 'four terminal results counted once');
select extensions.is((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'problems_correct')::integer, 3, 'surrendered slot is not correct');
select extensions.ok(abs((public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'summary'->>'accuracy')::numeric - 3::numeric/4) < 0.000000001, 'accuracy uses terminal result denominator');
select extensions.is(pg_catalog.jsonb_array_length(public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'classes'), 2, 'class rows are bounded to active workspace classes');
select extensions.is(pg_catalog.jsonb_array_length(public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'assignments'), 2, 'assignment rows are bounded to published work');
select extensions.is(pg_catalog.jsonb_array_length(public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'activities'), 2, 'activities aggregate existing item families');
select extensions.is((
  select (row->>'problems_completed')::integer
  from pg_catalog.jsonb_array_elements(public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')->'activities') as activities(row)
  where row->>'activity_key' = 'integration.basic_trig.v1'
), 3, 'activity bar counts only completed problems in that family');
select extensions.ok(public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')::text !~* 'student_user_id|@classroom.test|problem_latex', 'response exposes no student identity or generated math');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'student cannot query teacher dashboard');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'foreign owner cannot query by known UUID');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select extensions.throws_ok($$select public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'outsider cannot query dashboard');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok($$select public.get_workspace_dashboard('a3000000-0000-4000-8000-000000000001')$$, '42501', null, 'anonymous cannot execute dashboard RPC');
reset role;

select * from extensions.finish();
rollback;
