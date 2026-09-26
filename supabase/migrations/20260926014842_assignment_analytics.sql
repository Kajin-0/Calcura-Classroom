-- Phase 6: staff-only aggregate analytics over the existing Phase-5 result
-- contract. No new student telemetry or generated mathematics is stored.

create function public.get_assignment_analytics(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_class_id uuid;
  v_workspace_id uuid;
  v_assignment_status text;
  v_analytics jsonb;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select a.class_id, c.workspace_id, a.status
    into v_class_id, v_workspace_id, v_assignment_status
  from public.assignments as a
  join public.classes as c on c.id = a.class_id
  where a.id = p_assignment_id;

  if not found
    or v_assignment_status not in ('published', 'archived')
    or not exists (
      select 1
      from public.workspace_members as wm
      join public.workspaces as w on w.id = wm.workspace_id
      where wm.workspace_id = v_workspace_id
        and wm.user_id = v_caller_id
        and wm.role in ('owner', 'admin', 'educator')
        and w.status = 'active'
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  with active_students as (
    select ce.student_user_id, u.email::text as student_email
    from public.class_enrollments as ce
    join auth.users as u on u.id = ce.student_user_id
    where ce.class_id = v_class_id
      and ce.status = 'active'
  ),
  assignment_items as (
    select ai.id, ai.position, ai.activity_contract_version,
      ai.activity_key, ai.problem_count
    from public.assignment_items as ai
    where ai.assignment_id = p_assignment_id
  ),
  result_rows as (
    select r.id, r.assignment_item_id, r.student_user_id,
      r.problem_ordinal, r.outcome, r.attempts, r.time_seconds, r.created_at
    from public.assignment_problem_results as r
    join assignment_items as ai on ai.id = r.assignment_item_id
    join active_students as s on s.student_user_id = r.student_user_id
  ),
  total_problems as (
    select coalesce(sum(ai.problem_count), 0)::integer as problem_count
    from assignment_items as ai
  ),
  student_stats as (
    select s.student_user_id, s.student_email,
      count(r.id)::integer as completed_problem_count,
      t.problem_count as total_problem_count,
      count(r.id) filter (where r.outcome = 'correct')::integer as correct_count,
      count(r.id) filter (where r.outcome = 'surrendered')::integer as surrendered_count,
      avg(r.attempts) as average_attempts,
      avg(r.time_seconds) as average_time_seconds,
      max(r.created_at) as last_activity_at
    from active_students as s
    cross join total_problems as t
    left join result_rows as r on r.student_user_id = s.student_user_id
    group by s.student_user_id, s.student_email, t.problem_count
  ),
  result_totals as (
    select count(*)::integer as completed_count,
      count(*) filter (where r.outcome = 'correct')::integer as correct_count,
      count(*) filter (where r.outcome = 'surrendered')::integer as surrendered_count,
      avg(r.attempts) as average_attempts,
      avg(r.time_seconds) as average_time_seconds
    from result_rows as r
  ),
  student_totals as (
    select count(*)::integer as enrolled_count,
      count(*) filter (where s.completed_problem_count > 0)::integer as started_count,
      count(*) filter (
        where s.total_problem_count > 0
          and s.completed_problem_count >= s.total_problem_count
      )::integer as completed_count,
      coalesce(sum(s.total_problem_count), 0)::integer as assigned_slot_count
    from student_stats as s
  ),
  activity_stats as (
    select ai.id as assignment_item_id, ai.position,
      ai.activity_contract_version, ai.activity_key, ai.problem_count,
      (ai.problem_count * (select count(*)::integer from active_students))::integer
        as assigned_slot_count,
      count(r.id)::integer as completed_problem_count,
      count(r.id) filter (where r.outcome = 'correct')::integer as correct_count,
      count(r.id) filter (where r.outcome = 'surrendered')::integer as surrendered_count,
      avg(r.attempts) as average_attempts,
      avg(r.time_seconds) as average_time_seconds
    from assignment_items as ai
    left join result_rows as r on r.assignment_item_id = ai.id
    group by ai.id, ai.position, ai.activity_contract_version,
      ai.activity_key, ai.problem_count
  ),
  position_stats as (
    select ai.id as assignment_item_id, positions.problem_ordinal::integer
        as problem_ordinal,
      count(r.id)::integer as completed_problem_count,
      count(r.id) filter (where r.outcome = 'correct')::integer as correct_count,
      count(r.id) filter (where r.outcome = 'surrendered')::integer as surrendered_count,
      avg(r.attempts) as average_attempts,
      avg(r.time_seconds) as average_time_seconds
    from assignment_items as ai
    cross join lateral pg_catalog.generate_series(1, ai.problem_count)
      as positions(problem_ordinal)
    left join result_rows as r
      on r.assignment_item_id = ai.id
      and r.problem_ordinal = positions.problem_ordinal
    group by ai.id, positions.problem_ordinal
  )
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'summary', (
      select pg_catalog.jsonb_build_object(
        'students_enrolled', st.enrolled_count,
        'students_started', st.started_count,
        'students_completed', st.completed_count,
        'completion_rate', case when st.enrolled_count = 0 then null
          else st.completed_count::numeric / st.enrolled_count end,
        'total_assigned_problem_slots', st.assigned_slot_count,
        'problems_completed', rt.completed_count,
        'problems_correct', rt.correct_count,
        'accuracy', case when rt.completed_count = 0 then null
          else rt.correct_count::numeric / rt.completed_count end,
        'average_attempts', rt.average_attempts,
        'average_time_seconds', rt.average_time_seconds,
        'surrenders', rt.surrendered_count,
        'surrender_rate', case when rt.completed_count = 0 then null
          else rt.surrendered_count::numeric / rt.completed_count end
      )
      from student_totals as st
      cross join result_totals as rt
    ),
    'activities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'assignment_item_id', ast.assignment_item_id,
          'position', ast.position,
          'activity_contract_version', ast.activity_contract_version,
          'activity_key', ast.activity_key,
          'problem_count', ast.problem_count,
          'assigned_problem_slots', ast.assigned_slot_count,
          'problems_completed', ast.completed_problem_count,
          'problems_correct', ast.correct_count,
          'accuracy', case when ast.completed_problem_count = 0 then null
            else ast.correct_count::numeric / ast.completed_problem_count end,
          'average_attempts', ast.average_attempts,
          'average_time_seconds', ast.average_time_seconds,
          'surrenders', ast.surrendered_count,
          'surrender_rate', case when ast.completed_problem_count = 0 then null
            else ast.surrendered_count::numeric / ast.completed_problem_count end,
          'problem_positions', coalesce(position_rows.values, '[]'::jsonb)
        ) order by ast.position
      )
      from activity_stats as ast
      left join lateral (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'problem_ordinal', ps.problem_ordinal,
            'problems_completed', ps.completed_problem_count,
            'problems_correct', ps.correct_count,
            'accuracy', case when ps.completed_problem_count = 0 then null
              else ps.correct_count::numeric / ps.completed_problem_count end,
            'average_attempts', ps.average_attempts,
            'average_time_seconds', ps.average_time_seconds,
            'surrenders', ps.surrendered_count
          ) order by ps.problem_ordinal
        ) as values
        from position_stats as ps
        where ps.assignment_item_id = ast.assignment_item_id
      ) as position_rows on true
    ), '[]'::jsonb),
    'students', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'student_user_id', s.student_user_id,
          'student_email', s.student_email,
          'completed_problem_count', s.completed_problem_count,
          'total_problem_count', s.total_problem_count,
          'progress_status', case
            when s.completed_problem_count = 0 then 'not_started'
            when s.total_problem_count > 0
              and s.completed_problem_count >= s.total_problem_count then 'completed'
            else 'in_progress'
          end,
          'problems_correct', s.correct_count,
          'accuracy', case when s.completed_problem_count = 0 then null
            else s.correct_count::numeric / s.completed_problem_count end,
          'average_attempts', s.average_attempts,
          'average_time_seconds', s.average_time_seconds,
          'surrenders', s.surrendered_count,
          'surrender_rate', case when s.completed_problem_count = 0 then null
            else s.surrendered_count::numeric / s.completed_problem_count end,
          'last_activity_at', s.last_activity_at
        ) order by s.student_email nulls last, s.student_user_id
      )
      from student_stats as s
    ), '[]'::jsonb)
  ) into v_analytics;

  return v_analytics;
end;
$$;

revoke all on function public.get_assignment_analytics(uuid) from public, anon;
grant execute on function public.get_assignment_analytics(uuid) to authenticated;
