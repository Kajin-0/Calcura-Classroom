begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner-a@classroom.test'),
  ('10000000-0000-4000-8000-000000000002', 'educator-a@classroom.test'),
  ('10000000-0000-4000-8000-000000000003', 'student-a@classroom.test'),
  ('10000000-0000-4000-8000-000000000004', 'student-a2@classroom.test'),
  ('10000000-0000-4000-8000-000000000005', 'owner-b@classroom.test'),
  ('10000000-0000-4000-8000-000000000006', 'student-b@classroom.test'),
  ('10000000-0000-4000-8000-000000000007', 'outsider@classroom.test'),
  ('10000000-0000-4000-8000-000000000008', 'personal-delete@classroom.test'),
  ('10000000-0000-4000-8000-000000000009', 'organization-creator@classroom.test');

select extensions.throws_ok(
  $$insert into public.workspaces (workspace_type, name) values ('organization', E'\t\n')$$,
  '23514',
  'new row for relation "workspaces" violates check constraint "workspaces_name_check"',
  'workspace name rejects whitespace-only values'
);

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workspaces'::regclass),
  'workspaces has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workspace_members'::regclass),
  'workspace_members has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.classes'::regclass),
  'classes has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.class_enrollments'::regclass),
  'class_enrollments has RLS enabled'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.workspace_members'::regclass and contype = 'p'),
  'workspace_members has a composite primary key'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.class_enrollments'::regclass and contype = 'p'),
  'class_enrollments has a composite primary key'
);
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'workspace_members_user_workspace_idx'), 'workspace member user lookup index exists');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'workspace_members_workspace_role_idx'), 'workspace member role lookup index exists');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'classes_workspace_status_idx'), 'workspace class lookup index exists');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'class_enrollments_student_class_idx'), 'student enrollment lookup index exists');
select extensions.ok(exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'class_enrollments_class_status_idx'), 'class enrollment status index exists');

select extensions.ok(
  not has_table_privilege('anon', 'public.workspaces', 'select')
  and not has_table_privilege('anon', 'public.workspace_members', 'select')
  and not has_table_privilege('anon', 'public.classes', 'select')
  and not has_table_privilege('anon', 'public.class_enrollments', 'select'),
  'anon has no Classroom table read grants'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.workspaces', 'insert')
  and not has_table_privilege('anon', 'public.classes', 'insert')
  and not has_table_privilege('anon', 'public.class_enrollments', 'insert'),
  'anon has no Classroom insert grants'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.workspaces', 'insert')
  and not has_table_privilege('authenticated', 'public.workspace_members', 'insert')
  and not has_table_privilege('authenticated', 'public.class_enrollments', 'insert')
  and not has_table_privilege('authenticated', 'public.classes', 'delete')
  and not has_table_privilege('authenticated', 'public.workspaces', 'delete'),
  'authenticated has no workspace, membership, enrollment insertion or client delete'
);
select extensions.ok(
  has_column_privilege('authenticated', 'public.classes', 'name', 'update')
  and has_column_privilege('authenticated', 'public.classes', 'status', 'update')
  and not has_column_privilege('authenticated', 'public.classes', 'workspace_id', 'update')
  and not has_column_privilege('authenticated', 'public.classes', 'created_by', 'update')
  and not has_column_privilege('authenticated', 'public.classes', 'id', 'update')
  and not has_column_privilege('authenticated', 'public.classes', 'join_code', 'update'),
  'class updates are limited to name and status columns'
);
select extensions.ok(
  not has_column_privilege('authenticated', 'public.classes', 'join_code', 'select'),
  'join codes are not exposed through ordinary class reads'
);
select extensions.ok(
  not has_column_privilege('authenticated', 'public.classes', 'created_by', 'select'),
  'creator identity remains database provenance, not student-facing data'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.ensure_personal_workspace()', 'execute')
  and not has_function_privilege('anon', 'public.ensure_personal_workspace()', 'execute'),
  'personal workspace RPC is authenticated-only'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.join_class_by_code(text)', 'execute')
  and not has_function_privilege('anon', 'public.join_class_by_code(text)', 'execute'),
  'join RPC is authenticated-only'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.get_class_join_code(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_class_join_code(uuid)', 'execute'),
  'join-code lookup is authenticated-only'
);
select extensions.ok(
  has_function_privilege('authenticated', 'classroom_private.protect_and_generate_class_fields()', 'execute')
  and not has_function_privilege('anon', 'classroom_private.protect_and_generate_class_fields()', 'execute')
  and has_function_privilege('authenticated', 'classroom_private.set_updated_at()', 'execute')
  and not has_function_privilege('anon', 'classroom_private.set_updated_at()', 'execute'),
  'trigger functions have only the caller privileges needed to execute class inserts/updates'
);
select extensions.ok(
  has_function_privilege('authenticated', 'classroom_private.has_workspace_role(uuid,text[])', 'execute')
  and not has_function_privilege('anon', 'classroom_private.has_workspace_role(uuid,text[])', 'execute')
  and has_function_privilege('authenticated', 'classroom_private.is_class_staff(uuid)', 'execute')
  and not has_function_privilege('anon', 'classroom_private.is_class_staff(uuid)', 'execute')
  and has_function_privilege('authenticated', 'classroom_private.is_active_class_enrollee(uuid)', 'execute')
  and not has_function_privilege('anon', 'classroom_private.is_active_class_enrollee(uuid)', 'execute')
  and has_function_privilege('authenticated', 'classroom_private.generate_join_code()', 'execute')
  and not has_function_privilege('anon', 'classroom_private.generate_join_code()', 'execute'),
  'policy and join-code helpers are authenticated-only and return no tenant data'
);
select extensions.ok(
  (select count(*)::integer = 8
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname in ('public', 'classroom_private')
     and p.prosecdef
     and p.proname in (
       'has_workspace_role', 'is_class_staff', 'is_active_class_enrollee',
       'generate_join_code', 'protect_and_generate_class_fields',
       'ensure_personal_workspace', 'get_class_join_code', 'join_class_by_code'
     )
     and p.proconfig @> array['search_path=""']::text[]),
  'each SECURITY DEFINER function uses an empty fixed search_path'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.workspace_a', (select workspace_id::text from public.ensure_personal_workspace()), true);
select extensions.is(
  (select role from public.workspace_members where workspace_id = current_setting('test.workspace_a')::uuid and user_id = (select auth.uid())),
  'owner',
  'bootstrap atomically creates owner membership'
);
select set_config('test.workspace_a_again', (select workspace_id::text from public.ensure_personal_workspace()), true);
select extensions.is(
  current_setting('test.workspace_a_again'),
  current_setting('test.workspace_a'),
  'bootstrap is idempotent for an existing personal workspace'
);
select extensions.is(
  (select count(*)::integer from public.workspaces where personal_owner_user_id = (select auth.uid())),
  1,
  'bootstrap creates at most one personal workspace'
);
select extensions.ok(
  (select workspace_type = 'personal' and personal_owner_user_id = (select auth.uid())
   from public.workspaces where id = current_setting('test.workspace_a')::uuid),
  'personal workspace records its immutable owner'
);
reset role;
select extensions.throws_ok(
  $$insert into public.workspaces (workspace_type, name, created_by, personal_owner_user_id)
    values ('personal', 'Second workspace', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23505',
  'duplicate key value violates unique constraint "workspaces_personal_owner_user_id_key"',
  'database uniqueness prevents a second personal workspace'
);
select extensions.throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role)
    values (current_setting('test.workspace_a')::uuid, '10000000-0000-4000-8000-000000000003', 'student')$$,
  '23514',
  'new row for relation "workspace_members" violates check constraint "workspace_members_role_check"',
  'student is not a valid administrative workspace role'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.workspaces (workspace_type, name, created_by, personal_owner_user_id)
    values ('personal', 'Spoofed', (select auth.uid()), '10000000-0000-4000-8000-000000000005')$$,
  '42501',
  'permission denied for table workspaces',
  'browser cannot create a workspace for a different user'
);
select extensions.throws_ok(
  $$insert into public.workspaces (workspace_type, name) values ('organization', 'Arbitrary org')$$,
  '42501',
  'permission denied for table workspaces',
  'browser cannot create organization workspaces directly'
);

-- Set up the second tenant and staff roster as database-owned fixture state.
reset role;
insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.workspace_a')::uuid, '10000000-0000-4000-8000-000000000002', 'educator');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select set_config('test.workspace_b', (select workspace_id::text from public.ensure_personal_workspace()), true);

reset role;
insert into public.classes (id, workspace_id, created_by, name, join_code)
values (
  '20000000-0000-4000-8000-000000000001',
  current_setting('test.workspace_b')::uuid,
  '10000000-0000-4000-8000-000000000005',
  'Workspace B class',
  '2222222222'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.ok(
  (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_a')::uuid) = 1
  and (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_b')::uuid) = 0,
  'owner A can read workspace A but not workspace B'
);
select extensions.ok(
  (select count(*)::integer from public.classes where id = '20000000-0000-4000-8000-000000000001') = 0,
  'owner A cannot read workspace B class'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.ok(
  (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_a')::uuid) = 1
  and (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_b')::uuid) = 0,
  'educator A is limited to workspace A'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select extensions.ok(
  (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_b')::uuid) = 1
  and (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_a')::uuid) = 0
  and (select count(*)::integer from public.classes where id = '20000000-0000-4000-8000-000000000001') = 1,
  'owner B can read workspace B and its own class only'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.classes (workspace_id, name) values (current_setting('test.workspace_b')::uuid, 'Cross-tenant write')$$,
  '42501',
  'new row violates row-level security policy for table "classes"',
  'owner A cannot create a class in workspace B'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.workspace_members where user_id = (select auth.uid())),
  0,
  'student is not a workspace member'
);
select extensions.is(
  (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_a')::uuid),
  0,
  'student cannot read a workspace through class tenancy'
);

-- A client cannot bypass the join RPC, spoof creator, or mutate scope.
select extensions.throws_ok(
  $$insert into public.classes (workspace_id, name) values (current_setting('test.workspace_b')::uuid, 'Spoof tenant')$$,
  '42501',
  'new row violates row-level security policy for table "classes"',
  'foreign workspace UUID does not authorize class creation'
);
select extensions.throws_ok(
  $$insert into public.classes (workspace_id, name, created_by)
    values (current_setting('test.workspace_a')::uuid, 'Spoof creator', '10000000-0000-4000-8000-000000000005')$$,
  '42501',
  'permission denied for table classes',
  'class creator cannot be supplied by a browser'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.classes (workspace_id, name) values (current_setting('test.workspace_a')::uuid, '   ')$$,
  '23514',
  'new row for relation "classes" violates check constraint "classes_name_check"',
  'blank class names are rejected'
);
select extensions.throws_ok(
  $$insert into public.classes (workspace_id, name) values (current_setting('test.workspace_a')::uuid, E'\t\n')$$,
  '23514',
  'new row for relation "classes" violates check constraint "classes_name_check"',
  'class name rejects whitespace-only values'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.class_enrollments (class_id, student_user_id)
    values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007')$$,
  '42501',
  'permission denied for table class_enrollments',
  'ordinary clients cannot insert enrollments directly'
);

-- Create A's classes through the authenticated interface, which invokes the
-- automatic entropy-backed trigger.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
with created as (
  insert into public.classes (workspace_id, name)
  values (current_setting('test.workspace_a')::uuid, 'Class A')
  returning id
)
select set_config('test.class_a', id::text, true),
       set_config('test.code_a', '', true)
from created;
select set_config('test.code_a', public.get_class_join_code(current_setting('test.class_a')::uuid), true);
select extensions.is(
  (select count(*)::integer from public.classes where id = current_setting('test.class_a')::uuid),
  1,
  'owner A can read its own class before enrollment'
);
with created as (
  insert into public.classes (workspace_id, name)
  values (current_setting('test.workspace_a')::uuid, 'Another Class A')
  returning id
)
select set_config('test.class_a2', id::text, true),
       set_config('test.code_a2', '', true)
from created;
select set_config('test.code_a2', public.get_class_join_code(current_setting('test.class_a2')::uuid), true);
select extensions.ok(
  current_setting('test.code_a') ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$'
  and current_setting('test.code_a2') ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$'
  and current_setting('test.code_a') <> current_setting('test.code_a2'),
  'classes get distinct generated Base32-like join codes'
);
reset role;
select extensions.is(
  (select created_by from public.classes where id = current_setting('test.class_a')::uuid),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'owner A class provenance is the authenticated caller'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is(
  (select public.get_class_join_code(current_setting('test.class_a')::uuid)),
  current_setting('test.code_a'),
  'staff can retrieve the invitation code through the scoped RPC'
);
select extensions.throws_ok(
  $$update public.classes set workspace_id = current_setting('test.workspace_b')::uuid where id = current_setting('test.class_a')::uuid$$,
  '42501',
  'permission denied for table classes',
  'staff cannot change class workspace scope'
);
select extensions.throws_ok(
  $$update public.classes set created_by = '10000000-0000-4000-8000-000000000005' where id = current_setting('test.class_a')::uuid$$,
  '42501',
  'permission denied for table classes',
  'staff cannot change class creator'
);
select extensions.throws_ok(
  $$update public.classes set id = '20000000-0000-4000-8000-000000000099' where id = current_setting('test.class_a')::uuid$$,
  '42501',
  'permission denied for table classes',
  'staff cannot change class identity'
);
select extensions.throws_ok(
  $$update public.classes set join_code = 'CCCCCCCCCC' where id = current_setting('test.class_a')::uuid$$,
  '42501',
  'permission denied for table classes',
  'staff cannot rotate invitation code through direct update'
);
update public.classes set name = 'Renamed Class A'
where id = current_setting('test.class_a')::uuid;
update public.classes set status = 'archived'
where id = current_setting('test.class_a')::uuid;
select extensions.is(
  (select status from public.classes where id = current_setting('test.class_a')::uuid),
  'archived',
  'staff can archive a class'
);
select extensions.throws_ok(
  $$select * from public.join_class_by_code(current_setting('test.code_a'))$$,
  'P0001',
  'class_archived',
  'archived class cannot be joined'
);
update public.classes set status = 'active'
where id = current_setting('test.class_a')::uuid;
select extensions.is(
  (select status from public.classes where id = current_setting('test.class_a')::uuid),
  'active',
  'staff can reactivate a class'
);

-- Educators are staff and may manage classes within their own workspace.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
with created as (
  insert into public.classes (workspace_id, name)
  values (current_setting('test.workspace_a')::uuid, 'Educator class')
  returning id
)
select set_config('test.educator_class', id::text, true)
from created;
reset role;
select extensions.is(
  (select created_by from public.classes where id = current_setting('test.educator_class')::uuid),
  '10000000-0000-4000-8000-000000000002'::uuid,
  'educator class provenance is the authenticated caller'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.classes set name = 'Educator renamed class'
where id = current_setting('test.educator_class')::uuid;
select extensions.is(
  (select name from public.classes where id = current_setting('test.educator_class')::uuid),
  'Educator renamed class',
  'educator can update an own-workspace class'
);

-- Students join through the only enrollment API; the routine uses auth.uid().
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.classes where id = current_setting('test.class_a')::uuid),
  0,
  'student cannot read class before enrollment'
);
select set_config('test.join_result', (select class_id::text || ':' || enrollment_status
  from public.join_class_by_code(
    pg_catalog.lower(pg_catalog.substr(current_setting('test.code_a'), 1, 5)
      || '-' || pg_catalog.substr(current_setting('test.code_a'), 6, 5))
  )), true);
select extensions.is(
  current_setting('test.join_result'),
  current_setting('test.class_a') || ':active',
  'normalized lowercase join code enrolls the authenticated caller'
);
select extensions.is(
  (select count(*)::integer from public.class_enrollments
   where class_id = current_setting('test.class_a')::uuid and student_user_id = (select auth.uid())),
  1,
  'join inserts only the caller enrollment'
);
select * from public.join_class_by_code(current_setting('test.code_a'));
select extensions.is(
  (select count(*)::integer from public.class_enrollments where class_id = current_setting('test.class_a')::uuid),
  1,
  'repeat join is idempotent'
);
select extensions.is(
  (select count(*)::integer from public.classes where id = current_setting('test.class_a')::uuid),
  1,
  'enrolled student can read their class'
);
select extensions.is(
  (select count(*)::integer from public.classes where id = current_setting('test.class_a2')::uuid),
  0,
  'student cannot read a different class in the same workspace'
);
select extensions.is(
  (select count(*)::integer from public.workspace_members where workspace_id = current_setting('test.workspace_a')::uuid),
  0,
  'student cannot enumerate workspace members'
);
select extensions.is(
  (select count(*)::integer from public.class_enrollments where student_user_id = (select auth.uid())),
  1,
  'student can read own enrollment'
);
select extensions.throws_ok(
  $$select public.get_class_join_code(current_setting('test.class_a')::uuid)$$,
  '42501',
  'not_authorized',
  'student cannot retrieve class join code'
);
select extensions.throws_ok(
  $$select * from public.join_class_by_code('not-a-valid-code')$$,
  'P0001',
  'invalid_join_code',
  'malformed code receives stable invalid code error'
);
select extensions.throws_ok(
  pg_catalog.format(
    'select * from public.join_class_by_code(%L)',
    case
      when pg_catalog.left(current_setting('test.code_a'), 1) = '2'
        then '3' || pg_catalog.substr(current_setting('test.code_a'), 2)
      else '2' || pg_catalog.substr(current_setting('test.code_a'), 2)
    end
  ),
  'P0001',
  'invalid_join_code',
  'one-character near-miss code is not fuzzy matched'
);

-- A second student can enroll, but the first cannot read that enrollment.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select * from public.join_class_by_code(
  pg_catalog.substr(current_setting('test.code_a'), 1, 5)
  || ' ' || pg_catalog.substr(current_setting('test.code_a'), 6, 5)
);
select extensions.is(
  (select count(*)::integer from public.class_enrollments
   where class_id = current_setting('test.class_a')::uuid and student_user_id = (select auth.uid())),
  1,
  'student cannot read another student enrollment'
);
select extensions.is(
  (select count(*)::integer from public.workspace_members where workspace_id = current_setting('test.workspace_a')::uuid),
  0,
  'student still cannot enumerate staff membership after joining'
);

-- Staff can see the class roster; the student path cannot enumerate it.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.class_enrollments where class_id = current_setting('test.class_a')::uuid),
  2,
  'owner can read enrollments for a class in their workspace'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.class_enrollments where class_id = current_setting('test.class_a')::uuid),
  2,
  'educator can read enrollments for a class in their workspace'
);

-- Tenant B owner and an unrelated authenticated user know A's UUIDs but gain no access.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.classes where id = current_setting('test.class_a')::uuid),
  0,
  'owner B cannot read tenant A class'
);
select extensions.is(
  (select count(*)::integer from public.class_enrollments where class_id = current_setting('test.class_a')::uuid),
  0,
  'owner B cannot read tenant A enrollment'
);
select extensions.is(
  (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_a')::uuid),
  0,
  'owner B cannot read tenant A workspace'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.classes where id = current_setting('test.class_a')::uuid),
  0,
  'outsider cannot read a class by knowing its UUID'
);
select extensions.is(
  (select count(*)::integer from public.workspaces where id = current_setting('test.workspace_a')::uuid),
  0,
  'outsider cannot read a workspace by knowing its UUID'
);
select extensions.is(
  (select count(*)::integer from public.workspace_members where workspace_id = current_setting('test.workspace_a')::uuid),
  0,
  'outsider cannot read members by knowing the workspace UUID'
);
select extensions.throws_ok(
  $$insert into public.classes (workspace_id, name) values (current_setting('test.workspace_a')::uuid, 'IDOR attempt')$$,
  '42501',
  'new row violates row-level security policy for table "classes"',
  'outsider cannot create class by supplying foreign workspace UUID'
);
select extensions.throws_ok(
  $$select * from public.join_class_by_code('ZZZZZZZZZZ')$$,
  'P0001',
  'invalid_join_code',
  'outsider cannot discover class using a wrong code'
);

-- Removed enrollments are restored by the same idempotent join operation.
reset role;
update public.class_enrollments
set status = 'removed'
where class_id = current_setting('test.class_a')::uuid
  and student_user_id = '10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select * from public.join_class_by_code(current_setting('test.code_a'));
select extensions.is(
  (select status from public.class_enrollments
   where class_id = current_setting('test.class_a')::uuid and student_user_id = (select auth.uid())),
  'active',
  'rejoining restores an existing removed enrollment'
);

-- Account deletion cleans personal tenant rows but does not erase an
-- organization only because its original creator disappears.
reset role;
insert into public.workspaces (id, workspace_type, name, created_by)
values (
  '30000000-0000-4000-8000-000000000001',
  'organization',
  'Organization retained',
  '10000000-0000-4000-8000-000000000009'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000008', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
select set_config('test.personal_deleted', (select workspace_id::text from public.ensure_personal_workspace()), true);
reset role;
delete from auth.users where id = '10000000-0000-4000-8000-000000000008';
select extensions.is(
  (select count(*)::integer from public.workspaces where id = current_setting('test.personal_deleted')::uuid),
  0,
  'deleting personal owner cascades its personal workspace'
);
delete from auth.users where id = '10000000-0000-4000-8000-000000000009';
select extensions.ok(
  exists (select 1 from public.workspaces where id = '30000000-0000-4000-8000-000000000001' and created_by is null),
  'organization survives creator deletion and provenance becomes null'
);

-- No anonymous table/API access.
reset role;
set local role anon;
select extensions.throws_ok($$select * from public.workspaces$$, '42501', 'permission denied for table workspaces', 'anon cannot read workspaces');
select extensions.throws_ok($$select * from public.workspace_members$$, '42501', 'permission denied for table workspace_members', 'anon cannot read memberships');
select extensions.throws_ok($$select id from public.classes$$, '42501', 'permission denied for table classes', 'anon cannot read classes');
select extensions.throws_ok($$select * from public.class_enrollments$$, '42501', 'permission denied for table class_enrollments', 'anon cannot read enrollments');
select extensions.throws_ok($$insert into public.workspaces (workspace_type, name) values ('organization', 'Anon')$$, '42501', 'permission denied for table workspaces', 'anon cannot create workspaces');
select extensions.throws_ok($$insert into public.classes (workspace_id, name) values ('30000000-0000-4000-8000-000000000001', 'Anon')$$, '42501', 'permission denied for table classes', 'anon cannot create classes');
select extensions.throws_ok($$insert into public.class_enrollments (class_id, student_user_id) values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007')$$, '42501', 'permission denied for table class_enrollments', 'anon cannot create enrollments');
select extensions.throws_ok($$select * from public.ensure_personal_workspace()$$, '42501', 'permission denied for function ensure_personal_workspace', 'anon cannot bootstrap workspace');
select extensions.throws_ok($$select * from public.join_class_by_code('ZZZZZZZZZZ')$$, '42501', 'permission denied for function join_class_by_code', 'anon cannot join by code');
select extensions.throws_ok($$select public.get_class_join_code('20000000-0000-4000-8000-000000000002')$$, '42501', 'permission denied for function get_class_join_code', 'anon cannot fetch join code');

reset role;
select * from extensions.finish();
rollback;
