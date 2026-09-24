begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('11000000-0000-4000-8000-000000000001', 'assignment-owner-a@classroom.test'),
  ('11000000-0000-4000-8000-000000000002', 'assignment-educator-a@classroom.test'),
  ('11000000-0000-4000-8000-000000000003', 'assignment-student-a@classroom.test'),
  ('11000000-0000-4000-8000-000000000004', 'assignment-student-a2@classroom.test'),
  ('11000000-0000-4000-8000-000000000005', 'assignment-owner-b@classroom.test'),
  ('11000000-0000-4000-8000-000000000006', 'assignment-student-b@classroom.test'),
  ('11000000-0000-4000-8000-000000000007', 'assignment-outsider@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('51000000-0000-4000-8000-000000000001', 'organization', 'Assignment workspace A', '11000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000002', 'organization', 'Assignment workspace B', '11000000-0000-4000-8000-000000000005');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner'),
  ('51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'educator'),
  ('51000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000005', 'owner');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.classes (id, workspace_id, created_by, name, join_code, status) values
  ('61000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Assignment Class A', '23456789AB', 'active'),
  ('61000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Unenrolled Class A', '23456789AC', 'active'),
  ('61000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000005', 'Assignment Class B', '23456789AD', 'active'),
  ('61000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Archived Class A', '23456789AE', 'archived');
insert into public.class_enrollments (class_id, student_user_id) values
  ('61000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003'),
  ('61000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000004'),
  ('61000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000006'),
  ('61000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000003');

insert into public.assignments (id, class_id, created_by, title, status, published_at) values
  ('71000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'A published', 'published', '2026-09-01T12:00:00Z'),
  ('71000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'A draft', 'draft', null),
  ('71000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'A archived', 'archived', '2026-09-02T12:00:00Z'),
  ('71000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'Other class published', 'published', '2026-09-03T12:00:00Z'),
  ('71000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000005', 'B published', 'published', '2026-09-04T12:00:00Z'),
  ('71000000-0000-4000-8000-000000000006', '61000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000001', 'Archived class published', 'published', '2026-09-05T12:00:00Z');
insert into public.assignment_items (id, assignment_id, position, activity_key, problem_count) values
  ('81000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 0, 'integration.basic_trig.v1', 5),
  ('81000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003', 0, 'integration.by_parts.v1', 2),
  ('81000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000004', 0, 'integration.u_substitution.v1', 3),
  ('81000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000005', 0, 'integration.inverse_trig.v1', 4),
  ('81000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000006', 0, 'integration.partial_fractions.v1', 4);
-- The insert trigger intentionally forces every insert to a draft; fixture
-- lifecycle state is established after items exist to honor the freeze trigger.
update public.assignments set status = 'published', published_at = '2026-09-01T12:00:00Z'
where id = '71000000-0000-4000-8000-000000000001';
update public.assignments set status = 'archived', published_at = '2026-09-02T12:00:00Z'
where id = '71000000-0000-4000-8000-000000000003';
update public.assignments set status = 'published', published_at = '2026-09-03T12:00:00Z'
where id = '71000000-0000-4000-8000-000000000004';
update public.assignments set status = 'published', published_at = '2026-09-04T12:00:00Z'
where id = '71000000-0000-4000-8000-000000000005';
update public.assignments set status = 'published', published_at = '2026-09-05T12:00:00Z'
where id = '71000000-0000-4000-8000-000000000006';

select extensions.ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.assignments'::regclass), 'assignments has RLS enabled');
select extensions.ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.assignment_items'::regclass), 'assignment_items has RLS enabled');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignments'::regclass and conname = 'assignments_class_id_fkey'), 'assignments reference classes');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.assignment_items'::regclass and conname = 'assignment_items_assignment_position_key' and condeferrable), 'assignment item ordering has a deferrable unique constraint');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'assignments_class_status_updated_idx'), 'class/status assignment lookup index exists');
select extensions.ok(not has_table_privilege('anon', 'public.assignments', 'select') and not has_table_privilege('anon', 'public.assignment_items', 'select'), 'anon cannot read assignment data');
select extensions.ok(not has_table_privilege('anon', 'public.assignments', 'insert') and not has_table_privilege('anon', 'public.assignment_items', 'insert') and not has_table_privilege('anon', 'public.assignment_items', 'delete'), 'anon cannot mutate assignment data');
select extensions.ok(not has_table_privilege('authenticated', 'public.assignments', 'delete'), 'authenticated has no direct assignment delete privilege');
select extensions.ok(not has_column_privilege('authenticated', 'public.assignments', 'status', 'update') and not has_column_privilege('authenticated', 'public.assignments', 'published_at', 'update') and not has_column_privilege('authenticated', 'public.assignments', 'class_id', 'update') and has_column_privilege('authenticated', 'public.assignments', 'title', 'update') and has_column_privilege('authenticated', 'public.assignments', 'due_at', 'update'), 'assignment updates are limited to title and due date');
select extensions.ok(not has_column_privilege('authenticated', 'public.assignment_items', 'id', 'update') and not has_column_privilege('authenticated', 'public.assignment_items', 'assignment_id', 'update') and has_column_privilege('authenticated', 'public.assignment_items', 'activity_key', 'update'), 'item update grants exclude identity and tenant scope');
select extensions.ok(not has_column_privilege('authenticated', 'public.assignment_items', 'position', 'update'), 'ordinary item updates cannot bypass the atomic reorder operation');
select extensions.ok(has_function_privilege('authenticated', 'public.publish_assignment(uuid)', 'execute') and not has_function_privilege('anon', 'public.publish_assignment(uuid)', 'execute') and not has_function_privilege('public', 'public.publish_assignment(uuid)', 'execute'), 'publish operation is authenticated-only');
select extensions.ok(has_function_privilege('authenticated', 'public.reorder_assignment_items(uuid,uuid[])', 'execute') and not has_function_privilege('anon', 'public.reorder_assignment_items(uuid,uuid[])', 'execute'), 'reorder is authenticated-only');
select extensions.ok(
  (select count(*)::integer = 10
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname in ('public', 'classroom_private')
     and p.prosecdef
     and p.proname in ('guard_assignment_item_content', 'can_create_assignment_for_class', 'can_manage_assignment', 'can_read_assignment', 'can_edit_assignment_items', 'publish_assignment', 'archive_assignment', 'reactivate_assignment', 'discard_assignment', 'reorder_assignment_items')
     and p.proconfig @> array['search_path=""']::text[]),
  'all ten new SECURITY DEFINER helpers and RPCs pin an empty search_path'
);
select extensions.ok(
  (select count(*)::integer = 7 from pg_catalog.pg_policy as pol
  where pol.polrelid in ('public.assignments'::regclass, 'public.assignment_items'::regclass)),
  'assignment tables have seven explicit operation-specific RLS policies'
);
select extensions.throws_ok(
  $$insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000001', E' \t ')$$,
  '23514', 'new row for relation "assignments" violates check constraint "assignments_title_check"',
  'assignment title rejects whitespace-only values'
);
select extensions.throws_ok(
  $$insert into public.assignment_items (assignment_id, position, activity_key, problem_count) values ('71000000-0000-4000-8000-000000000002', 0, 'integration.unknown.v1', 2)$$,
  '23514', 'new row for relation "assignment_items" violates check constraint "assignment_items_activity_key_check"',
  'database accepts only the six versioned activity keys'
);
select extensions.throws_ok(
  $$insert into public.assignment_items (assignment_id, position, activity_key, problem_count) values ('71000000-0000-4000-8000-000000000002', 0, 'integration.basic_trig.v1', 21)$$,
  '23514', 'new row for relation "assignment_items" violates check constraint "assignment_items_problem_count_check"',
  'problem count cannot exceed twenty'
);
select extensions.throws_ok(
  $$insert into public.assignment_items (assignment_id, position, activity_key, problem_count) values ('71000000-0000-4000-8000-000000000002', -1, 'integration.basic_trig.v1', 2)$$,
  '23514', 'new row for relation "assignment_items" violates check constraint "assignment_items_position_check"',
  'practice block positions cannot be negative'
);
select extensions.throws_ok(
  $$insert into public.assignment_items (assignment_id, position, activity_contract_version, activity_key, problem_count) values ('71000000-0000-4000-8000-000000000002', 1, 2, 'integration.basic_trig.v1', 2)$$,
  '23514', 'new row for relation "assignment_items" violates check constraint "assignment_items_version_check"',
  'unsupported assignment activity contract versions are rejected'
);
select extensions.ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('assignments', 'assignment_items')
      and column_name in ('problem_text', 'generated_problem', 'answer', 'solution', 'hint', 'seed')
  ),
  'Classroom assignment records store intent rather than generated mathematics'
);

-- Staff can create drafts only in active classes of their active workspace.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((select auth.uid()::text), '11000000-0000-4000-8000-000000000001', 'authenticated assignment request has expected user identity');
select extensions.ok(classroom_private.is_class_staff('61000000-0000-4000-8000-000000000001'), 'phase one staff predicate recognizes workspace owner');
select extensions.ok(classroom_private.can_create_assignment_for_class('61000000-0000-4000-8000-000000000001'), 'owner membership authorizes draft creation for active class');
insert into public.assignments (class_id, title, due_at)
values ('61000000-0000-4000-8000-000000000001', 'Draft created by owner', '2026-10-01T12:00:00Z')
;
select set_config('test.draft', (select id::text from public.assignments where title = 'Draft created by owner' order by created_at desc limit 1), true);
select extensions.is((select status from public.assignments where id = current_setting('test.draft')::uuid), 'draft', 'created assignments are always drafts');
select extensions.is((select count(*)::integer from public.assignments where id = current_setting('test.draft')::uuid and published_at is null), 1, 'created assignments always have a null published_at');
reset role;
select extensions.is((select created_by::text from public.assignments where id = current_setting('test.draft')::uuid), '11000000-0000-4000-8000-000000000001', 'database derives assignment creator from auth.uid()');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000001', 'Educator draft') returning id;
select extensions.ok((select count(*)::integer = 1 from public.assignments where title = 'Educator draft' and status = 'draft'), 'educator can create a draft in their workspace class');
select extensions.throws_ok(
  $$insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000003', 'Foreign draft')$$,
  '42501', 'new row violates row-level security policy for table "assignments"',
  'cross-tenant staff cannot create an assignment in workspace B'
);
select extensions.throws_ok(
  $$insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000004', 'Archived class draft')$$,
  '42501', 'new row violates row-level security policy for table "assignments"',
  'staff cannot create a draft in an archived class'
);
select extensions.throws_ok(
  $$insert into public.assignments (class_id, title, created_by) values ('61000000-0000-4000-8000-000000000001', 'Spoof creator', '11000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for table assignments',
  'browser cannot supply created_by'
);
select extensions.throws_ok(
  $$insert into public.assignments (class_id, title, status) values ('61000000-0000-4000-8000-000000000001', 'Spoof state', 'published')$$,
  '42501', 'permission denied for table assignments',
  'browser cannot supply published status'
);

-- Students see published work in active enrolled classes only.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is((select auth.uid()::text), '11000000-0000-4000-8000-000000000003', 'student assignment request has expected user identity');
select extensions.ok(classroom_private.can_read_assignment('61000000-0000-4000-8000-000000000001', 'published'), 'student policy helper recognizes active enrolled class for published assignment');
select extensions.is((select count(*)::integer from public.assignments where class_id = '61000000-0000-4000-8000-000000000001'), 1, 'student sees only published assignments in enrolled active class');
select extensions.is((select count(*)::integer from public.assignments where id in ('71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003')), 0, 'student cannot see draft or archived assignments');
select extensions.is((select count(*)::integer from public.assignments where id in ('71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000005')), 0, 'student cannot see another class or tenant assignments by known UUID');
select extensions.is((select count(*)::integer from public.assignments where id = '71000000-0000-4000-8000-000000000006'), 0, 'student cannot see published work in an archived class');
select extensions.is((select count(*)::integer from public.assignment_items where assignment_id = '71000000-0000-4000-8000-000000000001'), 1, 'student sees practice blocks only for published assignments');
select extensions.is((select count(*)::integer from public.assignment_items where assignment_id in ('71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003')), 0, 'student cannot enumerate draft or archived practice blocks');
select extensions.is((select count(*)::integer from public.workspace_members where user_id = (select auth.uid())), 0, 'student remains an enrollee and not workspace staff');
reset role;

-- Draft content can be authored, edited, removed, and reordered by staff.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok($$select * from public.publish_assignment('71000000-0000-4000-8000-000000000002')$$, 'P0001', 'assignment_requires_items', 'empty draft cannot be published');
insert into public.assignment_items (assignment_id, position, activity_key, problem_count)
values ('71000000-0000-4000-8000-000000000002', 4, 'integration.u_substitution.v1', 5)
returning id;
select set_config('test.item_one', (select id::text from public.assignment_items where assignment_id = '71000000-0000-4000-8000-000000000002'), true);
insert into public.assignment_items (assignment_id, position, activity_key, problem_count)
values ('71000000-0000-4000-8000-000000000002', 9, 'integration.by_parts.v1', 2)
returning id;
select set_config('test.item_two', (select id::text from public.assignment_items where assignment_id = '71000000-0000-4000-8000-000000000002' and activity_key = 'integration.by_parts.v1'), true);
select public.reorder_assignment_items('71000000-0000-4000-8000-000000000002', array[current_setting('test.item_two')::uuid, current_setting('test.item_one')::uuid]);
select extensions.is((select position from public.assignment_items where id = current_setting('test.item_two')::uuid), 0, 'atomic reorder moves items and normalizes positions');
select extensions.is((select position from public.assignment_items where id = current_setting('test.item_one')::uuid), 1, 'atomic reorder assigns contiguous position to second item');
update public.assignment_items set problem_count = 7, activity_key = 'integration.log_u_substitution.v1'
where id = current_setting('test.item_one')::uuid;
select extensions.is((select problem_count::integer from public.assignment_items where id = current_setting('test.item_one')::uuid), 7, 'draft problem count and activity are editable');
insert into public.assignment_items (assignment_id, position, activity_key, problem_count)
values ('71000000-0000-4000-8000-000000000002', 12, 'integration.inverse_trig.v1', 1);
delete from public.assignment_items where assignment_id = '71000000-0000-4000-8000-000000000002' and activity_key = 'integration.inverse_trig.v1';
select extensions.is((select count(*)::integer from public.assignment_items where assignment_id = '71000000-0000-4000-8000-000000000002' and activity_key = 'integration.inverse_trig.v1'), 0, 'staff may remove a practice block while its assignment is a draft');
select extensions.throws_ok($$select public.reorder_assignment_items('71000000-0000-4000-8000-000000000002', array[current_setting('test.item_one')::uuid, current_setting('test.item_one')::uuid])$$, 'P0001', 'invalid_assignment_item_order', 'reorder rejects duplicate item IDs');
select extensions.throws_ok($$select public.reorder_assignment_items('71000000-0000-4000-8000-000000000002', array[current_setting('test.item_one')::uuid])$$, 'P0001', 'invalid_assignment_item_order', 'reorder rejects a missing item ID');
select extensions.throws_ok($$select public.reorder_assignment_items('71000000-0000-4000-8000-000000000002', array[current_setting('test.item_one')::uuid, current_setting('test.item_two')::uuid, '81000000-0000-4000-8000-000000000001'::uuid])$$, 'P0001', 'invalid_assignment_item_order', 'reorder rejects an extra item from another assignment');
select extensions.throws_ok($$select public.reorder_assignment_items('71000000-0000-4000-8000-000000000002', array['81000000-0000-4000-8000-000000000004'::uuid, current_setting('test.item_two')::uuid])$$, 'P0001', 'invalid_assignment_item_order', 'reorder rejects a foreign-tenant item UUID');
select extensions.throws_ok($$select public.reorder_assignment_items('71000000-0000-4000-8000-000000000005', array[current_setting('test.item_one')::uuid])$$, '42501', 'not_authorized', 'foreign workspace assignment UUID cannot be reordered');

select * from public.publish_assignment('71000000-0000-4000-8000-000000000002');
select extensions.is((select status from public.assignments where id = '71000000-0000-4000-8000-000000000002'), 'published', 'valid draft transitions to published');
select set_config('test.original_published_at', (select published_at::text from public.assignments where id = '71000000-0000-4000-8000-000000000002'), true);
select extensions.ok(current_setting('test.original_published_at') <> '', 'publication sets published_at');
select extensions.throws_ok($$insert into public.assignment_items (assignment_id, position, activity_key, problem_count) values ('71000000-0000-4000-8000-000000000002', 2, 'integration.inverse_trig.v1', 1)$$, '42501', 'published_content_immutable', 'published assignment rejects new practice content');
delete from public.assignment_items where id = current_setting('test.item_one')::uuid;
select extensions.is((select count(*)::integer from public.assignment_items where id = current_setting('test.item_one')::uuid), 1, 'published assignment practice block cannot be deleted');
update public.assignment_items set activity_key = 'integration.partial_fractions.v1' where id = current_setting('test.item_one')::uuid;
select extensions.is((select activity_key from public.assignment_items where id = current_setting('test.item_one')::uuid), 'integration.log_u_substitution.v1', 'published assignment activity content cannot be changed');
select public.archive_assignment('71000000-0000-4000-8000-000000000002');
select extensions.is((select status from public.assignments where id = '71000000-0000-4000-8000-000000000002'), 'archived', 'published assignment can be archived');
select extensions.is((select published_at::text from public.assignments where id = '71000000-0000-4000-8000-000000000002'), current_setting('test.original_published_at'), 'archiving preserves original published_at');
select extensions.throws_ok($$select * from public.archive_assignment('71000000-0000-4000-8000-000000000002')$$, 'P0001', 'invalid_assignment_transition', 'an archived assignment cannot be archived twice');
select public.reactivate_assignment('71000000-0000-4000-8000-000000000002');
select extensions.is((select status from public.assignments where id = '71000000-0000-4000-8000-000000000002'), 'published', 'archived assignment can be reactivated');
select extensions.is((select published_at::text from public.assignments where id = '71000000-0000-4000-8000-000000000002'), current_setting('test.original_published_at'), 'reactivation preserves original published_at');
select extensions.throws_ok($$select * from public.publish_assignment('71000000-0000-4000-8000-000000000002')$$, 'P0001', 'invalid_assignment_transition', 'reactivated assignment cannot be republished as a draft');
select extensions.throws_ok($$select public.discard_assignment('71000000-0000-4000-8000-000000000002')$$, 'P0001', 'only_drafts_can_be_discarded', 'published assignment cannot be discarded');
select extensions.throws_ok($$select public.discard_assignment('71000000-0000-4000-8000-000000000003')$$, 'P0001', 'only_drafts_can_be_discarded', 'archived assignment cannot be discarded');
select extensions.throws_ok($$insert into public.assignment_items (assignment_id, position, activity_key, problem_count) values ('71000000-0000-4000-8000-000000000003', 1, 'integration.inverse_trig.v1', 1)$$, '42501', 'published_content_immutable', 'archived assignment also rejects new practice blocks');
delete from public.assignment_items where id = '81000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.assignment_items where id = '81000000-0000-4000-8000-000000000002'), 1, 'archived assignment practice blocks cannot be deleted');

insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000001', 'Disposable draft');
select set_config('test.disposable_assignment', (select id::text from public.assignments where title = 'Disposable draft'), true);
insert into public.assignment_items (assignment_id, position, activity_key, problem_count)
values (current_setting('test.disposable_assignment')::uuid, 0, 'integration.partial_fractions.v1', 2);
select public.discard_assignment(current_setting('test.disposable_assignment')::uuid);
select extensions.is((select count(*)::integer from public.assignments where id = current_setting('test.disposable_assignment')::uuid), 0, 'authorized staff can discard a draft');
select extensions.is((select count(*)::integer from public.assignment_items where assignment_id = current_setting('test.disposable_assignment')::uuid), 0, 'discarding a draft cascades its practice blocks');

-- Direct assignment content mutations and lifecycle calls are tenant-scoped.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select extensions.throws_ok($$select * from public.archive_assignment('71000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'foreign staff cannot archive a known assignment UUID');
select extensions.is((select count(*)::integer from public.assignments where id = '71000000-0000-4000-8000-000000000001'), 0, 'foreign staff cannot read assignment by UUID');
reset role;

-- An outsider, an enrolled student, and anon cannot create or lifecycle-mutate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok($$insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000001', 'Student assignment')$$, '42501', 'new row violates row-level security policy for table "assignments"', 'enrolled student cannot create teacher assignment');
select extensions.throws_ok($$select * from public.archive_assignment('71000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'student cannot change assignment lifecycle');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select extensions.throws_ok($$insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000001', 'Outsider assignment')$$, '42501', 'new row violates row-level security policy for table "assignments"', 'outsider cannot create assignment with a known class UUID');
select extensions.throws_ok($$select public.reorder_assignment_items('71000000-0000-4000-8000-000000000001', array['81000000-0000-4000-8000-000000000001'::uuid])$$, '42501', 'not_authorized', 'outsider cannot reorder by known assignment and item UUIDs');
reset role;

set local role anon;
select extensions.throws_ok($$select * from public.assignments$$, '42501', 'permission denied for table assignments', 'anon cannot read assignments');
select extensions.throws_ok($$select * from public.assignment_items$$, '42501', 'permission denied for table assignment_items', 'anon cannot read assignment items');
select extensions.throws_ok($$insert into public.assignments (class_id, title) values ('61000000-0000-4000-8000-000000000001', 'Anon draft')$$, '42501', 'permission denied for table assignments', 'anon cannot create assignments');
select extensions.throws_ok($$select * from public.publish_assignment('71000000-0000-4000-8000-000000000002')$$, '42501', 'permission denied for function publish_assignment', 'anon cannot publish assignments');
select extensions.throws_ok($$select public.discard_assignment('71000000-0000-4000-8000-000000000002')$$, '42501', 'permission denied for function discard_assignment', 'anon cannot discard assignments');

reset role;
select * from extensions.finish();
rollback;
