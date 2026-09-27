begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('13000000-0000-4000-8000-000000000001', 'lifecycle-owner@classroom.test'),
  ('13000000-0000-4000-8000-000000000002', 'lifecycle-foreign-owner@classroom.test'),
  ('13000000-0000-4000-8000-000000000003', 'lifecycle-student@classroom.test'),
  ('13000000-0000-4000-8000-000000000004', 'lifecycle-outsider@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('53000000-0000-4000-8000-000000000001', 'organization', 'Lifecycle workspace A', '13000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', 'organization', 'Lifecycle workspace B', '13000000-0000-4000-8000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('53000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'owner'),
  ('53000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', 'owner');

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.classes (id, workspace_id, name, join_code, status) values
  ('63000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Lifecycle class A', '3456789ABC', 'active'),
  ('63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'Lifecycle class B', '3456789ABD', 'active');
insert into public.class_enrollments (class_id, student_user_id) values
  ('63000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003');

insert into public.assignments (id, class_id, title, due_at) values
  ('73000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'Lifecycle draft', '2030-01-10T12:00:00Z'),
  ('73000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000001', 'Published without results', '2030-01-11T12:00:00Z'),
  ('73000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', 'Published with results', '2030-01-12T12:00:00Z'),
  ('73000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000001', 'Archived without results', null),
  ('73000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000002', 'Foreign assignment', null);
insert into public.assignment_items (
  id, assignment_id, position, activity_contract_version, activity_key, problem_count,
  generation_spec_version, difficulty_profile, variant_policy, generation_seed
) values
  ('83000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 0, 1, 'integration.basic_trig.v1', 5, default, default, default, default),
  ('83000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', 0, 1, 'integration.u_substitution.v1', 5, default, default, default, default),
  ('83000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000002', 1, 1, 'integration.by_parts.v1', 7, default, default, default, default),
  ('83000000-0000-4000-8000-000000000004', '73000000-0000-4000-8000-000000000003', 0, 1, 'integration.inverse_trig.v1', 2, 1, 'intermediate', 'same_for_all', '93000000-0000-4000-8000-000000000004'),
  ('83000000-0000-4000-8000-000000000005', '73000000-0000-4000-8000-000000000003', 1, 1, 'integration.partial_fractions.v1', 3, default, default, default, default),
  ('83000000-0000-4000-8000-000000000006', '73000000-0000-4000-8000-000000000004', 0, 1, 'integration.basic_trig.v1', 4, default, default, default, default),
  ('83000000-0000-4000-8000-000000000007', '73000000-0000-4000-8000-000000000005', 0, 1, 'integration.log_u_substitution.v1', 6, default, default, default, default);

update public.assignments set status = 'published', published_at = '2026-09-01T12:00:00Z'
where id in ('73000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000005');
update public.assignments set status = 'archived', published_at = '2026-09-02T12:00:00Z'
where id = '73000000-0000-4000-8000-000000000004';

insert into public.assignment_problem_results (
  assignment_item_id, student_user_id, problem_ordinal, client_result_id,
  client_timestamp_ms, outcome, attempts, surrenders, time_seconds,
  grade_points, skill_id, family, variant, technique, source_difficulty, tier
) values (
  '83000000-0000-4000-8000-000000000004',
  '13000000-0000-4000-8000-000000000003',
  1, 'lifecycle-source-result', 1790270400000, 'correct', 2, 0, 40,
  90, 'inverseTrig.basic', 'inverseTrig', 'basic', 'inverseTrig', 'Intermediate', 2
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.get_assignment_delete_status(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_assignment_delete_status(uuid)', 'execute')
    and not has_function_privilege('public', 'public.get_assignment_delete_status(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.duplicate_assignment(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.duplicate_assignment(uuid)', 'execute')
    and not has_function_privilege('public', 'public.duplicate_assignment(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.delete_assignment(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.delete_assignment(uuid)', 'execute')
    and not has_function_privilege('public', 'public.delete_assignment(uuid)', 'execute'),
  'lifecycle RPCs are executable only by authenticated clients'
);
select extensions.ok(
  (select count(*)::integer = 3
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('get_assignment_delete_status', 'duplicate_assignment', 'delete_assignment')
     and p.prosecdef
     and p.proconfig @> array['search_path=""']::text[]),
  'all lifecycle RPCs use SECURITY DEFINER with an empty search_path'
);
select extensions.ok(not has_table_privilege('authenticated', 'public.assignments', 'delete'), 'lifecycle still has no direct assignment DELETE grant');
select extensions.ok(
  has_column_privilege('authenticated', 'public.assignment_items', 'generation_spec_version', 'select')
    and has_column_privilege('authenticated', 'public.assignment_items', 'difficulty_profile', 'insert')
    and has_column_privilege('authenticated', 'public.assignment_items', 'variant_policy', 'update')
    and not has_column_privilege('authenticated', 'public.assignment_items', 'generation_seed', 'insert')
    and not has_column_privilege('authenticated', 'public.assignment_items', 'generation_seed', 'update'),
  'clients can read and configure bounded intent but cannot choose or change the seed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select extensions.is(public.get_assignment_delete_status('73000000-0000-4000-8000-000000000001'), false, 'draft with no results is eligible for deletion');
select extensions.is(public.get_assignment_delete_status('73000000-0000-4000-8000-000000000002'), false, 'published assignment without results is eligible for deletion');
select extensions.is(public.get_assignment_delete_status('73000000-0000-4000-8000-000000000003'), true, 'result-bearing assignment is not eligible for deletion');
select extensions.throws_ok(
  $$insert into public.assignment_items (assignment_id, position, activity_key, problem_count, difficulty_profile)
    values ('73000000-0000-4000-8000-000000000001', 1, 'integration.basic_trig.v1', 2, 'advanced')$$,
  '23514',
  'new row for relation "assignment_items" violates check constraint "assignment_items_generation_spec_shape_check"',
  'database rejects an activity/difficulty combination not supported by Calcura'
);
insert into public.assignment_items (
  assignment_id, position, activity_key, problem_count,
  difficulty_profile, variant_policy
) values (
  '73000000-0000-4000-8000-000000000001',
  1, 'integration.basic_trig.v1', 2, 'beginner', 'same_for_all'
);
select extensions.is(
  (select generation_spec_version::integer from public.assignment_items where assignment_id = '73000000-0000-4000-8000-000000000001' and position = 1),
  1,
  'new teacher blocks receive generation spec version 1 by default'
);
select extensions.ok(
  (select generation_seed is not null from public.assignment_items where assignment_id = '73000000-0000-4000-8000-000000000001' and position = 1),
  'generation seed is assigned by the database'
);
select extensions.throws_ok(
  $$update public.assignment_items set difficulty_profile = 'advanced' where assignment_id = '73000000-0000-4000-8000-000000000001' and position = 1$$,
  '23514',
  'new row for relation "assignment_items" violates check constraint "assignment_items_generation_spec_shape_check"',
  'draft mutation cannot store an unsupported difficulty profile'
);
insert into public.assignment_items (
  assignment_id, position, activity_key, problem_count,
  difficulty_profile, variant_policy
) values (
  '73000000-0000-4000-8000-000000000001',
  2, 'integration.basic_trig.v1', 2, 'intermediate', 'individualized'
);
select extensions.is(
  (select difficulty_profile from public.assignment_items where assignment_id = '73000000-0000-4000-8000-000000000001' and position = 2),
  'intermediate',
  'database accepts Basic Trig intermediate because Calcura supports it'
);

select set_config('test.analytics_before', public.get_assignment_analytics('73000000-0000-4000-8000-000000000003')::text, true);
select set_config('test.copy_id', public.duplicate_assignment('73000000-0000-4000-8000-000000000003')::text, true);
select extensions.ok(current_setting('test.copy_id')::uuid <> '73000000-0000-4000-8000-000000000003'::uuid, 'duplicate receives a new assignment UUID');
select extensions.is((select status from public.assignments where id = current_setting('test.copy_id')::uuid), 'draft', 'duplicate starts as a draft');
select extensions.is((select published_at from public.assignments where id = current_setting('test.copy_id')::uuid), null::timestamptz, 'duplicate has no publication timestamp');
select extensions.is((select due_at from public.assignments where id = current_setting('test.copy_id')::uuid), null::timestamptz, 'duplicate does not carry the source due date');
select extensions.is((select title from public.assignments where id = current_setting('test.copy_id')::uuid), 'Published with results (Copy)', 'duplicate title is clearly marked as a copy');
select extensions.is((select count(*)::integer from public.assignment_items where assignment_id = current_setting('test.copy_id')::uuid), 2, 'duplicate copies every practice block');
select extensions.is((select pg_catalog.array_agg(position order by position) from public.assignment_items where assignment_id = current_setting('test.copy_id')::uuid), array[0, 1], 'duplicate preserves item order');
select extensions.is(
  (select pg_catalog.array_agg(activity_key || ':' || problem_count::text order by position) from public.assignment_items where assignment_id = current_setting('test.copy_id')::uuid),
  array['integration.inverse_trig.v1:2', 'integration.partial_fractions.v1:3'],
  'duplicate preserves activity configuration and problem counts'
);
select extensions.is(
  (select pg_catalog.array_agg(difficulty_profile || ':' || variant_policy order by position)
   from public.assignment_items where assignment_id = current_setting('test.copy_id')::uuid),
  array['intermediate:same_for_all', 'auto:individualized'],
  'duplicate copies validated generation intent'
);
select extensions.ok(
  (select generation_spec_version = 1
      and generation_seed is not null
      and generation_seed <> '93000000-0000-4000-8000-000000000004'::uuid
   from public.assignment_items
   where assignment_id = current_setting('test.copy_id')::uuid and position = 0),
  'duplicate receives a fresh generation seed instead of repeating the source seed'
);
select extensions.is(
  (select count(*)::integer from public.assignment_items as source
   join public.assignment_items as copy on copy.id = source.id
   where source.assignment_id = '73000000-0000-4000-8000-000000000003'
     and copy.assignment_id = current_setting('test.copy_id')::uuid),
  0,
  'duplicate uses fresh assignment-item UUIDs'
);
select extensions.is((select status from public.assignments where id = '73000000-0000-4000-8000-000000000003'), 'published', 'duplication leaves source state unchanged');
select extensions.is((select title from public.assignments where id = '73000000-0000-4000-8000-000000000003'), 'Published with results', 'duplication leaves source title unchanged');
reset role;
select extensions.is((select count(*)::integer from public.assignment_problem_results as r join public.assignment_items as ai on ai.id = r.assignment_item_id where ai.assignment_id = current_setting('test.copy_id')::uuid), 0, 'duplicate contains no copied student results');
select extensions.is((select count(*)::integer from public.assignment_problem_results where assignment_item_id = '83000000-0000-4000-8000-000000000004'), 1, 'source result remains attached only to its original item');
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is(
  (public.get_assignment_analytics('73000000-0000-4000-8000-000000000003')->'summary'->>'problems_completed')::integer,
  1,
  'duplication leaves source result attached to the original assignment'
);
select extensions.is(
  public.get_assignment_analytics('73000000-0000-4000-8000-000000000003')->'summary',
  current_setting('test.analytics_before')::jsonb->'summary',
  'source analytics summary is unchanged after duplication'
);
select extensions.is(
  public.get_assignment_delete_status(current_setting('test.copy_id')::uuid),
  false,
  'duplicate has no result history'
);

-- A safe metadata change does not alter immutable published practice content.
update public.assignments
set title = 'Published title updated safely', due_at = '2030-02-01T12:00:00Z'
where id = '73000000-0000-4000-8000-000000000003';
select extensions.is((select title from public.assignments where id = '73000000-0000-4000-8000-000000000003'), 'Published title updated safely', 'authorized teacher may edit safe metadata on a published assignment');
select extensions.is((select due_at from public.assignments where id = '73000000-0000-4000-8000-000000000003'), '2030-02-01T12:00:00Z'::timestamptz, 'authorized teacher may update a published due date');
select extensions.lives_ok($$update public.assignment_items set problem_count = 4 where id = '83000000-0000-4000-8000-000000000004'$$, 'published structural update is safely rejected by RLS');
select extensions.is((select problem_count::integer from public.assignment_items where id = '83000000-0000-4000-8000-000000000004'), 2, 'published problem count remains immutable');
select extensions.lives_ok($$update public.assignment_items set difficulty_profile = 'advanced' where id = '83000000-0000-4000-8000-000000000004'$$, 'published generation-profile update is safely rejected by RLS');
select extensions.is((select difficulty_profile from public.assignment_items where id = '83000000-0000-4000-8000-000000000004'), 'intermediate', 'published generation intent remains immutable');

-- The eligibility check can become stale. A result inserted after it is still
-- protected by the delete RPC's lock and second server-side check.
select extensions.is(public.get_assignment_delete_status('73000000-0000-4000-8000-000000000002'), false, 'pre-delete check reports no result before simulated race');
reset role;
insert into public.assignment_problem_results (
  assignment_item_id, student_user_id, problem_ordinal, client_result_id,
  client_timestamp_ms, outcome, attempts, surrenders, time_seconds,
  grade_points, skill_id, family, variant, technique, source_difficulty, tier
) values (
  '83000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000003',
  1, 'lifecycle-race-result', 1790270400001, 'surrendered', 3, 1, 55,
  20, 'uSub.basic', 'uSub', 'basic', 'uSub', 'Intermediate', 2
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000002')$$, 'P0001', 'assignment_has_results', 'delete rechecks and blocks a result committed after the UI eligibility check');
reset role;
select extensions.is((select count(*)::integer from public.assignment_problem_results where assignment_item_id = '83000000-0000-4000-8000-000000000002'), 1, 'blocked delete preserves the newly committed result history');
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((public.get_assignment_analytics('73000000-0000-4000-8000-000000000002')->'summary'->>'problems_completed')::integer, 1, 'analytics remain accessible after a blocked delete');

-- Draft, published-empty, and archived-empty assignments may be deleted.
select extensions.lives_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000001')$$, 'owner may delete an eligible draft');
select extensions.is((select count(*)::integer from public.assignments where id = '73000000-0000-4000-8000-000000000001'), 0, 'draft is removed');
select extensions.is((select count(*)::integer from public.assignment_items where assignment_id = '73000000-0000-4000-8000-000000000001'), 0, 'draft deletion removes its practice blocks');
select extensions.lives_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000004')$$, 'owner may delete an archived assignment without results');
select extensions.throws_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'repeated delete of an unavailable assignment fails closed');

-- Known UUIDs never authorize foreign workspace staff or students.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.throws_ok($$select public.duplicate_assignment('73000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'foreign workspace teacher cannot duplicate a known assignment UUID');
select extensions.throws_ok($$select public.get_assignment_delete_status('73000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'foreign workspace teacher cannot inspect deletion eligibility by known UUID');
select extensions.throws_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'foreign workspace teacher cannot delete a known assignment UUID');

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$select public.duplicate_assignment('73000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'enrolled student cannot duplicate a known assignment UUID');
select extensions.throws_ok($$select public.get_assignment_delete_status('73000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'student cannot inspect teacher deletion eligibility');
select extensions.throws_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000003')$$, '42501', 'not_authorized', 'student cannot delete a known assignment UUID');

set local role anon;
select extensions.throws_ok($$select public.duplicate_assignment('73000000-0000-4000-8000-000000000003')$$, '42501', 'permission denied for function duplicate_assignment', 'anonymous user cannot duplicate');
select extensions.throws_ok($$select public.get_assignment_delete_status('73000000-0000-4000-8000-000000000003')$$, '42501', 'permission denied for function get_assignment_delete_status', 'anonymous user cannot inspect lifecycle state');
select extensions.throws_ok($$select public.delete_assignment('73000000-0000-4000-8000-000000000003')$$, '42501', 'permission denied for function delete_assignment', 'anonymous user cannot delete');

select * from extensions.finish();
rollback;
