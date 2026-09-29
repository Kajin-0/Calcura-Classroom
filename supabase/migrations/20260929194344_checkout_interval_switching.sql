-- Checkout interval switching. No table/data rewrite or entitlement changes.
-- Stripe expiration happens outside the transaction; the service-only handoff
-- below compares the old attempt AND session before rotating the reservation.

create or replace function public.reserve_workspace_checkout(
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
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_billing public.workspace_billing%rowtype;
begin
  if p_actor_user_id is null or p_billing_interval is null
    or p_billing_interval not in ('monthly', 'annual')
    or not exists (
      select 1 from public.workspace_members as wm
      join public.workspaces as w on w.id = wm.workspace_id
      where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_user_id
        and wm.role in ('owner', 'admin') and w.status = 'active'
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  insert into public.workspace_billing (workspace_id) values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select b.* into strict v_billing from public.workspace_billing as b
  where b.workspace_id = p_workspace_id for update;

  -- Unpaid is still a real subscription, not permission to create another.
  if v_billing.subscription_status in ('active', 'past_due', 'incomplete', 'unpaid', 'paused', 'trialing')
    or (v_billing.subscription_status = 'canceled'
      and v_billing.current_period_end > pg_catalog.statement_timestamp())
    or (v_billing.stripe_subscription_id is not null and v_billing.subscription_status is null)
  then
    return query select 'existing_subscription', null::uuid,
      v_billing.stripe_customer_id, v_billing.checkout_session_id;
    return;
  end if;

  -- Check the lease BEFORE returning a saved session. A resume must not bypass
  -- another request's in-flight expiration/replacement operation.
  if v_billing.checkout_lock_expires_at > pg_catalog.statement_timestamp() then
    return query select 'in_progress', v_billing.checkout_attempt_id,
      v_billing.stripe_customer_id, null::text;
    return;
  end if;

  -- Never discard a saved ID based on the local expiry clock. Stripe may have
  -- completed it while its webhook is delayed; the Edge must retrieve it.
  if v_billing.checkout_session_id is not null then
    if v_billing.checkout_interval = p_billing_interval then
      return query select 'existing_session', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, v_billing.checkout_session_id;
    else
      update public.workspace_billing as b
      set checkout_lock_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes'
      where b.workspace_id = p_workspace_id;
      return query select 'switch_session', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, v_billing.checkout_session_id;
    end if;
    return;
  end if;

  if v_billing.checkout_attempt_id is not null then
    -- A creation response/save may have been lost. Retry only the SAME attempt
    -- and interval within its bounded recovery window. Never rotate an unknown
    -- Stripe outcome or reuse its idempotency key after Stripe may prune it.
    if v_billing.checkout_interval = p_billing_interval
      and v_billing.checkout_session_expires_at > pg_catalog.statement_timestamp()
    then
      update public.workspace_billing as b
      set checkout_lock_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes'
      where b.workspace_id = p_workspace_id;
      return query select 'reserved', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, null::text;
    elsif v_billing.checkout_session_expires_at > pg_catalog.statement_timestamp() then
      return query select 'in_progress', v_billing.checkout_attempt_id,
        v_billing.stripe_customer_id, null::text;
    else
      return query select 'unavailable', v_billing.checkout_attempt_id,
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
  where b.workspace_id = p_workspace_id returning b.* into v_billing;

  return query select 'reserved', v_billing.checkout_attempt_id,
    v_billing.stripe_customer_id, null::text;
end;
$$;

-- Precondition enforced by the trusted Edge: the exact validated old Stripe
-- session is EXPIRED, not merely past a local timestamp. There is no release /
-- reserve gap. This also recovers a same-interval session expired at Stripe.
create function public.replace_workspace_checkout_after_expire(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_expected_attempt_id uuid,
  p_expected_session_id text,
  p_billing_interval text
)
returns table (
  reservation_state text,
  attempt_id uuid,
  stripe_customer_id text,
  checkout_session_id text
)
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_billing public.workspace_billing%rowtype;
begin
  if p_actor_user_id is null or p_billing_interval is null
    or p_billing_interval not in ('monthly', 'annual')
    or not exists (
      select 1 from public.workspace_members as wm
      join public.workspaces as w on w.id = wm.workspace_id
      where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_user_id
        and wm.role in ('owner', 'admin') and w.status = 'active'
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select b.* into v_billing from public.workspace_billing as b
  where b.workspace_id = p_workspace_id for update;
  if not found then
    return query select 'stale', null::uuid, null::text, null::text;
    return;
  end if;
  if v_billing.subscription_status in ('active', 'past_due', 'incomplete', 'unpaid', 'paused', 'trialing')
    or (v_billing.subscription_status = 'canceled'
      and v_billing.current_period_end > pg_catalog.statement_timestamp())
    or (v_billing.stripe_subscription_id is not null and v_billing.subscription_status is null)
  then
    return query select 'existing_subscription', null::uuid,
      v_billing.stripe_customer_id, v_billing.checkout_session_id;
    return;
  end if;
  if p_expected_attempt_id is null or p_expected_session_id is null
    or v_billing.checkout_attempt_id is distinct from p_expected_attempt_id
    or v_billing.checkout_session_id is distinct from p_expected_session_id
  then
    return query select 'stale', null::uuid, null::text, null::text;
    return;
  end if;

  update public.workspace_billing as b
  set checkout_attempt_id = pg_catalog.gen_random_uuid(),
      checkout_interval = p_billing_interval,
      checkout_lock_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes',
      checkout_session_id = null,
      checkout_session_expires_at = pg_catalog.statement_timestamp() + interval '30 minutes'
  where b.workspace_id = p_workspace_id returning b.* into v_billing;

  return query select 'reserved', v_billing.checkout_attempt_id,
    v_billing.stripe_customer_id, null::text;
end;
$$;

-- A delayed retry of the original creator must not clear an acquired switch
-- lease or overwrite another saved session. Same-session saves are true no-ops.
create or replace function public.save_workspace_checkout_session(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_attempt_id uuid,
  p_stripe_session_id text,
  p_session_expires_at timestamptz
)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_billing public.workspace_billing%rowtype;
begin
  if p_actor_user_id is null or p_stripe_session_id is null
    or p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
    or p_session_expires_at is null
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

  select b.* into v_billing from public.workspace_billing as b
  where b.workspace_id = p_workspace_id and b.checkout_attempt_id = p_attempt_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'checkout_reservation_expired';
  end if;
  if v_billing.checkout_session_id = p_stripe_session_id then
    return;
  end if;
  if v_billing.checkout_session_id is not null then
    raise exception using errcode = 'P0001', message = 'checkout_session_conflict';
  end if;
  update public.workspace_billing
  set checkout_session_id = p_stripe_session_id,
      checkout_session_expires_at = p_session_expires_at,
      checkout_lock_expires_at = null
  where workspace_id = p_workspace_id and checkout_attempt_id = p_attempt_id;
end;
$$;

revoke all on function public.reserve_workspace_checkout(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.replace_workspace_checkout_after_expire(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.save_workspace_checkout_session(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_workspace_checkout(uuid, uuid, text) to service_role;
grant execute on function public.replace_workspace_checkout_after_expire(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.save_workspace_checkout_session(uuid, uuid, uuid, text, timestamptz) to service_role;
