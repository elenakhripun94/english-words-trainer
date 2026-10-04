-- Count a viewed memorize card toward the result, including attempts saved before this fix.
-- Remove «Произнеси» from lessons so it no longer blocks completion.

create or replace view assignment_results
with (security_invoker = true) as
with base as (
  select
    a.id as assignment_id,
    a.lesson_id,
    a.student_id,
    s.name as student_name,
    a.revoked,
    a.opened_at,
    a.completed_at as assignment_completed_at,
    le.type as exercise,
    le.position as exercise_position,
    (select count(*) from lesson_items li where li.lesson_id = a.lesson_id) as item_count,
    exercise_available(a.lesson_id, le.type) as available,
    ep.started_at,
    ep.completed_at as exercise_completed_at,
    coalesce(ep.unsupported, false) as unsupported,
    case
      when coalesce(ep.unsupported, false) then 'unsupported'
      when ep.completed_at is not null then 'completed'
      when ep.started_at is not null or exists (
        select 1 from attempts att
        where att.assignment_id = a.id and att.exercise = le.type
      ) then 'in_progress'
      else 'not_opened'
    end as status,
    (
      select count(*)
      from (
        select distinct on (att.item_id) att.is_correct
        from attempts att
        where att.assignment_id = a.id
          and att.exercise = le.type
          and att.skipped = false
        order by att.item_id, att.created_at asc, att.id asc
      ) firsts
      where firsts.is_correct is true
         or (le.type = 'memorize' and firsts.is_correct is distinct from false)
    ) as first_try_correct,
    (
      select count(*)
      from attempts att
      where att.assignment_id = a.id and att.exercise = le.type and att.skipped = false
    ) as attempt_count,
    (
      select count(*)
      from attempts att
      where att.assignment_id = a.id and att.exercise = le.type and att.skipped = true
    ) as skip_count,
    (
      select coalesce(sum(att.duration_ms), 0)
      from attempts att
      where att.assignment_id = a.id and att.exercise = le.type
    ) as duration_ms
  from assignments a
  join students s on s.id = a.student_id
  join lesson_exercises le on le.lesson_id = a.lesson_id
  left join exercise_progress ep
    on ep.assignment_id = a.id and ep.exercise = le.type
)
select
  base.*,
  case
    when base.exercise = 'match_pairs' and base.item_count > 0
      then round(base.attempt_count::numeric / base.item_count, 2)
    else null
  end as moves_per_pair,
  case
    when base.exercise <> 'match_pairs' and base.item_count > 0
      then round(100.0 * base.first_try_correct / base.item_count)
    else null
  end as first_try_percent
from base;

revoke all on assignment_results from anon;
grant select on assignment_results to authenticated;

delete from lesson_exercises where type = 'pronounce';
