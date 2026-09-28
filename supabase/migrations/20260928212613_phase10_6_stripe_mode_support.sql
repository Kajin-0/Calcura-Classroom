-- Phase 10.6: accept Stripe Checkout Session IDs from either configured mode.
-- The trusted Edge boundary validates STRIPE_MODE, key prefix, session
-- livemode, and configured Price/Product mode before invoking this RPC. This
-- function remains service-role-only; browser clients cannot select a mode.

create or replace function public.save_workspace_checkout_session(
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
    or p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
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

revoke all on function public.save_workspace_checkout_session(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_workspace_checkout_session(uuid, uuid, uuid, text, timestamptz)
  to service_role;
