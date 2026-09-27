-- Phase 8.5: one read-only, workspace-scoped teacher dashboard response.
-- It aggregates the existing terminal result contract and exposes no student
-- identity, generated mathematics, or new telemetry.

create function public.get_workspace_dashboard(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dashboard jsonb;
begin
  if (select auth.uid()) is null
    or not classroom_private.has_workspace_role(
      p_workspace_id, array['owner', 'admin', 'educator']
    )
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  with active_classes as (
    select c.id, c.name
    from public.classes as c
    where c.workspace_id = p_workspace_id
      and c.status = 'active'
  ),
  active_enrollments as (
    select ce.class_id, ce.student_user_id
    from public.class_enrollments as ce
    join active_classes as c on c.id = ce.class_id
    where ce.status = 'active'
  ),
  published_assignments as (
    select a.id, a.class_id, a.title, a.due_at, a.published_at
    from public.assignments as a
    join active_classes as c on c.id = a.class_id
    where a.status = 'published'
  ),
  assignment_problem_totals as (
    select a.id as assignment_id,
      coalesce(sum(ai.problem_count), 0)::integer as total_problem_count
    from published_assignments as a
    left join public.assignment_items as ai on ai.assignment_id = a.id
    group by a.id
  ),
  eligible_results as (
    select r.id, r.student_user_id, r.assignment_item_id,
      a.id as assignment_id, a.class_id, ai.activity_key,
      r.outcome, r.attempts, r.created_at
    from public.assignment_problem_results as r
    join public.assignment_items as ai on ai.id = r.assignment_item_id
    join published_assignments as a on a.id = ai.assignment_id
    join active_enrollments as e
      on e.class_id = a.class_id and e.student_user_id = r.student_user_id
  ),
  student_result_counts as (
    select r.assignment_id, r.student_user_id,
      count(*)::integer as completed_problem_count
    from eligible_results as r
    group by r.assignment_id, r.student_user_id
  ),
  assignment_students as (
    select a.id as assignment_id, e.student_user_id,
      t.total_problem_count,
      coalesce(r.completed_problem_count, 0) as completed_problem_count
    from published_assignments as a
    join active_enrollments as e on e.class_id = a.class_id
    join assignment_problem_totals as t on t.assignment_id = a.id
    left join student_result_counts as r
      on r.assignment_id = a.id and r.student_user_id = e.student_user_id
  ),
  assignment_progress as (
    select a.id as assignment_id,
      count(s.student_user_id)::integer as students_enrolled,
      count(s.student_user_id) filter (
        where s.completed_problem_count > 0
      )::integer as students_started,
      count(s.student_user_id) filter (
        where s.total_problem_count > 0
          and s.completed_problem_count >= s.total_problem_count
      )::integer as students_completed
    from published_assignments as a
    left join assignment_students as s on s.assignment_id = a.id
    group by a.id
  ),
  assignment_results as (
    select r.assignment_id,
      count(*)::integer as problems_completed,
      count(*) filter (where r.outcome = 'correct')::integer as problems_correct,
      count(*) filter (where r.outcome = 'surrendered')::integer as surrenders,
      avg(r.attempts) as average_attempts,
      max(r.created_at) as last_activity_at
    from eligible_results as r
    group by r.assignment_id
  ),
  assignment_rows as (
    select a.id, a.class_id, a.title, a.due_at, a.published_at,
      t.total_problem_count, p.students_enrolled, p.students_started,
      p.students_completed,
      case when p.students_enrolled = 0 then null
        else p.students_completed::numeric / p.students_enrolled end
        as completion_rate,
      coalesce(r.problems_completed, 0) as problems_completed,
      coalesce(r.problems_correct, 0) as problems_correct,
      case when coalesce(r.problems_completed, 0) = 0 then null
        else r.problems_correct::numeric / r.problems_completed end
        as accuracy,
      r.average_attempts, coalesce(r.surrenders, 0) as surrenders,
      r.last_activity_at
    from published_assignments as a
    join assignment_problem_totals as t on t.assignment_id = a.id
    join assignment_progress as p on p.assignment_id = a.id
    left join assignment_results as r on r.assignment_id = a.id
  ),
  class_enrollment_counts as (
    select c.id as class_id,
      count(e.student_user_id)::integer as students_enrolled
    from active_classes as c
    left join active_enrollments as e on e.class_id = c.id
    group by c.id
  ),
  class_rows as (
    select c.id, c.name, ec.students_enrolled,
      count(a.id)::integer as active_assignments,
      coalesce(sum(a.students_enrolled), 0)::integer
        as student_assignment_opportunities,
      coalesce(sum(a.students_completed), 0)::integer as students_completed,
      case when coalesce(sum(a.students_enrolled), 0) = 0 then null
        else sum(a.students_completed)::numeric / sum(a.students_enrolled) end
        as completion_rate,
      coalesce(sum(a.problems_completed), 0)::integer as problems_completed,
      coalesce(sum(a.problems_correct), 0)::integer as problems_correct,
      case when coalesce(sum(a.problems_completed), 0) = 0 then null
        else sum(a.problems_correct)::numeric / sum(a.problems_completed) end
        as accuracy,
      max(a.last_activity_at) as last_activity_at
    from active_classes as c
    join class_enrollment_counts as ec on ec.class_id = c.id
    left join assignment_rows as a on a.class_id = c.id
    group by c.id, c.name, ec.students_enrolled
  ),
  activity_rows as (
    select ai.activity_key,
      count(distinct ai.id)::integer as practice_blocks,
      count(r.id)::integer as problems_completed,
      count(r.id) filter (where r.outcome = 'correct')::integer
        as problems_correct,
      count(r.id) filter (where r.outcome = 'surrendered')::integer
        as surrenders,
      avg(r.attempts) as average_attempts
    from public.assignment_items as ai
    join published_assignments as a on a.id = ai.assignment_id
    left join eligible_results as r on r.assignment_item_id = ai.id
    group by ai.activity_key
  ),
  workspace_rollup as (
    select coalesce(sum(a.students_enrolled), 0)::integer
        as student_assignment_opportunities,
      coalesce(sum(a.students_completed), 0)::integer as students_completed,
      coalesce(sum(a.problems_completed), 0)::integer as problems_completed,
      coalesce(sum(a.problems_correct), 0)::integer as problems_correct
    from assignment_rows as a
  )
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'summary', (
      select pg_catalog.jsonb_build_object(
        'active_classes', (select count(*)::integer from active_classes),
        'students', (select count(distinct e.student_user_id)::integer
          from active_enrollments as e),
        'active_assignments', (select count(*)::integer from assignment_rows),
        'student_assignment_opportunities',
          w.student_assignment_opportunities,
        'students_completed', w.students_completed,
        'completion_rate', case
          when w.student_assignment_opportunities = 0 then null
          else w.students_completed::numeric /
            w.student_assignment_opportunities end,
        'problems_completed', w.problems_completed,
        'problems_correct', w.problems_correct,
        'accuracy', case when w.problems_completed = 0 then null
          else w.problems_correct::numeric / w.problems_completed end
      ) from workspace_rollup as w
    ),
    'classes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'class_id', c.id, 'name', c.name,
        'students_enrolled', c.students_enrolled,
        'active_assignments', c.active_assignments,
        'student_assignment_opportunities',
          c.student_assignment_opportunities,
        'students_completed', c.students_completed,
        'completion_rate', c.completion_rate,
        'problems_completed', c.problems_completed,
        'problems_correct', c.problems_correct,
        'accuracy', c.accuracy,
        'last_activity_at', c.last_activity_at
      ) order by c.name, c.id)
      from class_rows as c
    ), '[]'::jsonb),
    'assignments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'assignment_id', a.id, 'class_id', a.class_id,
        'title', a.title, 'due_at', a.due_at,
        'published_at', a.published_at,
        'total_problem_count', a.total_problem_count,
        'students_enrolled', a.students_enrolled,
        'students_started', a.students_started,
        'students_completed', a.students_completed,
        'completion_rate', a.completion_rate,
        'problems_completed', a.problems_completed,
        'problems_correct', a.problems_correct,
        'accuracy', a.accuracy,
        'average_attempts', a.average_attempts,
        'surrenders', a.surrenders,
        'last_activity_at', a.last_activity_at
      ) order by a.published_at desc nulls last, a.id)
      from assignment_rows as a
    ), '[]'::jsonb),
    'activities', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'activity_key', a.activity_key,
        'practice_blocks', a.practice_blocks,
        'problems_completed', a.problems_completed,
        'problems_correct', a.problems_correct,
        'accuracy', case when a.problems_completed = 0 then null
          else a.problems_correct::numeric / a.problems_completed end,
        'average_attempts', a.average_attempts,
        'surrenders', a.surrenders,
        'surrender_rate', case when a.problems_completed = 0 then null
          else a.surrenders::numeric / a.problems_completed end
      ) order by a.activity_key)
      from activity_rows as a
    ), '[]'::jsonb)
  ) into v_dashboard;

  return v_dashboard;
end;
$$;

revoke all on function public.get_workspace_dashboard(uuid) from public, anon;
grant execute on function public.get_workspace_dashboard(uuid) to authenticated;
