begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id) values
  ('85000000-0000-4000-8000-000000000001'),
  ('85000000-0000-4000-8000-000000000002'),
  ('85000000-0000-4000-8000-000000000003'),
  ('85000000-0000-4000-8000-000000000004');
insert into public.workspaces (id, workspace_type, name) values
  ('95000000-0000-4000-8000-000000000001', 'organization', 'Checkout switch test'),
  ('95000000-0000-4000-8000-000000000002', 'organization', 'Foreign test');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('95000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', 'owner'),
  ('95000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000002', 'educator'),
  ('95000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000003', 'owner'),
  ('95000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', 'admin');

-- Test-only wrappers keep expected identity fixed while invoking the actual
-- service-role functions. No SECURITY DEFINER bypass in these tests.
create function pg_temp.reserve_test(p_interval text, p_actor uuid default '85000000-0000-4000-8000-000000000001')
returns text language sql as $$
  select reservation_state from public.reserve_workspace_checkout(
    '95000000-0000-4000-8000-000000000001', p_actor, p_interval
  );
$$;
create temp table snapshots (label text, attempt uuid, session_id text, lease timestamptz);
grant all on snapshots to service_role;
create function pg_temp.replace_test(
  p_attempt uuid, p_session text, p_interval text default 'annual',
  p_actor uuid default '85000000-0000-4000-8000-000000000001'
) returns text language sql as $$
  select reservation_state from public.replace_workspace_checkout_after_expire(
    '95000000-0000-4000-8000-000000000001', p_actor, p_attempt, p_session, p_interval
  );
$$;

select extensions.ok(
  has_function_privilege('service_role', 'public.replace_workspace_checkout_after_expire(uuid,uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.replace_workspace_checkout_after_expire(uuid,uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.replace_workspace_checkout_after_expire(uuid,uuid,uuid,text,text)', 'execute'),
  'replacement execute is service-role only'
);
select extensions.ok(
  (select not prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
   where oid = 'public.replace_workspace_checkout_after_expire(uuid,uuid,uuid,text,text)'::regprocedure),
  'replacement uses security invoker and a fixed empty search_path'
);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.replace_workspace_checkout_after_expire(null,null,null,null,'annual')$$,
  '42501', 'permission denied for function replace_workspace_checkout_after_expire',
  'browser cannot invoke replacement even with known arguments'
);
reset role;
set local role anon;
select extensions.throws_ok(
  $$select * from public.replace_workspace_checkout_after_expire(null,null,null,null,'annual')$$,
  '42501', 'permission denied for function replace_workspace_checkout_after_expire',
  'anonymous cannot invoke replacement'
);
reset role;
set local role service_role;

select extensions.is(pg_temp.reserve_test('monthly'), 'reserved', 'empty workspace reserves monthly');
insert into snapshots select 'initial', checkout_attempt_id, checkout_session_id, checkout_lock_expires_at
from public.workspace_billing where workspace_id = '95000000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.reserve_test('monthly'), 'in_progress', 'another creator cannot bypass the creation lease');
select public.save_workspace_stripe_customer(
  '95000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001',
  (select attempt from snapshots where label = 'initial'), 'cus_switchtest'
);
select public.save_workspace_checkout_session(
  '95000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001',
  (select attempt from snapshots where label = 'initial'), 'cs_test_old', pg_catalog.now() + interval '1 day'
);
select extensions.is(pg_temp.reserve_test('monthly'), 'existing_session', 'same interval resumes saved session');
select extensions.is((select checkout_attempt_id from public.workspace_billing where workspace_id = '95000000-0000-4000-8000-000000000001'),
  (select attempt from snapshots where label = 'initial'), 'resume keeps the attempt identity');
select extensions.is((select checkout_session_id from public.workspace_billing where workspace_id = '95000000-0000-4000-8000-000000000001'), 'cs_test_old', 'resume keeps the session identity');
select extensions.is(pg_temp.reserve_test('annual'), 'switch_session', 'different interval claims a switch');
insert into snapshots select 'switch', checkout_attempt_id, checkout_session_id, checkout_lock_expires_at
from public.workspace_billing where workspace_id = '95000000-0000-4000-8000-000000000001';
select extensions.ok((select lease > pg_catalog.statement_timestamp() from snapshots where label = 'switch'), 'switch acquires a bounded lease');
select extensions.is(pg_temp.reserve_test('annual'), 'in_progress', 'second switch is blocked while lease is held');
select extensions.is(pg_temp.reserve_test('monthly'), 'in_progress', 'same-interval resume cannot bypass switch lease');

-- A delayed original creator cannot clear the switch lock with a repeated save.
select public.save_workspace_checkout_session(
  '95000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001',
  (select attempt from snapshots where label = 'initial'), 'cs_test_old', pg_catalog.now() + interval '1 day'
);
select extensions.is((select checkout_lock_expires_at from public.workspace_billing where workspace_id = '95000000-0000-4000-8000-000000000001'),
  (select lease from snapshots where label = 'switch'), 'idempotent late save preserves switch lease');
select extensions.throws_ok(
  $$select public.save_workspace_checkout_session('95000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',(select attempt from snapshots where label='initial'),'cs_test_injected',now()+interval '1 day')$$,
  'P0001', 'checkout_session_conflict', 'save cannot overwrite an existing session'
);

select extensions.is(pg_temp.replace_test(gen_random_uuid(), 'cs_test_old'), 'stale', 'wrong attempt cannot replace');
select extensions.is(pg_temp.replace_test((select attempt from snapshots where label = 'initial'), 'cs_test_foreign'), 'stale', 'wrong session cannot replace');
select extensions.is(pg_temp.replace_test(null, null), 'stale', 'missing expected IDs fail closed');
select extensions.throws_ok(
  $$select pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old','weekly')$$,
  '42501', 'not_authorized', 'unsupported interval rejected'
);
select extensions.throws_ok(
  $$select pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old',null)$$,
  '42501', 'not_authorized', 'null interval rejected'
);
select extensions.throws_ok(
  $$select pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old','annual',null)$$,
  '42501', 'not_authorized', 'missing actor rejected'
);
select extensions.throws_ok(
  $$select pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old','annual','85000000-0000-4000-8000-000000000002')$$,
  '42501', 'not_authorized', 'educator cannot replace'
);
select extensions.throws_ok(
  $$select pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old','annual','85000000-0000-4000-8000-000000000003')$$,
  '42501', 'not_authorized', 'foreign owner cannot replace'
);
select extensions.is(
  (select reservation_state from public.replace_workspace_checkout_after_expire(
    '95000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000003',
    (select attempt from snapshots where label='initial'),'cs_test_old','annual')),
  'stale', 'expected IDs cannot be transplanted into a different workspace'
);
update public.workspaces set status='archived' where id='95000000-0000-4000-8000-000000000001';
select extensions.throws_ok(
  $$select pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old')$$,
  '42501', 'not_authorized', 'archived workspace cannot replace'
);
update public.workspaces set status='active' where id='95000000-0000-4000-8000-000000000001';

update public.workspace_billing set subscription_status='active', stripe_subscription_id='sub_switchtest'
where workspace_id='95000000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old'), 'existing_subscription', 'subscription arriving before handoff blocks replacement');
select extensions.is(pg_temp.reserve_test('annual'), 'existing_subscription', 'active subscription blocks reservation');
update public.workspace_billing set subscription_status='unpaid' where workspace_id='95000000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.reserve_test('annual'), 'existing_subscription', 'unpaid subscription is not a second-checkout opportunity');
select extensions.is(pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old'), 'existing_subscription', 'unpaid subscription blocks handoff too');
update public.workspace_billing set subscription_status=null, stripe_subscription_id=null
where workspace_id='95000000-0000-4000-8000-000000000001';

select extensions.is(pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old','annual','85000000-0000-4000-8000-000000000004'), 'reserved', 'active admin can atomically replace after trusted expiration');
insert into snapshots select 'winner', checkout_attempt_id, checkout_session_id, checkout_lock_expires_at
from public.workspace_billing where workspace_id='95000000-0000-4000-8000-000000000001';
select extensions.ok((select attempt from snapshots where label='winner') <> (select attempt from snapshots where label='initial'), 'handoff rotates attempt identity');
select extensions.is((select checkout_interval from public.workspace_billing where workspace_id='95000000-0000-4000-8000-000000000001'), 'annual', 'handoff sets target interval');
select extensions.ok((select checkout_session_id is null and checkout_lock_expires_at > statement_timestamp()
  and checkout_session_expires_at > statement_timestamp() and checkout_session_expires_at <= statement_timestamp()+interval '30 minutes'
  from public.workspace_billing where workspace_id='95000000-0000-4000-8000-000000000001'), 'handoff clears old session and establishes bounded creation lease/expiry');
select extensions.is((select stripe_customer_id from public.workspace_billing where workspace_id='95000000-0000-4000-8000-000000000001'), 'cus_switchtest', 'handoff preserves customer');
select extensions.is(pg_temp.replace_test((select attempt from snapshots where label='initial'),'cs_test_old'), 'stale', 'losing stale actor cannot overwrite winner');
select extensions.is(pg_temp.replace_test((select attempt from snapshots where label='winner'),'cs_test_old'), 'stale', 'old session cannot replace new attempt');
select extensions.throws_ok(
  $$select public.save_workspace_checkout_session('95000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',(select attempt from snapshots where label='initial'),'cs_test_old',now()+interval '1 day')$$,
  'P0001', 'checkout_reservation_expired', 'late original creator cannot save over replacement'
);
select extensions.is(pg_temp.reserve_test('annual'), 'in_progress', 'winner creation lease blocks a second creator');
update public.workspace_billing set checkout_lock_expires_at=now()-interval '1 second'
where workspace_id='95000000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.reserve_test('annual'), 'reserved', 'lost creation can retry same interval within recovery window');
select extensions.is((select checkout_attempt_id from public.workspace_billing where workspace_id='95000000-0000-4000-8000-000000000001'), (select attempt from snapshots where label='winner'), 'creation retry retains Stripe idempotency identity');
update public.workspace_billing set checkout_lock_expires_at=now()-interval '1 second', checkout_session_expires_at=now()-interval '1 second'
where workspace_id='95000000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.reserve_test('annual'), 'unavailable', 'unknown creation outcome never rotates after provisional expiry');
select extensions.is(pg_temp.reserve_test('monthly'), 'unavailable', 'different interval cannot bypass unknown creation outcome');
select extensions.is((select checkout_attempt_id from public.workspace_billing where workspace_id='95000000-0000-4000-8000-000000000001'), (select attempt from snapshots where label='winner'), 'unknown creation keeps original identity');

select public.save_workspace_checkout_session(
  '95000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',
  (select attempt from snapshots where label='winner'),'cs_test_annual',now()+interval '1 day'
);
update public.workspace_billing set checkout_session_expires_at=now()-interval '1 second'
where workspace_id='95000000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.reserve_test('annual'), 'existing_session', 'saved session must be checked even after DB expiry (may have completed)');
create temp table returned_switch as select * from public.reserve_workspace_checkout(
  '95000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','monthly'
);
select extensions.is((select reservation_state from returned_switch), 'switch_session', 'annual-to-monthly uses the same switch path');
select extensions.is((select checkout_session_id from returned_switch), 'cs_test_annual', 'trusted switch result contains exact saved session ID');
select extensions.is((select attempt_id from returned_switch), (select attempt from snapshots where label='winner'), 'switch claim retains exact old attempt for CAS');
select extensions.is(pg_temp.replace_test((select attempt from snapshots where label='winner'),'cs_test_annual','monthly'), 'reserved', 'annual-to-monthly handoff succeeds');
select extensions.is((select count(*)::integer from public.workspace_entitlements where workspace_id='95000000-0000-4000-8000-000000000001' and plan='pro'), 0, 'no reserve/save/switch grants Pro');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000001',true);
select extensions.is((select plan from public.get_workspace_entitlement('95000000-0000-4000-8000-000000000001')), 'teacher_free', 'existing capability resolver still returns Free after switching');
select extensions.throws_ok(
  $$select checkout_session_id from public.workspace_billing$$,
  '42501', 'permission denied for table workspace_billing', 'saved session IDs remain inaccessible to browsers'
);
reset role;
select * from extensions.finish();
rollback;
