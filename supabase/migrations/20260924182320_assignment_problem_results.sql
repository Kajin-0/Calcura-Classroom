-- Phase 5: terminal assignment-slot evidence. Local only until the hosted
-- Calcura schema is baselined and reconciled.

create table public.assignment_problem_results (
  id uuid primary key default gen_random_uuid(),
  assignment_item_id uuid not null
    references public.assignment_items (id) on delete cascade,
  student_user_id uuid not null
    references auth.users (id) on delete cascade,
  problem_ordinal smallint not null,
  client_result_id text not null,
  client_timestamp_ms bigint not null,
  outcome text not null,
  attempts integer not null,
  surrenders integer not null,
  time_seconds integer not null,
  grade_points double precision,
  skill_id text not null,
  family text not null,
  variant text not null,
  technique text not null,
  source_difficulty text not null,
  tier smallint not null,
  schema_version smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint assignment_problem_results_slot_key
    unique (assignment_item_id, student_user_id, problem_ordinal),
  constraint assignment_problem_results_client_id_key
    unique (student_user_id, client_result_id),
  constraint assignment_problem_results_ordinal_check
    check (problem_ordinal between 1 and 20),
  constraint assignment_problem_results_client_id_check
    check (client_result_id = pg_catalog.btrim(client_result_id) and char_length(client_result_id) between 1 and 128),
  constraint assignment_problem_results_client_timestamp_check
    check (client_timestamp_ms > 0),
  constraint assignment_problem_results_outcome_check
    check (outcome in ('correct', 'surrendered')),
  constraint assignment_problem_results_attempts_check
    check (attempts >= 0),
  constraint assignment_problem_results_surrenders_check
    check (surrenders >= 0),
  constraint assignment_problem_results_time_check
    check (time_seconds >= 0),
  constraint assignment_problem_results_grade_points_check
    check (grade_points is null or (grade_points >= 0 and grade_points <= 100)),
  constraint assignment_problem_results_skill_id_check
    check (skill_id = pg_catalog.btrim(skill_id) and char_length(skill_id) between 1 and 160),
  constraint assignment_problem_results_family_check
    check (family = pg_catalog.btrim(family) and char_length(family) between 1 and 120),
  constraint assignment_problem_results_variant_check
    check (variant = pg_catalog.btrim(variant) and char_length(variant) between 1 and 120),
  constraint assignment_problem_results_technique_check
    check (technique = pg_catalog.btrim(technique) and char_length(technique) between 1 and 80),
  constraint assignment_problem_results_source_difficulty_check
    check (source_difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  constraint assignment_problem_results_tier_check
    check (tier in (1, 2, 3)),
  constraint assignment_problem_results_schema_version_check
    check (schema_version = 1)
);

create index assignment_problem_results_student_item_idx
  on public.assignment_problem_results (student_user_id, assignment_item_id, problem_ordinal);
create index assignment_problem_results_assignment_item_idx
  on public.assignment_problem_results (assignment_item_id);

alter table public.assignment_problem_results enable row level security;

create policy assignment_problem_results_select_own
  on public.assignment_problem_results for select to authenticated
  using (student_user_id = (select auth.uid()));

create function public.record_assignment_problem_result(
  p_assignment_item_id uuid,
  p_problem_ordinal smallint,
  p_client_result_id text,
  p_client_timestamp_ms bigint,
  p_outcome text,
  p_attempts integer,
  p_surrenders integer,
  p_time_seconds integer,
  p_grade_points double precision,
  p_skill_id text,
  p_family text,
  p_variant text,
  p_technique text,
  p_source_difficulty text,
  p_tier smallint,
  p_schema_version smallint default 1
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_problem_count smallint;
  v_assignment_status text;
  v_class_status text;
  v_workspace_status text;
  v_inserted_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  -- A previously accepted slot is an idempotent acknowledgement even if its
  -- assignment was subsequently archived. It is never overwritten.
  perform 1
  from public.assignment_problem_results as r
  where r.assignment_item_id = p_assignment_item_id
    and r.student_user_id = v_user_id
    and r.problem_ordinal = p_problem_ordinal;
  if found then
    return 'duplicate';
  end if;

  select ai.problem_count, a.status, c.status, w.status
    into v_problem_count, v_assignment_status, v_class_status, v_workspace_status
  from public.assignment_items as ai
  join public.assignments as a on a.id = ai.assignment_id
  join public.classes as c on c.id = a.class_id
  join public.workspaces as w on w.id = c.workspace_id
  where ai.id = p_assignment_item_id
  for share of a, c, w;

  if not found
    or v_problem_count is null
    or p_problem_ordinal is null
    or p_problem_ordinal < 1
    or p_problem_ordinal > v_problem_count
    or v_assignment_status <> 'published'
    or v_class_status <> 'active'
    or v_workspace_status <> 'active'
  then
    raise exception using errcode = 'P0001', message = 'assignment_unavailable';
  end if;

  perform 1
  from public.class_enrollments as ce
  join public.assignments as a on a.class_id = ce.class_id
  join public.assignment_items as ai on ai.assignment_id = a.id
  where ai.id = p_assignment_item_id
    and ce.student_user_id = v_user_id
    and ce.status = 'active'
  for share of ce;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  insert into public.assignment_problem_results (
    assignment_item_id, student_user_id, problem_ordinal, client_result_id,
    client_timestamp_ms, outcome, attempts, surrenders, time_seconds,
    grade_points, skill_id, family, variant, technique, source_difficulty,
    tier, schema_version
  ) values (
    p_assignment_item_id, v_user_id, p_problem_ordinal, p_client_result_id,
    p_client_timestamp_ms, p_outcome, p_attempts, p_surrenders, p_time_seconds,
    p_grade_points, p_skill_id, p_family, p_variant, p_technique,
    p_source_difficulty, p_tier, p_schema_version
  )
  on conflict do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return 'recorded';
  end if;

  perform 1
  from public.assignment_problem_results as r
  where r.assignment_item_id = p_assignment_item_id
    and r.student_user_id = v_user_id
    and r.problem_ordinal = p_problem_ordinal;
  if found then
    return 'duplicate';
  end if;

  -- The client id was reused for a different slot. Do not acknowledge it as
  -- success because that could discard a distinct pending result.
  raise exception using errcode = 'P0001', message = 'client_result_id_conflict';
end;
$$;

create function public.get_assignment_student_progress(p_assignment_id uuid)
returns table (
  student_user_id uuid,
  student_email text,
  completed_problem_count integer,
  total_problem_count integer,
  progress_status text,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_class_id uuid;
  v_workspace_id uuid;
  v_total integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select a.class_id, c.workspace_id
    into v_class_id, v_workspace_id
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = p_assignment_id;

  if not found or not exists (
    select 1
    from public.workspace_members as wm
    join public.workspaces as w on w.id = wm.workspace_id
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_caller_id
      and wm.role in ('owner', 'admin', 'educator')
      and w.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select coalesce(sum(ai.problem_count), 0)::integer into v_total
  from public.assignment_items as ai
  where ai.assignment_id = p_assignment_id;

  return query
  select
    ce.student_user_id,
    u.email::text,
    coalesce(progress.completed_count, 0)::integer,
    v_total,
    case
      when coalesce(progress.completed_count, 0) = 0 then 'not_started'
      when coalesce(progress.completed_count, 0) < v_total then 'in_progress'
      else 'completed'
    end,
    progress.last_activity_at
  from public.class_enrollments as ce
  join auth.users as u on u.id = ce.student_user_id
  left join lateral (
    select count(*)::integer as completed_count, max(r.created_at) as last_activity_at
    from public.assignment_problem_results as r
    join public.assignment_items as ai on ai.id = r.assignment_item_id
    where ai.assignment_id = p_assignment_id
      and r.student_user_id = ce.student_user_id
  ) as progress on true
  where ce.class_id = v_class_id
    and ce.status = 'active'
  order by u.email nulls last, ce.student_user_id;
end;
$$;

revoke all on table public.assignment_problem_results from public, anon, authenticated;
grant select on table public.assignment_problem_results to authenticated;

revoke all on function public.record_assignment_problem_result(
  uuid, smallint, text, bigint, text, integer, integer, integer, double precision,
  text, text, text, text, text, smallint, smallint
) from public, anon;
grant execute on function public.record_assignment_problem_result(
  uuid, smallint, text, bigint, text, integer, integer, integer, double precision,
  text, text, text, text, text, smallint, smallint
) to authenticated;

revoke all on function public.get_assignment_student_progress(uuid) from public, anon;
grant execute on function public.get_assignment_student_progress(uuid) to authenticated;
