-- Phase 9: trusted, workspace-scoped Stripe billing state. Stripe never
-- authorizes application features directly; reconciliation only feeds the
-- existing workspace_entitlements resolver.

create table public.workspace_billing (
  workspace_id uuid primary key
    references public.workspaces (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  billing_interval text,
  subscription_status text,
  subscription_created_at bigint,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  past_due_since timestamptz,
  checkout_attempt_id uuid,
  checkout_interval text,
  checkout_lock_expires_at timestamptz,
  checkout_session_id text unique,
  checkout_session_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint workspace_billing_interval_check
    check (billing_interval is null or billing_interval in ('monthly', 'annual')),
  constraint workspace_billing_checkout_interval_check
    check (checkout_interval is null or checkout_interval in ('monthly', 'annual')),
  constraint workspace_billing_status_check
    check (
      subscription_status is null
      or subscription_status in (
        'active', 'past_due', 'canceled', 'incomplete',
        'incomplete_expired', 'unpaid', 'paused', 'trialing'
      )
    ),
  constraint workspace_billing_subscription_created_check
    check (subscription_created_at is null or subscription_created_at > 0)
);

create trigger workspace_billing_set_updated_at
before update on public.workspace_billing
for each row execute function classroom_private.set_updated_at();

alter table public.workspace_billing enable row level security;
revoke all on table public.workspace_billing from public, anon, authenticated;
grant select (
  workspace_id, billing_interval, subscription_status,
  current_period_end, cancel_at_period_end
) on table public.workspace_billing to authenticated;
grant select, insert, update, delete on table public.workspace_billing to service_role;

create policy workspace_billing_select_staff
  on public.workspace_billing for select to authenticated
  using (
    classroom_private.has_workspace_role(
      workspace_id, array['owner', 'admin', 'educator']
    )
  );

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  result text not null,
  processed_at timestamptz not null default pg_catalog.now(),
  constraint stripe_webhook_events_id_check
    check (char_length(stripe_event_id) between 8 and 255),
  constraint stripe_webhook_events_type_check
    check (char_length(event_type) between 1 and 160),
  constraint stripe_webhook_events_result_check
    check (result in ('processed', 'stale', 'ignored', 'unmapped'))
);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.stripe_webhook_events to service_role;

-- A reserve RPC serializes concurrent checkout attempts for one workspace.
-- Actor identity is supplied only by the JWT-validated Edge Function; the
-- function independently checks that identity is an active workspace owner
-- or admin before it creates or returns a reservation.
create function public.reserve_workspace_checkout(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_billing_interval text
)
returns table (
  reservation_state text,
  attempt_id uuid,
  stripe_customer_id text,
  checkout_session_id text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_billing public.workspace_billing%rowtype;
  v_workspace_status text;
begin
  if p_actor_user_id is null
    or p_billing_interval is null
    or p_billing_interval not in ('monthly', 'annual')
    or not exists (
      select 1
      from public.workspace_members as wm
      join public.workspaces as w on w.id = wm.workspace_id
      where wm.workspace_id = p_workspace_id
        and wm.user_id = p_actor_user_id
        and wm.role in ('owner', 'admin')
        and w.status = 'active'
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select w.status into v_workspace_status
  from public.workspaces as w
  where w.id = p_workspace_id;
  if not found or v_workspace_status <> 'active' then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  insert into public.workspace_billing (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select b.* into strict v_billing
  from public.workspace_billing as b
  where b.workspace_id = p_workspace_id
  for update;

  if v_billing.subscription_status in ('active', 'past_due', 'incomplete', 'paused', 'trialing')
    or (
      v_billing.subscription_status = 'canceled'
      and v_billing.current_period_end > pg_catalog.statement_timestamp()
    )
  then
    return query select 'existing_subscription', null::uuid,
      v_billing.stripe_customer_id, v_billing.checkout_session_id;
    return;
  end if;

  if v_billing.checkout_session_id is not null
    and v_billing.checkout_session_expires_at > pg_catalog.statement_timestamp()
  then
    if v_billing.checkout_interval = p_billing_interval then
      return query select 'existing_session', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, v_billing.checkout_session_id;
    else
      return query select 'in_progress', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, null::text;
    end if;
    return;
  end if;

  if v_billing.checkout_attempt_id is not null
    and v_billing.checkout_lock_expires_at > pg_catalog.statement_timestamp()
  then
    return query select 'in_progress', v_billing.checkout_attempt_id,
      v_billing.stripe_customer_id, null::text;
    return;
  end if;

  if v_billing.checkout_attempt_id is not null
    and v_billing.checkout_session_id is null
    and v_billing.checkout_session_expires_at > pg_catalog.statement_timestamp()
  then
    if v_billing.checkout_interval = p_billing_interval then
      update public.workspace_billing as b
        set checkout_lock_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes'
      where b.workspace_id = p_workspace_id
      returning b.* into v_billing;
      return query select 'reserved', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, null::text;
    else
      return query select 'in_progress', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, null::text;
    end if;
    return;
  end if;

  update public.workspace_billing as b
    set checkout_attempt_id = pg_catalog.gen_random_uuid(),
        checkout_interval = p_billing_interval,
        checkout_lock_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes',
        checkout_session_id = null,
        checkout_session_expires_at = pg_catalog.statement_timestamp() + interval '30 minutes'
  where b.workspace_id = p_workspace_id
  returning b.* into v_billing;

  return query select 'reserved', v_billing.checkout_attempt_id,
    v_billing.stripe_customer_id, null::text;
end;
$$;

create function public.save_workspace_stripe_customer(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_attempt_id uuid,
  p_stripe_customer_id text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_existing text;
begin
  if p_actor_user_id is null or p_stripe_customer_id is null
    or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
    or not exists (
      select 1 from public.workspace_members as wm
      join public.workspaces as w on w.id = wm.workspace_id
      where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_user_id
        and wm.role in ('owner', 'admin') and w.status = 'active'
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select b.stripe_customer_id into v_existing
  from public.workspace_billing as b
  where b.workspace_id = p_workspace_id and b.checkout_attempt_id = p_attempt_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'checkout_reservation_expired';
  end if;
  if v_existing is not null and v_existing <> p_stripe_customer_id then
    raise exception using errcode = 'P0001', message = 'stripe_customer_conflict';
  end if;

  update public.workspace_billing
    set stripe_customer_id = p_stripe_customer_id
  where workspace_id = p_workspace_id;
end;
$$;

create function public.save_workspace_checkout_session(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_attempt_id uuid,
  p_stripe_session_id text,
  p_session_expires_at timestamptz
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_actor_user_id is null or p_stripe_session_id is null
    or p_stripe_session_id !~ '^cs_test_[A-Za-z0-9_]+$'
    or p_session_expires_at <= pg_catalog.statement_timestamp()
    or not exists (
      select 1 from public.workspace_members as wm
      join public.workspaces as w on w.id = wm.workspace_id
      where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_user_id
        and wm.role in ('owner', 'admin') and w.status = 'active'
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.workspace_billing
    set checkout_session_id = p_stripe_session_id,
        checkout_session_expires_at = p_session_expires_at,
        checkout_lock_expires_at = null
  where workspace_id = p_workspace_id and checkout_attempt_id = p_attempt_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'checkout_reservation_expired';
  end if;
end;
$$;

create function public.release_workspace_checkout(
  p_workspace_id uuid,
  p_attempt_id uuid
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.workspace_billing
  set checkout_attempt_id = null,
      checkout_interval = null,
      checkout_lock_expires_at = null,
      checkout_session_id = null,
      checkout_session_expires_at = null
  where workspace_id = p_workspace_id and checkout_attempt_id = p_attempt_id;
$$;

create function public.record_stripe_webhook_noop(
  p_event_id text,
  p_event_type text,
  p_result text,
  p_workspace_id uuid default null
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_inserted text;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_event_type is null or char_length(p_event_type) not between 1 and 160
    or p_result is null
    or p_result not in ('ignored', 'unmapped')
  then
    raise exception using errcode = '22023', message = 'invalid_webhook_event';
  end if;

  insert into public.stripe_webhook_events (
    stripe_event_id, event_type, workspace_id, result
  ) values (p_event_id, p_event_type, p_workspace_id, p_result)
  on conflict (stripe_event_id) do nothing
  returning stripe_event_id into v_inserted;
  return case when v_inserted is null then 'duplicate' else p_result end;
end;
$$;

-- Canonical Stripe state and event receipt are committed together. Replayed
-- and out-of-order events are safe; older distinct subscriptions cannot
-- replace a newer workspace subscription.
create function public.apply_stripe_subscription_reconciliation(
  p_event_id text,
  p_event_type text,
  p_workspace_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_billing_interval text,
  p_subscription_status text,
  p_subscription_created_at bigint,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_supported_price boolean
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_inserted text;
  v_billing public.workspace_billing%rowtype;
  v_past_due_since timestamptz;
  v_entitlement_plan text := 'teacher_free';
  v_entitlement_expiry timestamptz;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_result text := 'processed';
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_event_type is null or char_length(p_event_type) not between 1 and 160
    or p_workspace_id is null
    or p_subscription_status is null
    or p_stripe_customer_id is null or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
    or p_stripe_subscription_id is null or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    or p_stripe_price_id is null or p_stripe_price_id !~ '^price_[A-Za-z0-9]+$'
    or (p_supported_price and (
      p_billing_interval is null
      or p_billing_interval not in ('monthly', 'annual')
    ))
    or (not p_supported_price and p_billing_interval is not null
      and p_billing_interval not in ('monthly', 'annual'))
    or p_subscription_status not in (
      'active', 'past_due', 'canceled', 'incomplete',
      'incomplete_expired', 'unpaid', 'paused', 'trialing'
    )
    or p_subscription_created_at is null or p_subscription_created_at <= 0
    or p_cancel_at_period_end is null or p_supported_price is null
  then
    raise exception using errcode = '22023', message = 'invalid_subscription_reconciliation';
  end if;

  insert into public.stripe_webhook_events (
    stripe_event_id, event_type, result
  ) values (p_event_id, p_event_type, 'processed')
  on conflict (stripe_event_id) do nothing
  returning stripe_event_id into v_inserted;
  if v_inserted is null then
    return 'duplicate';
  end if;

  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    update public.stripe_webhook_events set workspace_id = null, result = 'unmapped'
      where stripe_event_id = p_event_id;
    return 'unmapped';
  end if;

  update public.stripe_webhook_events
    set workspace_id = p_workspace_id
  where stripe_event_id = p_event_id;

  insert into public.workspace_billing (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select b.* into strict v_billing
  from public.workspace_billing as b
  where b.workspace_id = p_workspace_id
  for update;

  if v_billing.stripe_customer_id is not null
    and v_billing.stripe_customer_id <> p_stripe_customer_id
  then
    raise exception using errcode = '23505', message = 'stripe_customer_conflict';
  end if;

  if v_billing.stripe_subscription_id is not null
    and v_billing.stripe_subscription_id <> p_stripe_subscription_id
    and v_billing.subscription_created_at is not null
    and p_subscription_created_at <= v_billing.subscription_created_at
  then
    update public.stripe_webhook_events set result = 'stale'
      where stripe_event_id = p_event_id;
    return 'stale';
  end if;

  if p_subscription_status = 'past_due' then
    v_past_due_since := case
      when v_billing.stripe_subscription_id = p_stripe_subscription_id
        and v_billing.subscription_status = 'past_due'
        then coalesce(v_billing.past_due_since, v_now)
      else v_now
    end;
  end if;

  update public.workspace_billing as b
    set stripe_customer_id = p_stripe_customer_id,
        stripe_subscription_id = p_stripe_subscription_id,
        stripe_price_id = p_stripe_price_id,
        billing_interval = case when p_supported_price then p_billing_interval else null end,
        subscription_status = p_subscription_status,
        subscription_created_at = p_subscription_created_at,
        current_period_end = p_current_period_end,
        cancel_at_period_end = p_cancel_at_period_end,
        past_due_since = v_past_due_since,
        checkout_attempt_id = null,
        checkout_interval = null,
        checkout_lock_expires_at = null,
        checkout_session_id = null,
        checkout_session_expires_at = null
  where b.workspace_id = p_workspace_id
  returning b.* into v_billing;

  if p_supported_price and p_current_period_end > v_now then
    if p_subscription_status = 'active' or p_subscription_status = 'canceled' then
      v_entitlement_plan := 'pro';
      v_entitlement_expiry := p_current_period_end;
    elsif p_subscription_status = 'past_due'
      and v_past_due_since + interval '7 days' > v_now
    then
      v_entitlement_plan := 'pro';
      v_entitlement_expiry := least(
        p_current_period_end,
        v_past_due_since + interval '7 days'
      );
    end if;
  end if;

  insert into public.workspace_entitlements (
    workspace_id, plan, status, source, effective_at, expires_at
  ) values (
    p_workspace_id, v_entitlement_plan, 'active', 'stripe', v_now,
    case when v_entitlement_plan = 'pro' then v_entitlement_expiry else null end
  )
  on conflict (workspace_id) do update set
    plan = excluded.plan,
    status = 'active',
    source = 'stripe',
    effective_at = excluded.effective_at,
    expires_at = excluded.expires_at;

  if v_entitlement_plan = 'teacher_free' then
    v_result := 'ignored';
  end if;
  update public.stripe_webhook_events
    set result = v_result
  where stripe_event_id = p_event_id;
  return v_result;
end;
$$;

-- The browser receives only this narrow summary from its authenticated Edge
-- Function. Customer/subscription IDs remain server-side.
create function public.get_workspace_billing_summary(p_workspace_id uuid)
returns table (
  billing_interval text,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  can_manage_billing boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select wm.role into v_role
  from public.workspace_members as wm
  join public.workspaces as w on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id
    and wm.user_id = (select auth.uid())
    and w.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return query
    select b.billing_interval, b.subscription_status, b.current_period_end,
      b.cancel_at_period_end, v_role in ('owner', 'admin')
    from public.workspace_billing as b
    where b.workspace_id = p_workspace_id
  union all
    select null::text, null::text, null::timestamptz, false,
      v_role in ('owner', 'admin')
    where not exists (
      select 1 from public.workspace_billing as b
      where b.workspace_id = p_workspace_id
    );
end;
$$;

revoke all on function public.reserve_workspace_checkout(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_workspace_stripe_customer(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_workspace_checkout_session(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.release_workspace_checkout(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_stripe_webhook_noop(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_stripe_subscription_reconciliation(text, text, uuid, text, text, text, text, text, bigint, timestamptz, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.get_workspace_billing_summary(uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_workspace_checkout(uuid, uuid, text)
  to service_role;
grant execute on function public.save_workspace_stripe_customer(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.save_workspace_checkout_session(uuid, uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.release_workspace_checkout(uuid, uuid)
  to service_role;
grant execute on function public.record_stripe_webhook_noop(text, text, text, uuid)
  to service_role;
grant execute on function public.apply_stripe_subscription_reconciliation(text, text, uuid, text, text, text, text, text, bigint, timestamptz, boolean, boolean)
  to service_role;
grant execute on function public.get_workspace_billing_summary(uuid)
  to authenticated;
