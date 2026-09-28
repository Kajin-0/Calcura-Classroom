begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'slot-pro@classroom.test'),
  ('a1000000-0000-4000-8000-000000000002', 'slot-free@classroom.test'),
  ('a1000000-0000-4000-8000-000000000003', 'slot-foreign@classroom.test'),
  ('a1000000-0000-4000-8000-000000000004', 'slot-student@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('a2000000-0000-4000-8000-000000000001', 'organization', 'Slot Pro workspace', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'organization', 'Slot Free workspace', 'a1000000-0000-4000-8000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'owner');
insert into public.workspace_entitlements (
  workspace_id, plan, status, source, effective_at
) values
  ('a2000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual', pg_catalog.now() - interval '1 day');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.classes (id, workspace_id, name, join_code) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Slot Pro class', '23456789AC');
insert into public.class_enrollments (class_id, student_user_id) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004');
insert into public.assignments (id, class_id, title) values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Slot draft'),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'Slot published');
insert into public.assignment_items (id, assignment_id, position, activity_key, problem_count) values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 0, 'integration.u_substitution.v1', 5),
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 1, 'integration.by_parts.v1', 2),
  ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000002', 0, 'integration.basic_trig.v1', 2);
select set_config('test.slot_item_seed', (
  select generation_seed::text from public.assignment_items
  where id = 'a5000000-0000-4000-8000-000000000001'
), true);

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.assignment_problem_slots'::regclass),
  'problem slot table has RLS enabled'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.assignment_problem_slots', 'select')
    and not has_table_privilege('authenticated', 'public.assignment_problem_slots', 'insert')
    and not has_table_privilege('authenticated', 'public.assignment_problem_slots', 'update')
    and not has_table_privilege('authenticated', 'public.assignment_problem_slots', 'delete'),
  'authenticated clients have read-only problem slot table access'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.assignment_problem_slots', 'select')
    and not has_table_privilege('anon', 'public.assignment_problem_slots', 'insert'),
  'anonymous clients have no problem slot table access'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.prepare_assignment_problem_slots(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.prepare_assignment_problem_slots(uuid)', 'execute')
    and (select prosecdef and proconfig @> array['search_path=""']::text[]
      from pg_catalog.pg_proc
      where oid = 'public.prepare_assignment_problem_slots(uuid)'::regprocedure),
  'slot preparation is authenticated-only SECURITY DEFINER with pinned search_path'
);
select extensions.is(
  (select capabilities from public.get_workspace_entitlement('a2000000-0000-4000-8000-000000000001'))
    @> array['advanced_assignment_editing']::text[],
  true,
  'Pro inherits advanced assignment editing'
);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is(
  (select capabilities from public.get_workspace_entitlement('a2000000-0000-4000-8000-000000000002'))
    @> array['advanced_assignment_editing']::text[],
  false,
  'Teacher Free does not inherit advanced assignment editing'
);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000001');
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001'),
  5,
  'materialization creates exactly problem_count slots'
);
select extensions.is(
  (select pg_catalog.array_agg(source_ordinal order by position)::smallint[]
    from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001'),
  array[1,2,3,4,5]::smallint[],
  'slots start in display order with stable one-based source ordinals'
);
select extensions.is(
  (select pg_catalog.count(*)::integer from public.assignment_problem_slots
    where assignment_item_id in (
      'a5000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000002'
    )),
  7,
  'all draft blocks materialize in one call'
);
select extensions.is(
  (select generation_seed::text from public.assignment_items
    where id = 'a5000000-0000-4000-8000-000000000001'),
  current_setting('test.slot_item_seed'),
  'materialization does not alter a Phase-8.6 item generation seed'
);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001'
      and regeneration_seed is null and not locked),
  5,
  'materialized slots retain exact base generation and are unlocked'
);
select public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000001');
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001'),
  5,
  'preparation is idempotent'
);

select set_config('test.slot_one', (
  select id::text from public.assignment_problem_slots
  where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 0
), true);
select set_config('test.slot_two', (
  select id::text from public.assignment_problem_slots
  where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 1
), true);
select set_config('test.foreign_slot', (
  select id::text from public.assignment_problem_slots
  where assignment_item_id = 'a5000000-0000-4000-8000-000000000002' and position = 0
), true);

select public.set_assignment_problem_slot_locked(current_setting('test.slot_one')::uuid, true);
select extensions.throws_ok(
  format('select * from public.set_assignment_problem_slot_locked(%L::uuid, null)', current_setting('test.slot_one')),
  'P0001', 'invalid_assignment_problem_slot_lock',
  'lock mutation rejects a null lock value'
);
select extensions.throws_ok(
  format('select * from public.regenerate_assignment_problem_slot(%L::uuid)', current_setting('test.slot_one')),
  'P0001', 'assignment_problem_slot_locked',
  'locked problem cannot be regenerated'
);
select public.regenerate_unlocked_assignment_problem_slots('a5000000-0000-4000-8000-000000000001');
select extensions.ok(
  (select regeneration_seed is null and locked
    from public.assignment_problem_slots where id = current_setting('test.slot_one')::uuid),
  'bulk regeneration skips locked slots'
);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001'
      and regeneration_seed is not null and not locked),
  4,
  'bulk regeneration changes only unlocked slots'
);
select set_config('test.previous_slot_seed', (
  select regeneration_seed::text from public.assignment_problem_slots
  where id = current_setting('test.slot_two')::uuid
), true);
select public.regenerate_assignment_problem_slot(current_setting('test.slot_two')::uuid);
select extensions.ok(
  (select regeneration_seed::text <> current_setting('test.previous_slot_seed')
    from public.assignment_problem_slots where id = current_setting('test.slot_two')::uuid),
  'single-slot regeneration assigns a fresh server-generated identity'
);
select public.set_assignment_problem_slot_locked(current_setting('test.slot_one')::uuid, false);

select public.reorder_assignment_problem_slots(
  'a5000000-0000-4000-8000-000000000001',
  array[
    (select id from public.assignment_problem_slots where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 4),
    (select id from public.assignment_problem_slots where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 3),
    (select id from public.assignment_problem_slots where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 2),
    (select id from public.assignment_problem_slots where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 1),
    (select id from public.assignment_problem_slots where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 0)
  ]
);
select extensions.is(
  (select source_ordinal::integer from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001' and position = 0),
  5,
  'reorder changes display position without changing source identity'
);
select extensions.throws_ok(
  format('select * from public.reorder_assignment_problem_slots(%L::uuid, array[%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid])',
    'a5000000-0000-4000-8000-000000000001',
    current_setting('test.slot_one'), current_setting('test.slot_one'),
    current_setting('test.slot_two'), current_setting('test.foreign_slot'),
    'a5000000-0000-4000-8000-000000000000'),
  'P0001', 'invalid_assignment_problem_slot_order',
  'reorder rejects duplicate and foreign or injected slot IDs'
);
select extensions.throws_ok(
  $$select * from public.reorder_assignment_problem_slots('a5000000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  'P0001', 'invalid_assignment_problem_slot_order',
  'reorder rejects omitted slots'
);

select public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000002');
select * from public.publish_assignment('a4000000-0000-4000-8000-000000000002');
select extensions.throws_ok(
  $$select * from public.regenerate_unlocked_assignment_problem_slots('a5000000-0000-4000-8000-000000000003')$$,
  'P0001', 'published_content_immutable',
  'published assignment rejects slot regeneration'
);
select public.archive_assignment('a4000000-0000-4000-8000-000000000002');
select extensions.throws_ok(
  $$select * from public.set_assignment_problem_slot_locked((select id from public.assignment_problem_slots where assignment_item_id='a5000000-0000-4000-8000-000000000003' limit 1), true)$$,
  'P0001', 'published_content_immutable',
  'archived assignment rejects slot mutation'
);

select set_config('test.duplicate_id', (
  select public.duplicate_assignment('a4000000-0000-4000-8000-000000000001')::text
), true);
select extensions.is(
  (select count(*)::integer from public.assignment_items
    where assignment_id = current_setting('test.duplicate_id')::uuid),
  2,
  'duplicate preserves block structure'
);
select extensions.ok(
  (select count(*) = 2 from public.assignment_items as source_item
    join public.assignment_items as copy_item
      on copy_item.assignment_id = current_setting('test.duplicate_id')::uuid
      and copy_item.position = source_item.position
    where source_item.assignment_id = 'a4000000-0000-4000-8000-000000000001'
      and copy_item.id <> source_item.id
      and copy_item.generation_seed <> source_item.generation_seed),
  'duplicate items receive fresh identities and fresh generation seeds'
);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots as copied_slot
    join public.assignment_items as copied_item on copied_item.id = copied_slot.assignment_item_id
    where copied_item.assignment_id = current_setting('test.duplicate_id')::uuid),
  7,
  'duplicate preserves customized slot order structure'
);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots as copied_slot
    join public.assignment_items as copied_item on copied_item.id = copied_slot.assignment_item_id
    where copied_item.assignment_id = current_setting('test.duplicate_id')::uuid
      and copied_slot.regeneration_seed is null),
  7,
  'duplicate does not carry regenerated problem identity'
);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots as copied_slot
    join public.assignment_items as copied_item on copied_item.id = copied_slot.assignment_item_id
    where copied_item.assignment_id = current_setting('test.duplicate_id')::uuid
      and copied_slot.id not in (select id from public.assignment_problem_slots
        where assignment_item_id in (
          'a5000000-0000-4000-8000-000000000001',
          'a5000000-0000-4000-8000-000000000002'
        ))),
  7,
  'duplicate receives fresh slot IDs while retaining structural order'
);
select extensions.is(
  (select status from public.assignments where id = current_setting('test.duplicate_id')::uuid),
  'draft',
  'duplicate is a fresh draft'
);

select extensions.throws_ok(
  $$insert into public.assignment_problem_slots (assignment_item_id, position, source_ordinal) values ('a5000000-0000-4000-8000-000000000001', 7, 7)$$,
  '42501', 'permission denied for table assignment_problem_slots',
  'authenticated client cannot insert slots directly'
);
select extensions.throws_ok(
  $$update public.assignment_problem_slots set locked = true where id = current_setting('test.slot_one')::uuid$$,
  '42501', 'permission denied for table assignment_problem_slots',
  'authenticated client cannot update slots directly'
);
reset role;

-- Basic Teacher Free editing remains available and safely clears the overlay.
delete from public.workspace_entitlements where workspace_id = 'a2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select * from public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000001')$$,
  '42501', 'capability_required',
  'Teacher Free cannot prepare or mutate advanced slots'
);
select extensions.throws_ok(
  format('select * from public.regenerate_assignment_problem_slot(%L::uuid)', current_setting('test.slot_two')),
  '42501', 'capability_required',
  'Teacher Free cannot regenerate a slot'
);
select extensions.throws_ok(
  format('select * from public.set_assignment_problem_slot_locked(%L::uuid, true)', current_setting('test.slot_two')),
  '42501', 'capability_required',
  'Teacher Free cannot change slot lock state'
);
select extensions.throws_ok(
  $$select * from public.regenerate_unlocked_assignment_problem_slots('a5000000-0000-4000-8000-000000000001')$$,
  '42501', 'capability_required',
  'Teacher Free cannot bulk-regenerate slots'
);
select extensions.throws_ok(
  $$select * from public.reorder_assignment_problem_slots('a5000000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  '42501', 'capability_required',
  'Teacher Free cannot reorder slots'
);
update public.assignment_items set problem_count = 4
where id = 'a5000000-0000-4000-8000-000000000001';
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots
    where assignment_item_id = 'a5000000-0000-4000-8000-000000000001'),
  0,
  'basic Teacher Free block edits reset the optional overlay'
);
reset role;

-- Workspace B is Free and foreign. The known assignment UUID is not enough.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.classes (id, workspace_id, name, join_code) values
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Slot Free class', '23456789AD');
insert into public.assignments (id, class_id, title) values
  ('a4000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000002', 'Slot Free assignment');
insert into public.assignment_items (id, assignment_id, position, activity_key, problem_count) values
  ('a5000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000003', 0, 'integration.u_substitution.v1', 2);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000001')$$,
  '42501', 'not_authorized',
  'foreign workspace teacher cannot use a known assignment UUID'
);
select extensions.throws_ok(
  $$select * from public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000003')$$,
  '42501', 'capability_required',
  'Teacher Free cannot prepare slots in their own assignment'
);
reset role;

-- Enrolled students may read published slot intent but cannot mutate it or see
-- draft/problem-editor state. Students remain outside workspace membership.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.workspace_entitlements (workspace_id, plan, status, source, effective_at)
values ('a2000000-0000-4000-8000-000000000001', 'pro', 'active', 'manual', pg_catalog.now() - interval '1 day');
select * from public.reactivate_assignment('a4000000-0000-4000-8000-000000000002');
select * from public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000001');
select * from public.publish_assignment('a4000000-0000-4000-8000-000000000001');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots as slots
    join public.assignment_items as ai on ai.id = slots.assignment_item_id
    where ai.assignment_id = 'a4000000-0000-4000-8000-000000000001'),
  6,
  'enrolled student can read only slot intent for the published assignment'
);
select extensions.is(
  (select count(*)::integer from public.assignment_problem_slots as slots
    join public.assignment_items as ai on ai.id = slots.assignment_item_id
    where ai.assignment_id = 'a4000000-0000-4000-8000-000000000003'),
  0,
  'student RLS does not expose another class assignment'
);
select extensions.throws_ok(
  $$select * from public.regenerate_assignment_problem_slot((select id from public.assignment_problem_slots limit 1))$$,
  '42501', 'not_authorized',
  'student cannot regenerate a known problem slot'
);
reset role;

set local role anon;
select extensions.throws_ok(
  $$select * from public.prepare_assignment_problem_slots('a4000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function prepare_assignment_problem_slots',
  'anonymous caller cannot execute problem slot mutation RPCs'
);
select extensions.finish();
rollback;
