begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('84000000-0000-4000-8000-000000000001', 'stripe-mode-test@classroom.test'),
  ('84000000-0000-4000-8000-000000000002', 'stripe-mode-live@classroom.test'),
  ('84000000-0000-4000-8000-000000000003', 'stripe-mode-invalid@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('94000000-0000-4000-8000-000000000001', 'organization', 'Test mode workspace', '84000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002', 'organization', 'Live mode workspace', '84000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000003', 'organization', 'Invalid session workspace', '84000000-0000-4000-8000-000000000003');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('94000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'owner'),
  ('94000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002', 'owner'),
  ('94000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000003', 'owner');

insert into public.workspace_billing (workspace_id, checkout_attempt_id) values
  ('94000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000003');

select extensions.ok(
  has_function_privilege('service_role', 'public.save_workspace_checkout_session(uuid,uuid,uuid,text,timestamp with time zone)', 'execute')
    and not has_function_privilege('authenticated', 'public.save_workspace_checkout_session(uuid,uuid,uuid,text,timestamp with time zone)', 'execute')
    and not has_function_privilege('anon', 'public.save_workspace_checkout_session(uuid,uuid,uuid,text,timestamp with time zone)', 'execute'),
  'Checkout Session persistence remains service-role-only'
);

set local role service_role;
select extensions.lives_ok(
  $$select public.save_workspace_checkout_session(
    '94000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'cs_test_phase10_6_session',
    pg_catalog.statement_timestamp() + interval '15 minutes'
  )$$,
  'test-mode Checkout Session IDs remain accepted'
);
select extensions.lives_ok(
  $$select public.save_workspace_checkout_session(
    '94000000-0000-4000-8000-000000000002',
    '84000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000002',
    'cs_live_phase10_6_session',
    pg_catalog.statement_timestamp() + interval '15 minutes'
  )$$,
  'live-mode Checkout Session IDs are accepted after server mode validation'
);
select extensions.throws_ok(
  $$select public.save_workspace_checkout_session(
    '94000000-0000-4000-8000-000000000003',
    '84000000-0000-4000-8000-000000000003',
    'a4000000-0000-4000-8000-000000000003',
    'cs_unknown_phase10_6_session',
    pg_catalog.statement_timestamp() + interval '15 minutes'
  )$$,
  '42501',
  'not_authorized',
  'unknown Checkout Session modes are rejected'
);
reset role;

select * from extensions.finish();
rollback;
