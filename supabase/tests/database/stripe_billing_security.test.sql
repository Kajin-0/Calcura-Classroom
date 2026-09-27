begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (id, email) values
  ('83000000-0000-4000-8000-000000000001', 'stripe-owner@classroom.test'),
  ('83000000-0000-4000-8000-000000000002', 'stripe-foreign@classroom.test'),
  ('83000000-0000-4000-8000-000000000003', 'stripe-student@classroom.test'),
  ('83000000-0000-4000-8000-000000000004', 'stripe-educator@classroom.test');

insert into public.workspaces (id, workspace_type, name, created_by) values
  ('93000000-0000-4000-8000-000000000001', 'organization', 'Stripe owner workspace', '83000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002', 'organization', 'Stripe foreign workspace', '83000000-0000-4000-8000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('93000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'owner'),
  ('93000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000004', 'educator'),
  ('93000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000002', 'owner');

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workspace_billing'::regclass)
    and (select relrowsecurity from pg_catalog.pg_class where oid = 'public.stripe_webhook_events'::regclass),
  'billing state and webhook receipts have RLS enabled'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.workspace_billing', 'insert')
    and not has_table_privilege('authenticated', 'public.workspace_billing', 'update')
    and not has_table_privilege('authenticated', 'public.workspace_billing', 'delete')
    and not has_table_privilege('anon', 'public.workspace_billing', 'select')
    and not has_table_privilege('authenticated', 'public.stripe_webhook_events', 'select')
    and not has_table_privilege('authenticated', 'public.stripe_webhook_events', 'insert'),
  'browser roles cannot mutate billing state or inspect webhook events'
);
select extensions.ok(
  has_column_privilege('authenticated', 'public.workspace_billing', 'billing_interval', 'select')
    and not has_column_privilege('authenticated', 'public.workspace_billing', 'stripe_customer_id', 'select')
    and not has_column_privilege('authenticated', 'public.workspace_billing', 'stripe_subscription_id', 'select'),
  'authenticated staff can read only the safe billing summary fields'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.apply_stripe_subscription_reconciliation(text,text,uuid,text,text,text,text,text,bigint,timestamp with time zone,boolean,boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.apply_stripe_subscription_reconciliation(text,text,uuid,text,text,text,text,text,bigint,timestamp with time zone,boolean,boolean)', 'execute')
    and not has_function_privilege('anon', 'public.apply_stripe_subscription_reconciliation(text,text,uuid,text,text,text,text,text,bigint,timestamp with time zone,boolean,boolean)', 'execute'),
  'only the trusted service role can reconcile Stripe state'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.reserve_workspace_checkout(uuid,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.reserve_workspace_checkout(uuid,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.reserve_workspace_checkout(uuid,uuid,text)', 'execute'),
  'only the trusted Edge boundary can call checkout reservation RPCs'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.get_workspace_billing_summary(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_workspace_billing_summary(uuid)', 'execute'),
  'billing summary is available only to authenticated users'
);
select extensions.throws_ok(
  $$insert into public.workspace_billing (workspace_id, billing_interval) values ('93000000-0000-4000-8000-000000000001', 'weekly')$$,
  '23514', 'new row for relation "workspace_billing" violates check constraint "workspace_billing_interval_check"',
  'billing intervals are constrained to monthly or annual'
);

set local role service_role;
select extensions.is(
  (select reservation_state from public.reserve_workspace_checkout(
    '93000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001', 'monthly'
  )),
  'reserved',
  'workspace owner can reserve one serialized checkout'
);
select extensions.throws_ok(
  $$select * from public.reserve_workspace_checkout('93000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000004', 'annual')$$,
  '42501', 'not_authorized',
  'educators without billing authority cannot reserve checkout'
);
select extensions.throws_ok(
  $$select * from public.reserve_workspace_checkout('93000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', 'annual')$$,
  '42501', 'not_authorized',
  'foreign workspace UUID is insufficient to reserve checkout'
);

select public.apply_stripe_subscription_reconciliation(
  'evt_phase9active0001', 'customer.subscription.created',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
  'price_phase9month', 'monthly', 'active', 1800000000,
  pg_catalog.now() + interval '30 days', false, true
);
select extensions.is(
  (select plan from public.workspace_entitlements where workspace_id = '93000000-0000-4000-8000-000000000001'),
  'pro',
  'canonical active monthly subscription writes through the existing entitlement model'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is(
  (select plan from public.get_workspace_entitlement('93000000-0000-4000-8000-000000000001')),
  'pro',
  'Stripe reconciliation grants Pro through the existing Phase-8 resolver'
);
reset role;
set local role service_role;
select extensions.is(
  public.apply_stripe_subscription_reconciliation(
    'evt_reconcilephase9test01', 'internal.reconciliation',
    '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
    'price_phase9month', 'monthly', 'active', 1800000000,
    pg_catalog.now() + interval '30 days', false, true
  ),
  'processed',
  'trusted recovery reconciliation uses the same atomic entitlement path'
);
select extensions.is(
  public.apply_stripe_subscription_reconciliation(
    'evt_phase9active0001', 'customer.subscription.created',
    '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
    'price_phase9month', 'monthly', 'active', 1800000000,
    pg_catalog.now() + interval '30 days', false, true
  ),
  'duplicate',
  'duplicate Stripe event is acknowledged without a second mutation'
);

select public.apply_stripe_subscription_reconciliation(
  'evt_phase9cancelscheduled01', 'customer.subscription.updated',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
  'price_phase9month', 'monthly', 'active', 1800000000,
  pg_catalog.now() + interval '10 days', true, true
);
select extensions.is(
  (select plan from public.workspace_entitlements where workspace_id = '93000000-0000-4000-8000-000000000001'),
  'pro',
  'cancel at period end preserves Pro through the paid period'
);

select public.apply_stripe_subscription_reconciliation(
  'evt_phase9cancelledend01', 'customer.subscription.deleted',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
  'price_phase9month', 'monthly', 'canceled', 1800000000,
  pg_catalog.now() - interval '1 second', false, true
);
select extensions.is(
  (select plan from public.workspace_entitlements where workspace_id = '93000000-0000-4000-8000-000000000001'),
  'teacher_free',
  'ended subscription returns the workspace to Teacher Free'
);

select public.apply_stripe_subscription_reconciliation(
  'evt_phase9pastdue01', 'invoice.payment_failed',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
  'price_phase9month', 'monthly', 'past_due', 1800000000,
  pg_catalog.now() + interval '30 days', false, true
);
select extensions.is(
  (select expires_at > pg_catalog.statement_timestamp()
      and expires_at <= pg_catalog.statement_timestamp() + interval '7 days'
    from public.workspace_entitlements where workspace_id = '93000000-0000-4000-8000-000000000001'),
  true,
  'past_due grants only the bounded seven-day grace period'
);
select public.apply_stripe_subscription_reconciliation(
  'evt_phase9pastdueexpired', 'customer.subscription.updated',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
  'price_phase9month', 'monthly', 'past_due', 1800000000,
  pg_catalog.now() + interval '30 days', false, true
);
update public.workspace_billing
set past_due_since = pg_catalog.now() - interval '8 days'
where workspace_id = '93000000-0000-4000-8000-000000000001';
select public.apply_stripe_subscription_reconciliation(
  'evt_phase9pastdueaftergrace', 'customer.subscription.updated',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
  'price_phase9month', 'monthly', 'past_due', 1800000000,
  pg_catalog.now() + interval '30 days', false, true
);
select extensions.is(
  (select plan from public.workspace_entitlements where workspace_id = '93000000-0000-4000-8000-000000000001'),
  'teacher_free',
  'past_due does not renew the grace window on repeated events'
);

select public.apply_stripe_subscription_reconciliation(
  'evt_phase9newsub01', 'customer.subscription.created',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9newer',
  'price_phase9annual', 'annual', 'active', 1800000100,
  pg_catalog.now() + interval '365 days', false, true
);
select extensions.is(
  public.apply_stripe_subscription_reconciliation(
    'evt_phase9oldsub01', 'customer.subscription.updated',
    '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9active',
    'price_phase9month', 'monthly', 'active', 1800000000,
    pg_catalog.now() + interval '30 days', false, true
  ),
  'stale',
  'out-of-order events from an older subscription cannot replace the newer subscription'
);
select extensions.is(
  (select stripe_subscription_id from public.workspace_billing where workspace_id = '93000000-0000-4000-8000-000000000001'),
  'sub_phase9newer',
  'stale event leaves the current subscription mapping unchanged'
);
select public.apply_stripe_subscription_reconciliation(
  'evt_phase9incomplete01', 'customer.subscription.updated',
  '93000000-0000-4000-8000-000000000001', 'cus_phase9owner', 'sub_phase9newer',
  'price_phase9annual', 'annual', 'incomplete', 1800000100,
  pg_catalog.now() + interval '365 days', false, true
);
select extensions.is(
  (select plan from public.workspace_entitlements where workspace_id = '93000000-0000-4000-8000-000000000001'),
  'teacher_free',
  'incomplete subscription never grants Pro'
);
select extensions.is(
  public.record_stripe_webhook_noop('evt_phase9futureevent01', 'customer.updated', 'ignored'),
  'ignored',
  'unknown signed event types can be durably recorded as safe no-ops'
);
select extensions.is(
  public.record_stripe_webhook_noop('evt_phase9futureevent01', 'customer.updated', 'ignored'),
  'duplicate',
  'unknown event no-op receipt is durable and idempotent'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is(
  (select can_manage_billing from public.get_workspace_billing_summary('93000000-0000-4000-8000-000000000001')),
  true,
  'workspace owner receives billing summary and can manage billing'
);
select extensions.is(
  (select count(*)::integer from public.workspace_billing where workspace_id = '93000000-0000-4000-8000-000000000001'),
  1,
  'owner can read a narrow billing summary row through column grants and RLS'
);
select extensions.is(
  (select count(*)::integer from public.workspace_billing where workspace_id = '93000000-0000-4000-8000-000000000002'),
  0,
  'owner cannot inspect another workspace billing row by known UUID'
);
select extensions.throws_ok(
  $$insert into public.workspace_billing (workspace_id, stripe_customer_id) values ('93000000-0000-4000-8000-000000000001', 'cus_browser')$$,
  '42501', 'permission denied for table workspace_billing',
  'authenticated clients cannot self-assign a Stripe customer'
);
select extensions.throws_ok(
  $$select * from public.get_workspace_billing_summary('93000000-0000-4000-8000-000000000002')$$,
  '42501', 'not_authorized',
  'foreign workspace user cannot query billing summary by known UUID'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"83000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select * from public.get_workspace_billing_summary('93000000-0000-4000-8000-000000000001')$$,
  '42501', 'not_authorized',
  'a student cannot view teacher billing summary'
);
select extensions.throws_ok(
  $$insert into public.workspace_billing (workspace_id, stripe_customer_id) values ('93000000-0000-4000-8000-000000000001', 'cus_student')$$,
  '42501', 'permission denied for table workspace_billing',
  'a student cannot mutate billing state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"83000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select * from public.get_workspace_billing_summary('93000000-0000-4000-8000-000000000001')$$,
  '42501', 'not_authorized',
  'foreign teacher is rejected for a known workspace UUID'
);
reset role;

select * from extensions.finish();
rollback;
