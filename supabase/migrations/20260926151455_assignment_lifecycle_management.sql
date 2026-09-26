-- Phase 7: safe assignment duplication and deletion. Existing assignment
-- items remain immutable after publication; only title and due date are
-- editable metadata. Result history blocks deletion.

create or replace function public.get_assignment_delete_status(p_assignment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not classroom_private.can_manage_assignment(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return exists (
    select 1
    from public.assignment_items as ai
    join public.assignment_problem_results as r
      on r.assignment_item_id = ai.id
    where ai.assignment_id = p_assignment_id
  );
end;
$$;

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

  -- Hold a shared parent lock while copying so concurrent item edits/reorders
  -- cannot produce a partial or mixed duplicate.
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

  -- A copied assignment is a fresh draft; its old due date is intentionally
  -- omitted so the teacher can choose a new schedule.
  insert into public.assignments as created (class_id, title, due_at)
  values (
    v_class_id,
    pg_catalog.left(v_source_title, 153) || ' (Copy)',
    null
  )
  returning created.id into v_duplicate_id;

  insert into public.assignment_items (
    assignment_id, position, activity_contract_version, activity_key,
    problem_count
  )
  select
    v_duplicate_id, ai.position, ai.activity_contract_version, ai.activity_key,
    ai.problem_count
  from public.assignment_items as ai
  where ai.assignment_id = p_assignment_id
  order by ai.position;

  return v_duplicate_id;
end;
$$;

create or replace function public.delete_assignment(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  -- The result-recording RPC takes a share lock on this same assignment row.
  -- This serializes deletion against a result being committed after the UI's
  -- eligibility check.
  perform 1
  from public.assignments as a
  where a.id = p_assignment_id
    and classroom_private.can_manage_assignment(a.id)
  for update of a;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if exists (
    select 1
    from public.assignment_items as ai
    join public.assignment_problem_results as r
      on r.assignment_item_id = ai.id
    where ai.assignment_id = p_assignment_id
  ) then
    raise exception using errcode = 'P0001', message = 'assignment_has_results';
  end if;

  delete from public.assignments as a
  where a.id = p_assignment_id;
end;
$$;

revoke all on function public.get_assignment_delete_status(uuid)
  from public, anon;
revoke all on function public.duplicate_assignment(uuid)
  from public, anon;
revoke all on function public.delete_assignment(uuid)
  from public, anon;
grant execute on function public.get_assignment_delete_status(uuid)
  to authenticated;
grant execute on function public.duplicate_assignment(uuid)
  to authenticated;
grant execute on function public.delete_assignment(uuid)
  to authenticated;
