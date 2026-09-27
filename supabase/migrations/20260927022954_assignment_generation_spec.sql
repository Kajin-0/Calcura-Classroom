-- Phase 8.6: persist bounded teacher generation intent. Existing rows remain
-- NULL in these columns and are interpreted by Calcura using the exact legacy
-- Auto path. New rows receive a versioned spec and a fresh opaque slot seed.

create function classroom_private.is_supported_assignment_generation_profile(
  p_activity_key text,
  p_difficulty text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_activity_key
    when 'integration.basic_trig.v1'
      then p_difficulty in ('auto', 'beginner', 'intermediate')
    when 'integration.u_substitution.v1'
      then p_difficulty in ('auto', 'beginner', 'intermediate')
    when 'integration.log_u_substitution.v1'
      then p_difficulty in ('auto', 'intermediate')
    when 'integration.by_parts.v1'
      then p_difficulty in ('auto', 'advanced')
    when 'integration.inverse_trig.v1'
      then p_difficulty in ('auto', 'intermediate')
    when 'integration.partial_fractions.v1'
      then p_difficulty in ('auto', 'intermediate')
    else false
  end;
$$;

revoke all on function classroom_private.is_supported_assignment_generation_profile(text, text)
  from public, anon;
grant execute on function classroom_private.is_supported_assignment_generation_profile(text, text)
  to authenticated;

alter table public.assignment_items
  add column generation_spec_version smallint,
  add column difficulty_profile text,
  add column variant_policy text,
  add column generation_seed uuid;

-- Set defaults only after adding the columns so pre-Phase-8.6 rows stay NULL
-- and retain their pre-existing unseeded Auto generation behavior.
alter table public.assignment_items
  alter column generation_spec_version set default 1,
  alter column difficulty_profile set default 'auto',
  alter column variant_policy set default 'individualized',
  alter column generation_seed set default pg_catalog.gen_random_uuid();

alter table public.assignment_items
  add constraint assignment_items_generation_spec_shape_check check (
    (
      generation_spec_version is null
      and difficulty_profile is null
      and variant_policy is null
      and generation_seed is null
    )
    or (
      generation_spec_version is not null
      and difficulty_profile is not null
      and variant_policy is not null
      and generation_seed is not null
      and generation_spec_version = 1
      and variant_policy in ('individualized', 'same_for_all')
      and classroom_private.is_supported_assignment_generation_profile(
        activity_key, difficulty_profile
      )
    )
  );

create function classroom_private.guard_assignment_generation_spec()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.generation_spec_version is null then
      raise exception using errcode = '23514', message = 'invalid_assignment_generation_spec';
    end if;
    if new.generation_seed is null then
      new.generation_seed := pg_catalog.gen_random_uuid();
    end if;
    return new;
  end if;

  if new.generation_seed is distinct from old.generation_seed then
    raise exception using errcode = '42501', message = 'assignment_generation_seed_immutable';
  end if;
  if old.generation_spec_version is not null
    and new.generation_spec_version is null
  then
    raise exception using errcode = '23514', message = 'invalid_assignment_generation_spec';
  end if;
  if old.generation_spec_version is null
    and new.generation_spec_version is not null
    and new.generation_seed is null
  then
    new.generation_seed := pg_catalog.gen_random_uuid();
  end if;
  return new;
end;
$$;

create trigger assignment_items_guard_generation_spec
before insert or update on public.assignment_items
for each row execute function classroom_private.guard_assignment_generation_spec();

revoke all on function classroom_private.guard_assignment_generation_spec() from public, anon;

-- Phase-7 duplication remains atomic, but now copies the validated intent and
-- lets the fresh item's default generate a new seed. Legacy source blocks are
-- normalized to versioned Auto/individualized settings on the new draft.
create or replace function public.duplicate_assignment(p_assignment_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_source_title text;
  v_class_status text;
  v_workspace_status text;
  v_duplicate_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select a.class_id, a.title, c.status, w.status
    into v_class_id, v_source_title, v_class_status, v_workspace_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  join public.workspaces as w on w.id = c.workspace_id
  where a.id = p_assignment_id
    and classroom_private.can_manage_assignment(a.id)
  for share of a, c, w;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_class_status <> 'active' or v_workspace_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'classroom_inactive';
  end if;

  insert into public.assignments as created (class_id, title, due_at)
  values (v_class_id, pg_catalog.left(v_source_title, 153) || ' (Copy)', null)
  returning created.id into v_duplicate_id;

  insert into public.assignment_items (
    assignment_id, position, activity_contract_version, activity_key,
    problem_count, generation_spec_version, difficulty_profile, variant_policy
  )
  select
    v_duplicate_id, ai.position, ai.activity_contract_version, ai.activity_key,
    ai.problem_count,
    coalesce(ai.generation_spec_version, 1),
    coalesce(ai.difficulty_profile, 'auto'),
    coalesce(ai.variant_policy, 'individualized')
  from public.assignment_items as ai
  where ai.assignment_id = p_assignment_id
  order by ai.position;

  return v_duplicate_id;
end;
$$;

revoke all on function public.duplicate_assignment(uuid) from public, anon;
grant execute on function public.duplicate_assignment(uuid) to authenticated;

grant select (
  generation_spec_version, difficulty_profile, variant_policy, generation_seed
) on public.assignment_items to authenticated;
grant insert (
  generation_spec_version, difficulty_profile, variant_policy
) on public.assignment_items to authenticated;
grant update (
  generation_spec_version, difficulty_profile, variant_policy
) on public.assignment_items to authenticated;
