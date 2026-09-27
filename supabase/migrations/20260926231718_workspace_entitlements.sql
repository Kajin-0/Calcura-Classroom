-- Phase 8: workspace-scoped plan entitlements. The row is trusted server
-- state; browser clients may read through tenant-scoped RLS/RPCs but cannot
-- grant or change a plan. No billing identifiers or price assumptions live
-- here.

create table public.workspace_entitlements (
  workspace_id uuid primary key
    references public.workspaces (id) on delete cascade,
  plan text not null,
  status text not null default 'active',
  source text not null default 'manual',
  effective_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint workspace_entitlements_plan_check
    check (plan in ('teacher_free', 'pro', 'team', 'school', 'institution')),
  constraint workspace_entitlements_status_check
    check (status in ('active', 'trialing', 'canceled')),
  constraint workspace_entitlements_source_check
    check (source in ('manual', 'stripe', 'institution')),
  constraint workspace_entitlements_expiry_check
    check (expires_at is null or expires_at > effective_at)
);

create trigger workspace_entitlements_set_updated_at
before update on public.workspace_entitlements
for each row execute function classroom_private.set_updated_at();

revoke all on table public.workspace_entitlements from public, anon, authenticated;
grant select on table public.workspace_entitlements to authenticated;
grant select, insert, update, delete on table public.workspace_entitlements
  to service_role;

alter table public.workspace_entitlements enable row level security;

create policy workspace_entitlements_select_staff
  on public.workspace_entitlements for select to authenticated
  using (
    classroom_private.has_workspace_role(
      workspace_id, array['owner', 'admin', 'educator']
    )
  );

-- One ordered catalog is the capability registry. Higher plans inherit all
-- capabilities at lower tiers by comparing their single rank value.
create function classroom_private.capabilities_for_plan(p_plan text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  with requested_plan as (
    select case p_plan
      when 'teacher_free' then 0
      when 'pro' then 1
      when 'team' then 2
      when 'school' then 3
      when 'institution' then 4
      else null
    end as plan_rank
  ),
  capability_catalog(capability, minimum_rank, sort_order) as (
    values
      ('basic_classroom'::text, 0, 1),
      ('basic_assignments'::text, 0, 2),
      ('basic_analytics'::text, 0, 3),
      ('advanced_analytics'::text, 1, 4),
      ('result_export'::text, 1, 5),
      ('larger_class_limits'::text, 1, 6),
      ('multiple_teacher_workspace'::text, 2, 7),
      ('school_admin'::text, 3, 8),
      ('institution_integrations'::text, 4, 9)
  )
  select coalesce(
    pg_catalog.array_agg(c.capability order by c.sort_order),
    '{}'::text[]
  )
  from capability_catalog as c
  cross join requested_plan as p
  where p.plan_rank is not null
    and c.minimum_rank <= p.plan_rank;
$$;

create function public.get_workspace_entitlement(p_workspace_id uuid)
returns table (
  workspace_id uuid,
  plan text,
  status text,
  source text,
  effective_at timestamptz,
  expires_at timestamptz,
  capabilities text[]
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_entitlement public.workspace_entitlements%rowtype;
  v_plan text := 'teacher_free';
  v_status text := 'active';
  v_source text := 'default';
  v_effective_at timestamptz := pg_catalog.statement_timestamp();
  v_expires_at timestamptz;
begin
  if (select auth.uid()) is null
    or not classroom_private.has_workspace_role(
      p_workspace_id, array['owner', 'admin', 'educator']
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select e.*
    into v_entitlement
  from public.workspace_entitlements as e
  where e.workspace_id = p_workspace_id;

  if found
    and v_entitlement.status in ('active', 'trialing')
    and v_entitlement.effective_at <= pg_catalog.statement_timestamp()
    and (
      v_entitlement.expires_at is null
      or v_entitlement.expires_at > pg_catalog.statement_timestamp()
    )
  then
    v_plan := v_entitlement.plan;
    v_status := v_entitlement.status;
    v_source := v_entitlement.source;
    v_effective_at := v_entitlement.effective_at;
    v_expires_at := v_entitlement.expires_at;
  end if;

  return query
    select p_workspace_id,
      v_plan,
      v_status,
      v_source,
      v_effective_at,
      v_expires_at,
      classroom_private.capabilities_for_plan(v_plan);
end;
$$;

create function public.workspace_has_capability(
  p_workspace_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(p_capability = any(entitlement.capabilities), false)
  from public.get_workspace_entitlement(p_workspace_id) as entitlement;
$$;

revoke all on function classroom_private.capabilities_for_plan(text)
  from public, anon;
grant execute on function classroom_private.capabilities_for_plan(text)
  to authenticated;

revoke all on function public.get_workspace_entitlement(uuid)
  from public, anon;
revoke all on function public.workspace_has_capability(uuid, text)
  from public, anon;
grant execute on function public.get_workspace_entitlement(uuid)
  to authenticated;
grant execute on function public.workspace_has_capability(uuid, text)
  to authenticated;
