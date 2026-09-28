-- Phase 10: optional Pro problem-slot customization. Generated mathematics
-- remains owned by Calcura; this table stores only stable generation intent.

create table public.assignment_problem_slots (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  assignment_item_id uuid not null
    references public.assignment_items (id) on delete cascade,
  position smallint not null,
  source_ordinal smallint not null,
  regeneration_seed uuid,
  locked boolean not null default false,
  slot_spec_version smallint not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint assignment_problem_slots_position_check
    check (position between 0 and 19),
  constraint assignment_problem_slots_source_ordinal_check
    check (source_ordinal between 1 and 20),
  constraint assignment_problem_slots_version_check
    check (slot_spec_version = 1),
  constraint assignment_problem_slots_item_position_key
    unique (assignment_item_id, position) deferrable initially immediate,
  constraint assignment_problem_slots_item_source_ordinal_key
    unique (assignment_item_id, source_ordinal)
);

create index assignment_problem_slots_item_position_idx
  on public.assignment_problem_slots (assignment_item_id, position);

create trigger assignment_problem_slots_set_updated_at
before update on public.assignment_problem_slots
for each row execute function classroom_private.set_updated_at();

alter table public.assignment_problem_slots enable row level security;
revoke all on table public.assignment_problem_slots from public, anon, authenticated;
grant select on table public.assignment_problem_slots to authenticated;

create policy assignment_problem_slots_select_assignment_access
  on public.assignment_problem_slots for select to authenticated
  using (
    exists (
      select 1
      from public.assignment_items as ai
      join public.assignments as a on a.id = ai.assignment_id
      where ai.id = assignment_item_id
        and classroom_private.can_read_assignment(a.class_id, a.status)
    )
  );

-- Keep the Phase-8 ordered capability registry authoritative. Phase 10 adds
-- this one new Pro capability; all higher tiers inherit it by rank.
create or replace function classroom_private.capabilities_for_plan(p_plan text)
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
      ('advanced_assignment_editing'::text, 1, 7),
      ('multiple_teacher_workspace'::text, 2, 8),
      ('school_admin'::text, 3, 9),
      ('institution_integrations'::text, 4, 10)
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

-- Called only after the normal assignment-item guard has locked the parent
-- assignment and established that it is still a draft. A generation-affecting
-- basic block edit intentionally removes its optional Pro overlay; this keeps
-- Teacher Free block editing safe after a workspace downgrade as well.
create function classroom_private.reset_assignment_problem_slots_after_item_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.assignment_problem_slots as slots
  where slots.assignment_item_id = old.id;
  return null;
end;
$$;

create trigger assignment_items_reset_problem_slots
after update of activity_key, problem_count, generation_spec_version,
  difficulty_profile, variant_policy
on public.assignment_items
for each row
when (
  old.activity_key is distinct from new.activity_key
  or old.problem_count is distinct from new.problem_count
  or old.generation_spec_version is distinct from new.generation_spec_version
  or old.difficulty_profile is distinct from new.difficulty_profile
  or old.variant_policy is distinct from new.variant_policy
)
execute function classroom_private.reset_assignment_problem_slots_after_item_edit();

revoke all on function classroom_private.reset_assignment_problem_slots_after_item_edit()
  from public, anon, authenticated;

-- Every operation takes the parent assignment lock before touching slots. The
-- existing publish RPC takes the same lock, so publication serializes against
-- preparation, regeneration, lock changes, and reorder.
create function public.prepare_assignment_problem_slots(p_assignment_id uuid)
returns table (
  assignment_item_id uuid,
  id uuid,
  "position" smallint,
  source_ordinal smallint,
  regeneration_seed uuid,
  locked boolean,
  slot_spec_version smallint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_status text;
  v_item record;
  v_slot_count integer;
begin
  if (select auth.uid()) is null
    or not classroom_private.can_manage_assignment(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select c.workspace_id, a.status
    into v_workspace_id, v_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = p_assignment_id
  for update of a;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'published_content_immutable';
  end if;
  if not public.workspace_has_capability(
    v_workspace_id, 'advanced_assignment_editing'
  ) then
    raise exception using errcode = '42501', message = 'capability_required';
  end if;

  for v_item in
    select ai.id, ai.problem_count, ai.generation_spec_version,
      ai.difficulty_profile, ai.variant_policy, ai.generation_seed
    from public.assignment_items as ai
    where ai.assignment_id = p_assignment_id
    order by ai.position
    for update of ai
  loop
    -- Pre-8.6 draft rows have no persisted generation seed and used Calcura's
    -- legacy unseeded Auto generator. Entering the Pro editor is the explicit
    -- transition point: establish a fresh V1 identity before slots exist.
    -- Unslotized legacy rows are never changed by ordinary reads.
    if v_item.generation_spec_version is null then
      update public.assignment_items as ai
      set generation_spec_version = 1,
        difficulty_profile = 'auto',
        variant_policy = 'individualized',
        generation_seed = null
      where ai.id = v_item.id;
    elsif v_item.generation_spec_version <> 1
      or v_item.difficulty_profile is null
      or v_item.variant_policy is null
      or v_item.generation_seed is null
    then
      raise exception using errcode = 'P0001', message = 'unsupported_assignment_generation_spec';
    end if;

    insert into public.assignment_problem_slots (
      assignment_item_id, position, source_ordinal
    )
    select v_item.id, (ordinality - 1)::smallint, ordinality::smallint
    from pg_catalog.generate_series(1, v_item.problem_count)
      with ordinality as slots(source_ordinal, ordinality)
    on conflict on constraint assignment_problem_slots_item_source_ordinal_key
      do nothing;

    select pg_catalog.count(*)::integer into v_slot_count
    from public.assignment_problem_slots as slots
    where slots.assignment_item_id = v_item.id;

    if v_slot_count <> v_item.problem_count
      or exists (
        select 1
        from public.assignment_problem_slots as slots
        where slots.assignment_item_id = v_item.id
          and (
            slots.source_ordinal < 1
            or slots.source_ordinal > v_item.problem_count
            or slots.position < 0
            or slots.position >= v_item.problem_count
          )
      )
      or exists (
        select 1
        from public.assignment_problem_slots as slots
        where slots.assignment_item_id = v_item.id
        group by slots.assignment_item_id
        having pg_catalog.min(slots.position) <> 0
          or pg_catalog.max(slots.position) <> v_item.problem_count - 1
      )
    then
      raise exception using errcode = 'P0001', message = 'invalid_assignment_problem_slots';
    end if;
  end loop;

  return query
  select slots.assignment_item_id, slots.id, slots.position,
    slots.source_ordinal, slots.regeneration_seed, slots.locked,
    slots.slot_spec_version, slots.created_at, slots.updated_at
  from public.assignment_problem_slots as slots
  join public.assignment_items as ai on ai.id = slots.assignment_item_id
  where ai.assignment_id = p_assignment_id
  order by ai.position, slots.position;
end;
$$;

create function public.regenerate_assignment_problem_slot(p_slot_id uuid)
returns table (
  id uuid,
  assignment_item_id uuid,
  "position" smallint,
  source_ordinal smallint,
  regeneration_seed uuid,
  locked boolean,
  slot_spec_version smallint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_workspace_id uuid;
  v_status text;
  v_locked boolean;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select ai.assignment_id into v_assignment_id
  from public.assignment_problem_slots as slots
  join public.assignment_items as ai on ai.id = slots.assignment_item_id
  where slots.id = p_slot_id;
  if not found or not classroom_private.can_manage_assignment(v_assignment_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select c.workspace_id, a.status into v_workspace_id, v_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = v_assignment_id
  for update of a;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'published_content_immutable';
  end if;
  if not public.workspace_has_capability(v_workspace_id, 'advanced_assignment_editing') then
    raise exception using errcode = '42501', message = 'capability_required';
  end if;

  select slots.locked into v_locked
  from public.assignment_problem_slots as slots
  join public.assignment_items as ai on ai.id = slots.assignment_item_id
  where slots.id = p_slot_id and ai.assignment_id = v_assignment_id
  for update of slots;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_locked then
    raise exception using errcode = 'P0001', message = 'assignment_problem_slot_locked';
  end if;

  return query
  update public.assignment_problem_slots as slots
  set regeneration_seed = pg_catalog.gen_random_uuid()
  where slots.id = p_slot_id
  returning slots.id, slots.assignment_item_id, slots.position,
    slots.source_ordinal, slots.regeneration_seed, slots.locked,
    slots.slot_spec_version, slots.created_at, slots.updated_at;
end;
$$;

create function public.regenerate_unlocked_assignment_problem_slots(
  p_assignment_item_id uuid
)
returns table (
  id uuid,
  assignment_item_id uuid,
  "position" smallint,
  source_ordinal smallint,
  regeneration_seed uuid,
  locked boolean,
  slot_spec_version smallint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_workspace_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select ai.assignment_id into v_assignment_id
  from public.assignment_items as ai
  where ai.id = p_assignment_item_id;
  if not found or not classroom_private.can_manage_assignment(v_assignment_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select c.workspace_id, a.status into v_workspace_id, v_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = v_assignment_id
  for update of a;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'published_content_immutable';
  end if;
  if not public.workspace_has_capability(v_workspace_id, 'advanced_assignment_editing') then
    raise exception using errcode = '42501', message = 'capability_required';
  end if;
  if not exists (
    select 1 from public.assignment_items as ai
    where ai.id = p_assignment_item_id
      and ai.assignment_id = v_assignment_id
  ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return query
  update public.assignment_problem_slots as slots
  set regeneration_seed = pg_catalog.gen_random_uuid()
  where slots.assignment_item_id = p_assignment_item_id
    and not slots.locked
  returning slots.id, slots.assignment_item_id, slots.position,
    slots.source_ordinal, slots.regeneration_seed, slots.locked,
    slots.slot_spec_version, slots.created_at, slots.updated_at;
end;
$$;

create function public.set_assignment_problem_slot_locked(
  p_slot_id uuid,
  p_locked boolean
)
returns table (
  id uuid,
  assignment_item_id uuid,
  "position" smallint,
  source_ordinal smallint,
  regeneration_seed uuid,
  locked boolean,
  slot_spec_version smallint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_workspace_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_locked is null then
    raise exception using errcode = 'P0001', message = 'invalid_assignment_problem_slot_lock';
  end if;
  select ai.assignment_id into v_assignment_id
  from public.assignment_problem_slots as slots
  join public.assignment_items as ai on ai.id = slots.assignment_item_id
  where slots.id = p_slot_id;
  if not found or not classroom_private.can_manage_assignment(v_assignment_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select c.workspace_id, a.status into v_workspace_id, v_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = v_assignment_id
  for update of a;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'published_content_immutable';
  end if;
  if not public.workspace_has_capability(v_workspace_id, 'advanced_assignment_editing') then
    raise exception using errcode = '42501', message = 'capability_required';
  end if;

  return query
  update public.assignment_problem_slots as slots
  set locked = p_locked
  where slots.id = p_slot_id
  returning slots.id, slots.assignment_item_id, slots.position,
    slots.source_ordinal, slots.regeneration_seed, slots.locked,
    slots.slot_spec_version, slots.created_at, slots.updated_at;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
end;
$$;

create function public.reorder_assignment_problem_slots(
  p_assignment_item_id uuid,
  p_ordered_slot_ids uuid[]
)
returns table (
  id uuid,
  assignment_item_id uuid,
  "position" smallint,
  source_ordinal smallint,
  regeneration_seed uuid,
  locked boolean,
  slot_spec_version smallint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_workspace_id uuid;
  v_status text;
  v_requested_count integer;
  v_current_count integer;
  v_distinct_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select ai.assignment_id into v_assignment_id
  from public.assignment_items as ai
  where ai.id = p_assignment_item_id;
  if not found or not classroom_private.can_manage_assignment(v_assignment_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select c.workspace_id, a.status into v_workspace_id, v_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = v_assignment_id
  for update of a;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'published_content_immutable';
  end if;
  if not public.workspace_has_capability(v_workspace_id, 'advanced_assignment_editing') then
    raise exception using errcode = '42501', message = 'capability_required';
  end if;
  if not exists (
    select 1 from public.assignment_items as ai
    where ai.id = p_assignment_item_id
      and ai.assignment_id = v_assignment_id
  ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_requested_count := coalesce(pg_catalog.cardinality(p_ordered_slot_ids), 0);
  select pg_catalog.count(*)::integer into v_current_count
  from public.assignment_problem_slots as slots
  where slots.assignment_item_id = p_assignment_item_id;
  select pg_catalog.count(distinct requested.slot_id)::integer into v_distinct_count
  from pg_catalog.unnest(coalesce(p_ordered_slot_ids, array[]::uuid[]))
    as requested(slot_id);

  if v_requested_count <> v_current_count
    or v_distinct_count <> v_requested_count
    or exists (
      select 1
      from pg_catalog.unnest(coalesce(p_ordered_slot_ids, array[]::uuid[]))
        as requested(slot_id)
      left join public.assignment_problem_slots as slots
        on slots.id = requested.slot_id
        and slots.assignment_item_id = p_assignment_item_id
      where slots.id is null
    )
    or exists (
      select 1 from public.assignment_problem_slots as slots
      where slots.assignment_item_id = p_assignment_item_id
        and not (slots.id = any(coalesce(p_ordered_slot_ids, array[]::uuid[])))
    )
  then
    raise exception using errcode = 'P0001', message = 'invalid_assignment_problem_slot_order';
  end if;

  set constraints public.assignment_problem_slots_item_position_key deferred;
  with requested as (
    select request.slot_id, (request.ordinality - 1)::smallint as new_position
    from pg_catalog.unnest(p_ordered_slot_ids)
      with ordinality as request(slot_id, ordinality)
  )
  update public.assignment_problem_slots as slots
  set position = requested.new_position
  from requested
  where slots.id = requested.slot_id
    and slots.assignment_item_id = p_assignment_item_id;

  return query
  select slots.id, slots.assignment_item_id, slots.position,
    slots.source_ordinal, slots.regeneration_seed, slots.locked,
    slots.slot_spec_version, slots.created_at, slots.updated_at
  from public.assignment_problem_slots as slots
  where slots.assignment_item_id = p_assignment_item_id
  order by slots.position;
end;
$$;

revoke all on function public.prepare_assignment_problem_slots(uuid)
  from public, anon;
revoke all on function public.regenerate_assignment_problem_slot(uuid)
  from public, anon;
revoke all on function public.regenerate_unlocked_assignment_problem_slots(uuid)
  from public, anon;
revoke all on function public.set_assignment_problem_slot_locked(uuid, boolean)
  from public, anon;
revoke all on function public.reorder_assignment_problem_slots(uuid, uuid[])
  from public, anon;
grant execute on function public.prepare_assignment_problem_slots(uuid)
  to authenticated;
grant execute on function public.regenerate_assignment_problem_slot(uuid)
  to authenticated;
grant execute on function public.regenerate_unlocked_assignment_problem_slots(uuid)
  to authenticated;
grant execute on function public.set_assignment_problem_slot_locked(uuid, boolean)
  to authenticated;
grant execute on function public.reorder_assignment_problem_slots(uuid, uuid[])
  to authenticated;

-- Preserve Phase-7 duplication identity rules: new assignment/item/slot IDs,
-- fresh item generation seeds, copied display order and lock state, and no
-- copied regeneration seeds or result rows.
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

  insert into public.assignment_problem_slots (
    assignment_item_id, position, source_ordinal, regeneration_seed,
    locked, slot_spec_version
  )
  select copied_item.id, source_slot.position, source_slot.source_ordinal,
    null, source_slot.locked, source_slot.slot_spec_version
  from public.assignment_items as source_item
  join public.assignment_problem_slots as source_slot
    on source_slot.assignment_item_id = source_item.id
  join public.assignment_items as copied_item
    on copied_item.assignment_id = v_duplicate_id
    and copied_item.position = source_item.position
  where source_item.assignment_id = p_assignment_id;

  return v_duplicate_id;
end;
$$;

revoke all on function public.duplicate_assignment(uuid) from public, anon;
grant execute on function public.duplicate_assignment(uuid) to authenticated;
