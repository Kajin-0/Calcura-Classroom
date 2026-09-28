begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('82000000-0000-4000-8000-000000000001', 'phase8-owner-a@classroom.test'),
  ('82000000-0000-4000-8000-000000000002', 'phase8-owner-b@classroom.test'),
  ('82000000-0000-4000-8000-000000000003', 'phase8-student@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('92000000-0000-4000-8000-000000000001', 'organization', 'Phase 8 default Free', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'organization', 'Phase 8 Pro', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000003', 'organization', 'Phase 8 foreign', '82000000-0000-4000-8000-000000000002'),
  ('92000000-0000-4000-8000-000000000004', 'organization', 'Phase 8 expired', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000005', 'organization', 'Phase 8 future', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000006', 'organization', 'Phase 8 Team', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000007', 'organization', 'Phase 8 School', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000008', 'organization', 'Phase 8 Institution', '82000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000009', 'organization', 'Phase 8 canceled', '82000000-0000-4000-8000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('92000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', 'owner'),
  ('92000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000006', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000007', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000008', '82000000-0000-4000-8000-000000000001', 'owner'),
  ('92000000-0000-4000-8000-000000000009', '82000000-0000-4000-8000-000000000001', 'owner');

insert into public.workspace_entitlements (
  workspace_id, plan, status, source, effective_at, expires_at
) values
  ('92000000-0000-4000-8000-000000000002', 'pro', 'active', 'manual', pg_catalog.now() - interval '1 day', null),
  ('92000000-0000-4000-8000-000000000003', 'pro', 'active', 'manual', pg_catalog.now() - interval '1 day', null),
  ('92000000-0000-4000-8000-000000000004', 'pro', 'active', 'manual', pg_catalog.now() - interval '2 days', pg_catalog.now() - interval '1 day'),
  ('92000000-0000-4000-8000-000000000005', 'pro', 'active', 'manual', pg_catalog.now() + interval '1 day', null),
  ('92000000-0000-4000-8000-000000000006', 'team', 'active', 'manual', pg_catalog.now() - interval '1 day', null),
  ('92000000-0000-4000-8000-000000000007', 'school', 'active', 'manual', pg_catalog.now() - interval '1 day', null),
  ('92000000-0000-4000-8000-000000000008', 'institution', 'active', 'manual', pg_catalog.now() - interval '1 day', null),
  ('92000000-0000-4000-8000-000000000009', 'pro', 'canceled', 'manual', pg_catalog.now() - interval '1 day', null);

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workspace_entitlements'::regclass),
  'workspace_entitlements has RLS enabled'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.workspace_entitlements', 'select')
    and not has_table_privilege('authenticated', 'public.workspace_entitlements', 'insert')
    and not has_table_privilege('authenticated', 'public.workspace_entitlements', 'update')
    and not has_table_privilege('authenticated', 'public.workspace_entitlements', 'delete'),
  'authenticated clients have read-only entitlement table access'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.workspace_entitlements', 'select')
    and not has_table_privilege('anon', 'public.workspace_entitlements', 'insert')
    and not has_table_privilege('anon', 'public.workspace_entitlements', 'update')
    and not has_table_privilege('anon', 'public.workspace_entitlements', 'delete'),
  'anonymous clients have no entitlement table privileges'
);
select extensions.ok(
  has_table_privilege('service_role', 'public.workspace_entitlements', 'insert')
    and has_table_privilege('service_role', 'public.workspace_entitlements', 'update'),
  'trusted service role can maintain entitlement rows'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.get_workspace_entitlement(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_workspace_entitlement(uuid)', 'execute')
    and not has_function_privilege('public', 'public.get_workspace_entitlement(uuid)', 'execute'),
  'entitlement resolver is authenticated-only'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.workspace_has_capability(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.workspace_has_capability(uuid,text)', 'execute')
    and not has_function_privilege('public', 'public.workspace_has_capability(uuid,text)', 'execute'),
  'capability probe is authenticated-only'
);
select extensions.ok(
  not (select prosecdef from pg_catalog.pg_proc where oid = 'public.get_workspace_entitlement(uuid)'::regprocedure)
    and not (select prosecdef from pg_catalog.pg_proc where oid = 'public.workspace_has_capability(uuid,text)'::regprocedure)
    and (select proconfig @> array['search_path=""']::text[] from pg_catalog.pg_proc where oid = 'public.get_workspace_entitlement(uuid)'::regprocedure)
    and (select proconfig @> array['search_path=""']::text[] from pg_catalog.pg_proc where oid = 'public.workspace_has_capability(uuid,text)'::regprocedure),
  'public entitlement RPCs are invoker functions with an empty search path'
);
select extensions.throws_ok(
  $$insert into public.workspace_entitlements (workspace_id, plan) values ('92000000-0000-4000-8000-000000000001', 'unlimited')$$,
  '23514',
  'new row for relation "workspace_entitlements" violates check constraint "workspace_entitlements_plan_check"',
  'unknown plan identifiers are rejected by a database constraint'
);
select extensions.throws_ok(
  $$insert into public.workspace_entitlements (workspace_id, plan, source) values ('92000000-0000-4000-8000-000000000001', 'pro', 'browser')$$,
  '23514',
  'new row for relation "workspace_entitlements" violates check constraint "workspace_entitlements_source_check"',
  'unknown entitlement sources are rejected by a database constraint'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')),
  'teacher_free',
  'workspace without an explicit row resolves to Teacher Free'
);
select extensions.is(
  (select source from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')),
  'default',
  'missing entitlement is labeled as the deterministic default'
);
select extensions.is(
  (select capabilities from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')),
  array['basic_classroom', 'basic_assignments', 'basic_analytics']::text[],
  'Teacher Free receives all current Classroom capabilities only'
);
select extensions.ok(
  public.workspace_has_capability('92000000-0000-4000-8000-000000000001', 'basic_assignments')
    and not public.workspace_has_capability('92000000-0000-4000-8000-000000000001', 'advanced_analytics'),
  'server capability probe accepts a Free capability and rejects a future Pro capability'
);

-- One user has distinct plans in distinct workspaces; no global user plan is
-- consulted by either call.
select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000002')),
  'pro',
  'the same user resolves Pro in workspace B'
);
select extensions.is(
  (select capabilities from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000002')),
  array['basic_classroom', 'basic_assignments', 'basic_analytics', 'advanced_analytics', 'result_export', 'larger_class_limits', 'advanced_assignment_editing']::text[],
  'Pro inherits every Free capability and adds only Pro capabilities'
);
select extensions.ok(
  public.workspace_has_capability('92000000-0000-4000-8000-000000000002', 'result_export')
    and not public.workspace_has_capability('92000000-0000-4000-8000-000000000002', 'multiple_teacher_workspace'),
  'server capability probe follows the Pro plan boundary'
);
select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')),
  'teacher_free',
  'switching back to workspace A restores its independent Free capability set'
);

select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000006')),
  'team',
  'active Team entitlement resolves Team'
);
select extensions.ok(
  public.workspace_has_capability('92000000-0000-4000-8000-000000000006', 'multiple_teacher_workspace')
    and public.workspace_has_capability('92000000-0000-4000-8000-000000000006', 'result_export'),
  'Team inherits Pro and adds workspace collaboration capability'
);
select extensions.is(
  (select capabilities from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000007')),
  array['basic_classroom', 'basic_assignments', 'basic_analytics', 'advanced_analytics', 'result_export', 'larger_class_limits', 'advanced_assignment_editing', 'multiple_teacher_workspace', 'school_admin']::text[],
  'School inherits Team and adds school administration'
);
select extensions.is(
  (select capabilities from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000008')),
  array['basic_classroom', 'basic_assignments', 'basic_analytics', 'advanced_analytics', 'result_export', 'larger_class_limits', 'advanced_assignment_editing', 'multiple_teacher_workspace', 'school_admin', 'institution_integrations']::text[],
  'Institution inherits School and adds institution integration capability'
);
select extensions.ok(
  public.workspace_has_capability('92000000-0000-4000-8000-000000000008', 'institution_integrations'),
  'institution capability is available only at the top plan tier'
);

select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000004')),
  'teacher_free',
  'past expiry falls back to Teacher Free without a scheduled job'
);
select extensions.is(
  (select source from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000004')),
  'default',
  'expired Pro resolution returns the safe default source'
);
select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000005')),
  'teacher_free',
  'future effective entitlement does not grant access early'
);
select extensions.is(
  (select plan from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000009')),
  'teacher_free',
  'canceled entitlement resolves to Teacher Free'
);

select extensions.is(
  (select count(*)::integer from public.workspace_entitlements where workspace_id = '92000000-0000-4000-8000-000000000002'),
  1,
  'a workspace member can read the explicit entitlement row for their workspace'
);
select extensions.is(
  (select count(*)::integer from public.workspace_entitlements where workspace_id = '92000000-0000-4000-8000-000000000003'),
  0,
  'a member cannot read an unrelated workspace entitlement by known UUID'
);
select extensions.throws_ok(
  $$select * from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000003')$$,
  '42501', 'not_authorized',
  'a foreign workspace UUID does not authorize the resolver'
);
select extensions.throws_ok(
  $$select public.workspace_has_capability('92000000-0000-4000-8000-000000000003', 'advanced_analytics')$$,
  '42501', 'not_authorized',
  'a foreign workspace UUID does not authorize the capability probe'
);
select extensions.throws_ok(
  $$insert into public.workspace_entitlements (workspace_id, plan, source) values ('92000000-0000-4000-8000-000000000001', 'pro', 'manual')$$,
  '42501', 'permission denied for table workspace_entitlements',
  'workspace owner cannot promote their own workspace through the browser role'
);
select extensions.throws_ok(
  $$update public.workspace_entitlements set plan = 'institution' where workspace_id = '92000000-0000-4000-8000-000000000002'$$,
  '42501', 'permission denied for table workspace_entitlements',
  'workspace owner cannot mutate an existing entitlement through the browser role'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.workspace_entitlements),
  0,
  'a class student is not a workspace member and cannot read entitlement rows'
);
select extensions.throws_ok(
  $$select * from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')$$,
  '42501', 'not_authorized',
  'a student cannot resolve a teacher workspace entitlement'
);
select extensions.throws_ok(
  $$insert into public.workspace_entitlements (workspace_id, plan, source) values ('92000000-0000-4000-8000-000000000001', 'pro', 'manual')$$,
  '42501', 'permission denied for table workspace_entitlements',
  'student cannot mutate entitlement state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.workspace_entitlements set plan = 'institution' where workspace_id = '92000000-0000-4000-8000-000000000003'$$,
  '42501', 'permission denied for table workspace_entitlements',
  'foreign workspace owner cannot mutate entitlement state through the browser role'
);
select extensions.throws_ok(
  $$select * from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')$$,
  '42501', 'not_authorized',
  'foreign workspace owner cannot query another tenant by known UUID'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select * from public.get_workspace_entitlement('92000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function get_workspace_entitlement',
  'anonymous role cannot execute the workspace entitlement resolver'
);
select extensions.throws_ok(
  $$insert into public.workspace_entitlements (workspace_id, plan, source) values ('92000000-0000-4000-8000-000000000001', 'pro', 'manual')$$,
  '42501', 'permission denied for table workspace_entitlements',
  'anonymous role cannot mutate entitlement state'
);
reset role;

select * from extensions.finish();
rollback;
