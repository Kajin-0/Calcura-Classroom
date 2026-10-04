-- Permit the existing FK ON DELETE SET NULL action without permitting creator
-- reassignment, live-creator clearing, or any change to class scope/join code.
-- No data is rewritten, no RLS/grant is broadened, and INSERT is unchanged.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function classroom_private.protect_and_generate_class_fields()
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
    or new.join_code is distinct from old.join_code
    or (
      new.created_by is distinct from old.created_by
      and not (
        new.created_by is null
        and old.created_by is not null
        and not exists (select 1 from auth.users as u where u.id = old.created_by)
      )
    )
  then
    raise exception using errcode = '42501', message = 'immutable_class_scope';
  end if;
  return new;
end;
$$;

-- CREATE OR REPLACE preserves the existing authenticated trigger execution
-- grant. Reassert the denial to PUBLIC/anon without adding any privileges.
revoke all on function classroom_private.protect_and_generate_class_fields() from public, anon;
