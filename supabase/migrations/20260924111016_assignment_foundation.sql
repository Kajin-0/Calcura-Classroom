-- Phase 3 assignment foundation. Local only until the hosted Calcura schema
-- has been baselined and reconciled. Classroom stores practice intent only.

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_title_check check (
    title = pg_catalog.btrim(title, E' \t\n\r\f\v')
    and title ~ '[^[:space:]]'
    and char_length(title) between 1 and 160
  ),
  constraint assignments_status_check check (status in ('draft', 'published', 'archived')),
  constraint assignments_publication_check check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'archived') and published_at is not null)
  )
);

create index assignments_class_status_updated_idx
  on public.assignments (class_id, status, updated_at desc);
create index assignments_created_by_idx
  on public.assignments (created_by);

create table public.assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  position integer not null,
  activity_contract_version smallint not null default 1,
  activity_key text not null,
  problem_count smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_items_position_check check (position >= 0),
  constraint assignment_items_version_check check (activity_contract_version = 1),
  constraint assignment_items_activity_key_check check (activity_key in (
    'integration.basic_trig.v1',
    'integration.u_substitution.v1',
    'integration.log_u_substitution.v1',
    'integration.by_parts.v1',
    'integration.inverse_trig.v1',
    'integration.partial_fractions.v1'
  )),
  constraint assignment_items_problem_count_check check (problem_count between 1 and 20),
  constraint assignment_items_assignment_position_key
    unique (assignment_id, position) deferrable initially immediate
);

-- The unique constraint's left prefix serves assignment-item listing too.

create function classroom_private.assignment_insert_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  new.created_by := (select auth.uid());
  new.status := 'draft';
  new.published_at := null;
  return new;
end;
$$;

create function classroom_private.guard_assignment_item_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_status text;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.assignment_id is distinct from old.assignment_id
    then
      raise exception using errcode = '42501', message = 'immutable_assignment_item_scope';
    end if;
    v_assignment_id := old.assignment_id;
  elsif tg_op = 'DELETE' then
    v_assignment_id := old.assignment_id;
  else
    v_assignment_id := new.assignment_id;
  end if;

  select a.status into v_status
  from public.assignments as a
  where a.id = v_assignment_id
  for update;

  -- Parent cascades are allowed after the parent row has been removed. An
  -- ordinary item operation always has a live parent and must remain draft.
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    raise exception using errcode = '23503', message = 'assignment_not_found';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = '42501', message = 'published_content_immutable';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function classroom_private.can_create_assignment_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes as c
    join public.workspaces as w on w.id = c.workspace_id
    join public.workspace_members as wm on wm.workspace_id = w.id
    where c.id = p_class_id
      and c.status = 'active'
      and w.status = 'active'
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin', 'educator')
  );
$$;

create function classroom_private.can_manage_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments as a
    where a.id = p_assignment_id
      and classroom_private.is_class_staff(a.class_id)
  );
$$;

create function classroom_private.can_read_assignment(p_class_id uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select classroom_private.is_class_staff(p_class_id)
    or exists (
      select 1
      from public.classes as c
      join public.workspaces as w on w.id = c.workspace_id
      join public.class_enrollments as ce on ce.class_id = c.id
      where c.id = p_class_id
        and p_status = 'published'
        and c.status = 'active'
        and w.status = 'active'
        and ce.student_user_id = (select auth.uid())
        and ce.status = 'active'
    );
$$;

create function classroom_private.can_edit_assignment_items(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments as a
    where a.id = p_assignment_id
      and a.status = 'draft'
      and classroom_private.is_class_staff(a.class_id)
  );
$$;

create function public.publish_assignment(p_assignment_id uuid)
returns table (
  id uuid, class_id uuid, title text, due_at timestamptz, status text,
  published_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_class_status text;
  v_workspace_status text;
begin
  if (select auth.uid()) is null
    or not classroom_private.can_manage_assignment(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select a.status, c.status, w.status
    into v_status, v_class_status, v_workspace_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  join public.workspaces as w on w.id = c.workspace_id
  where a.id = p_assignment_id
  for update of a, c, w;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'invalid_assignment_transition';
  end if;
  if v_class_status <> 'active' or v_workspace_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'classroom_inactive';
  end if;
  if not exists (
    select 1 from public.assignment_items as ai
    where ai.assignment_id = p_assignment_id
  ) then
    raise exception using errcode = 'P0001', message = 'assignment_requires_items';
  end if;

  update public.assignments as a
  set status = 'published', published_at = pg_catalog.now()
  where a.id = p_assignment_id
  returning a.id, a.class_id, a.title, a.due_at, a.status,
    a.published_at, a.created_at, a.updated_at
  into id, class_id, title, due_at, status, published_at, created_at, updated_at;
  return next;
end;
$$;

create function public.archive_assignment(p_assignment_id uuid)
returns table (
  id uuid, class_id uuid, title text, due_at timestamptz, status text,
  published_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not classroom_private.can_manage_assignment(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  update public.assignments as a
  set status = 'archived'
  where a.id = p_assignment_id and a.status = 'published'
  returning a.id, a.class_id, a.title, a.due_at, a.status,
    a.published_at, a.created_at, a.updated_at
  into id, class_id, title, due_at, status, published_at, created_at, updated_at;
  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_assignment_transition';
  end if;
  return next;
end;
$$;

create function public.reactivate_assignment(p_assignment_id uuid)
returns table (
  id uuid, class_id uuid, title text, due_at timestamptz, status text,
  published_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not classroom_private.can_manage_assignment(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  update public.assignments as a
  set status = 'published'
  where a.id = p_assignment_id and a.status = 'archived'
  returning a.id, a.class_id, a.title, a.due_at, a.status,
    a.published_at, a.created_at, a.updated_at
  into id, class_id, title, due_at, status, published_at, created_at, updated_at;
  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_assignment_transition';
  end if;
  return next;
end;
$$;

create function public.discard_assignment(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null
    or not classroom_private.can_manage_assignment(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select a.status into v_status
  from public.assignments as a
  where a.id = p_assignment_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'only_drafts_can_be_discarded';
  end if;
  delete from public.assignments as a where a.id = p_assignment_id;
end;
$$;

create function public.reorder_assignment_items(
  p_assignment_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_current_count integer;
  v_requested_count integer;
  v_distinct_count integer;
begin
  if (select auth.uid()) is null
    or not classroom_private.can_edit_assignment_items(p_assignment_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  -- Serialize reordering with item inserts/updates/deletes, whose guard
  -- trigger takes the same parent-row lock before checking draft state.
  select a.status into v_status
  from public.assignments as a
  where a.id = p_assignment_id
  for update;
  if not found or v_status <> 'draft' then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_requested_count := coalesce(pg_catalog.cardinality(p_item_ids), 0);
  select count(*)::integer into v_current_count
  from public.assignment_items as ai
  where ai.assignment_id = p_assignment_id;
  select count(distinct requested.item_id)::integer into v_distinct_count
  from pg_catalog.unnest(coalesce(p_item_ids, array[]::uuid[])) as requested(item_id);

  if v_requested_count <> v_current_count or v_distinct_count <> v_requested_count
    or exists (
      select 1
      from pg_catalog.unnest(coalesce(p_item_ids, array[]::uuid[])) as requested(item_id)
      left join public.assignment_items as ai
        on ai.id = requested.item_id and ai.assignment_id = p_assignment_id
      where ai.id is null
    )
    or exists (
      select 1 from public.assignment_items as ai
      where ai.assignment_id = p_assignment_id
        and not (ai.id = any(coalesce(p_item_ids, array[]::uuid[])))
    )
  then
    raise exception using errcode = 'P0001', message = 'invalid_assignment_item_order';
  end if;

  set constraints public.assignment_items_assignment_position_key deferred;
  with requested as (
    select request.item_id, (request.ordinality - 1)::integer as new_position
    from pg_catalog.unnest(coalesce(p_item_ids, array[]::uuid[]))
      with ordinality as request(item_id, ordinality)
  )
  update public.assignment_items as ai
  set position = requested.new_position
  from requested
  where ai.id = requested.item_id and ai.assignment_id = p_assignment_id;
end;
$$;

create trigger assignments_insert_defaults
before insert on public.assignments
for each row execute function classroom_private.assignment_insert_defaults();

create trigger assignments_set_updated_at
before update on public.assignments
for each row execute function classroom_private.set_updated_at();

create trigger assignment_items_guard_content
before insert or update or delete on public.assignment_items
for each row execute function classroom_private.guard_assignment_item_content();

create trigger assignment_items_set_updated_at
before update on public.assignment_items
for each row execute function classroom_private.set_updated_at();

revoke all on function classroom_private.assignment_insert_defaults() from public, anon;
revoke all on function classroom_private.guard_assignment_item_content() from public, anon;
revoke all on function classroom_private.can_create_assignment_for_class(uuid) from public, anon;
revoke all on function classroom_private.can_manage_assignment(uuid) from public, anon;
revoke all on function classroom_private.can_read_assignment(uuid, text) from public, anon;
revoke all on function classroom_private.can_edit_assignment_items(uuid) from public, anon;
grant execute on function classroom_private.assignment_insert_defaults() to authenticated;
grant execute on function classroom_private.guard_assignment_item_content() to authenticated;
grant execute on function classroom_private.can_create_assignment_for_class(uuid) to authenticated;
grant execute on function classroom_private.can_manage_assignment(uuid) to authenticated;
grant execute on function classroom_private.can_read_assignment(uuid, text) to authenticated;
grant execute on function classroom_private.can_edit_assignment_items(uuid) to authenticated;

revoke all on function public.publish_assignment(uuid) from public, anon;
revoke all on function public.archive_assignment(uuid) from public, anon;
revoke all on function public.reactivate_assignment(uuid) from public, anon;
revoke all on function public.discard_assignment(uuid) from public, anon;
revoke all on function public.reorder_assignment_items(uuid, uuid[]) from public, anon;
grant execute on function public.publish_assignment(uuid) to authenticated;
grant execute on function public.archive_assignment(uuid) to authenticated;
grant execute on function public.reactivate_assignment(uuid) to authenticated;
grant execute on function public.discard_assignment(uuid) to authenticated;
grant execute on function public.reorder_assignment_items(uuid, uuid[]) to authenticated;

revoke all on table public.assignments from public, anon, authenticated;
revoke all on table public.assignment_items from public, anon, authenticated;

grant select (
  id, class_id, title, due_at, status, published_at, created_at, updated_at
) on public.assignments to authenticated;
grant insert (class_id, title, due_at) on public.assignments to authenticated;
grant update (title, due_at) on public.assignments to authenticated;

grant select (
  id, assignment_id, position, activity_contract_version, activity_key,
  problem_count, created_at, updated_at
) on public.assignment_items to authenticated;
grant insert (
  assignment_id, position, activity_contract_version, activity_key, problem_count
) on public.assignment_items to authenticated;
grant update (activity_contract_version, activity_key, problem_count)
  on public.assignment_items to authenticated;
grant delete on public.assignment_items to authenticated;

alter table public.assignments enable row level security;
alter table public.assignment_items enable row level security;

create policy assignments_select_staff_or_enrolled_student
  on public.assignments for select to authenticated
  using (classroom_private.can_read_assignment(class_id, status));

create policy assignments_insert_active_class_staff
  on public.assignments for insert to authenticated
  with check (
    classroom_private.can_create_assignment_for_class(class_id)
  );

create policy assignments_update_staff_metadata
  on public.assignments for update to authenticated
  using (classroom_private.can_manage_assignment(id))
  with check (classroom_private.can_manage_assignment(id));

create policy assignment_items_select_assignment_access
  on public.assignment_items for select to authenticated
  using (
    exists (
      select 1
      from public.assignments as a
      where a.id = assignment_id
    )
  );

create policy assignment_items_insert_drafts
  on public.assignment_items for insert to authenticated
  with check (classroom_private.can_edit_assignment_items(assignment_id));

create policy assignment_items_update_drafts
  on public.assignment_items for update to authenticated
  using (classroom_private.can_edit_assignment_items(assignment_id))
  with check (classroom_private.can_edit_assignment_items(assignment_id));

create policy assignment_items_delete_drafts
  on public.assignment_items for delete to authenticated
  using (classroom_private.can_edit_assignment_items(assignment_id));
