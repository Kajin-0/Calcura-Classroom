-- Phase 1 local foundation only. Do not deploy until Calcura's hosted schema is
-- baselined and reconciled. This migration creates only new Classroom objects.

create extension if not exists pgcrypto with schema extensions;

create schema classroom_private;
revoke all on schema classroom_private from public, anon, authenticated;
grant usage on schema classroom_private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_type text not null,
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  personal_owner_user_id uuid unique references auth.users (id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_type_check
    check (workspace_type in ('personal', 'organization')),
  constraint workspaces_status_check
    check (status in ('active', 'archived')),
  constraint workspaces_name_check
    check (
      name = pg_catalog.btrim(name, E' \t\n\r\f\v')
      and name ~ '[^[:space:]]'
      and char_length(name) between 1 and 120
    ),
  constraint workspaces_personal_owner_check
    check (
      (workspace_type = 'personal' and personal_owner_user_id is not null)
      or (workspace_type = 'organization' and personal_owner_user_id is null)
    )
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_role_check
    check (role in ('owner', 'admin', 'educator'))
);

create index workspace_members_user_workspace_idx
  on public.workspace_members (user_id, workspace_id);
create index workspace_members_workspace_role_idx
  on public.workspace_members (workspace_id, role);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  join_code text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_name_check
    check (
      name = pg_catalog.btrim(name, E' \t\n\r\f\v')
      and name ~ '[^[:space:]]'
      and char_length(name) between 1 and 120
    ),
  constraint classes_status_check
    check (status in ('active', 'archived')),
  constraint classes_join_code_check
    check (join_code ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$')
);

-- The workspace_id prefix also serves lookups by workspace alone.
create index classes_workspace_status_idx
  on public.classes (workspace_id, status);

create function classroom_private.generate_join_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_code text;
begin
  for v_attempt in 1..5 loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for v_position in 0..9 loop
      v_code := v_code || pg_catalog.substr(
        v_alphabet,
        (pg_catalog.get_byte(v_bytes, v_position) % pg_catalog.length(v_alphabet)) + 1,
        1
      );
    end loop;
    exit when not exists (
      select 1 from public.classes as c where c.join_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

alter table public.classes
  alter column join_code set default classroom_private.generate_join_code();

create table public.class_enrollments (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id, student_user_id),
  constraint class_enrollments_status_check
    check (status in ('active', 'removed'))
);

create index class_enrollments_student_class_idx
  on public.class_enrollments (student_user_id, class_id);
create index class_enrollments_class_status_idx
  on public.class_enrollments (class_id, status);

-- Policy helpers are private to the API configuration and derive the caller
-- from auth.uid(). Definer execution is needed to avoid policy self-recursion.
create function classroom_private.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as wm
    join public.workspaces as w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any (p_allowed_roles)
      and w.status = 'active'
  );
$$;

create function classroom_private.is_active_class_enrollee(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_enrollments as ce
    join public.classes as c on c.id = ce.class_id
    join public.workspaces as w on w.id = c.workspace_id
    where ce.class_id = p_class_id
      and ce.student_user_id = (select auth.uid())
      and ce.status = 'active'
      and w.status = 'active'
  );
$$;

create function classroom_private.is_class_staff(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes as c
    join public.workspace_members as wm on wm.workspace_id = c.workspace_id
    join public.workspaces as w on w.id = c.workspace_id
    where c.id = p_class_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin', 'educator')
      and w.status = 'active'
  );
$$;

create function classroom_private.normalize_join_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.upper(coalesce(p_code, '')),
    '[-[:space:]]',
    '',
    'g'
  );
$$;

create function classroom_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function classroom_private.protect_and_generate_class_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if tg_op = 'INSERT' then
    v_uid := (select auth.uid());
    if v_uid is null then
      raise exception using errcode = '42501', message = 'not_authorized';
    end if;

    new.created_by := v_uid;
    if new.join_code is null then
      new.join_code := classroom_private.generate_join_code();
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.created_by is distinct from old.created_by
    or new.join_code is distinct from old.join_code
  then
    raise exception using errcode = '42501', message = 'immutable_class_scope';
  end if;
  return new;
end;
$$;

create function public.ensure_personal_workspace()
returns table (
  workspace_id uuid,
  workspace_type text,
  name text,
  status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_workspace_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  insert into public.workspaces (
    workspace_type, name, created_by, personal_owner_user_id
  ) values (
    'personal', 'Personal workspace', v_uid, v_uid
  )
  on conflict (personal_owner_user_id) do nothing
  returning id into v_workspace_id;

  if v_workspace_id is null then
    select w.id into strict v_workspace_id
    from public.workspaces as w
    where w.personal_owner_user_id = v_uid;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_uid, 'owner')
  on conflict on constraint workspace_members_pkey do update
    set role = 'owner';

  return query
    select w.id, w.workspace_type, w.name, w.status
    from public.workspaces as w
    where w.id = v_workspace_id;
end;
$$;

create function public.get_class_join_code(p_class_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if not classroom_private.is_class_staff(p_class_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select c.join_code into strict v_code
  from public.classes as c
  where c.id = p_class_id;
  return v_code;
exception
  when no_data_found then
    raise exception using errcode = '42501', message = 'not_authorized';
end;
$$;

create function public.join_class_by_code(p_code text)
returns table (
  class_id uuid,
  class_name text,
  workspace_id uuid,
  enrollment_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text := classroom_private.normalize_join_code(p_code);
  v_class public.classes%rowtype;
  v_status text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if pg_catalog.length(v_code) <> 10
    or v_code !~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$'
  then
    raise exception using errcode = 'P0001', message = 'invalid_join_code';
  end if;

  select c.* into v_class
  from public.classes as c
  join public.workspaces as w on w.id = c.workspace_id
  where c.join_code = v_code
    and w.status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_join_code';
  end if;
  if v_class.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'class_archived';
  end if;

  insert into public.class_enrollments (class_id, student_user_id)
  values (v_class.id, v_uid)
  on conflict on constraint class_enrollments_pkey do update
    set status = 'active',
        joined_at = case
          when public.class_enrollments.status = 'removed'
            then pg_catalog.now()
          else public.class_enrollments.joined_at
        end,
        updated_at = pg_catalog.now()
  returning status into v_status;

  return query select v_class.id, v_class.name, v_class.workspace_id, v_status;
end;
$$;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function classroom_private.set_updated_at();

create trigger classes_protect_and_generate_fields
before insert or update on public.classes
for each row execute function classroom_private.protect_and_generate_class_fields();

create trigger classes_set_updated_at
before update on public.classes
for each row execute function classroom_private.set_updated_at();

create trigger class_enrollments_set_updated_at
before update on public.class_enrollments
for each row execute function classroom_private.set_updated_at();

revoke all on function classroom_private.has_workspace_role(uuid, text[]) from public;
revoke all on function classroom_private.is_active_class_enrollee(uuid) from public;
revoke all on function classroom_private.is_class_staff(uuid) from public;
revoke all on function classroom_private.normalize_join_code(text) from public;
revoke all on function classroom_private.generate_join_code() from public;
revoke all on function classroom_private.set_updated_at() from public;
revoke all on function classroom_private.protect_and_generate_class_fields() from public;
revoke all on function public.ensure_personal_workspace() from public;
revoke all on function public.get_class_join_code(uuid) from public;
revoke all on function public.join_class_by_code(text) from public;
revoke all on function classroom_private.has_workspace_role(uuid, text[]) from anon;
revoke all on function classroom_private.is_active_class_enrollee(uuid) from anon;
revoke all on function classroom_private.is_class_staff(uuid) from anon;
revoke all on function classroom_private.generate_join_code() from anon;
revoke all on function classroom_private.set_updated_at() from anon;
revoke all on function classroom_private.protect_and_generate_class_fields() from anon;
revoke all on function public.ensure_personal_workspace() from anon;
revoke all on function public.get_class_join_code(uuid) from anon;
revoke all on function public.join_class_by_code(text) from anon;
grant execute on function classroom_private.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function classroom_private.is_active_class_enrollee(uuid) to authenticated;
grant execute on function classroom_private.is_class_staff(uuid) to authenticated;
grant execute on function classroom_private.normalize_join_code(text) to authenticated;
grant execute on function classroom_private.generate_join_code() to authenticated;
grant execute on function classroom_private.set_updated_at() to authenticated;
grant execute on function classroom_private.protect_and_generate_class_fields() to authenticated;
grant execute on function public.ensure_personal_workspace() to authenticated;
grant execute on function public.get_class_join_code(uuid) to authenticated;
grant execute on function public.join_class_by_code(text) to authenticated;

revoke all on table public.workspaces from public, anon, authenticated;
revoke all on table public.workspace_members from public, anon, authenticated;
revoke all on table public.classes from public, anon, authenticated;
revoke all on table public.class_enrollments from public, anon, authenticated;

grant select on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select (
  id, workspace_id, name, status, created_at, updated_at
) on table public.classes to authenticated;
grant insert (workspace_id, name) on table public.classes to authenticated;
grant update (name, status) on table public.classes to authenticated;
grant select on table public.class_enrollments to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;

create policy workspaces_select_staff
  on public.workspaces for select to authenticated
  using (classroom_private.has_workspace_role(id, array['owner', 'admin', 'educator']));

create policy workspace_members_select_staff
  on public.workspace_members for select to authenticated
  using (classroom_private.has_workspace_role(workspace_id, array['owner', 'admin', 'educator']));

create policy classes_select_staff_or_enrollee
  on public.classes for select to authenticated
  using (
    classroom_private.has_workspace_role(workspace_id, array['owner', 'admin', 'educator'])
    or classroom_private.is_active_class_enrollee(id)
  );

create policy classes_insert_staff
  on public.classes for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and classroom_private.has_workspace_role(workspace_id, array['owner', 'admin', 'educator'])
  );

create policy classes_update_staff
  on public.classes for update to authenticated
  using (
    classroom_private.has_workspace_role(workspace_id, array['owner', 'admin', 'educator'])
  )
  with check (
    classroom_private.has_workspace_role(workspace_id, array['owner', 'admin', 'educator'])
  );

create policy class_enrollments_select_self_or_staff
  on public.class_enrollments for select to authenticated
  using (
    student_user_id = (select auth.uid())
    or classroom_private.is_class_staff(class_id)
  );
