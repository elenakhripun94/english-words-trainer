-- Server rules for the picture-and-sound exercises and the no-text lesson mode.
-- Mirrors src/lib/exercises.ts. Keep the two in sync.

create or replace function exercise_available(p_lesson_id uuid, p_type exercise_type)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_type::text in ('pick_word', 'pick_translation', 'spell', 'dictation', 'pronounce')
      and coalesce((select no_text from lessons where id = p_lesson_id), false) then false
    when p_type::text in ('pick_word', 'pick_image', 'listen_find', 'feed', 'true_false', 'balloons', 'shadow') then
      (select count(*) >= 2 from lesson_items where lesson_id = p_lesson_id)
    when p_type::text in ('match_pairs', 'memory_images') then
      (select count(*) >= 3 from lesson_items where lesson_id = p_lesson_id)
    when p_type::text = 'whats_missing' then
      (select count(*) >= 4 from lesson_items where lesson_id = p_lesson_id)
    when p_type::text = 'sort_groups' then
      (
        select count(distinct category) >= 2
        from lesson_items
        where lesson_id = p_lesson_id and length(trim(coalesce(category, ''))) > 0
      )
    when p_type::text = 'pick_translation' then
      (
        select count(*) >= 2
          and coalesce(bool_and(length(trim(coalesce(translation, ''))) > 0), false)
        from lesson_items
        where lesson_id = p_lesson_id
      )
    else true
  end
$$;

create or replace function get_assignment(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_student_name text;
  v_lesson lessons%rowtype;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  select * into v_assignment
  from assignments
  where token = p_token and revoked = false;

  if not found then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  if v_assignment.opened_at is null then
    update assignments set opened_at = now() where id = v_assignment.id;
    v_assignment.opened_at = now();
  end if;

  select * into v_lesson from lessons where id = v_assignment.lesson_id;
  select name into v_student_name from students where id = v_assignment.student_id;

  return jsonb_build_object(
    'student_name', v_student_name,
    'opened_at', v_assignment.opened_at,
    'completed_at', v_assignment.completed_at,
    'lesson', jsonb_build_object(
      'id', v_lesson.id,
      'title', v_lesson.title,
      'topic', v_lesson.topic,
      'description', v_lesson.description,
      'level', v_lesson.level,
      'no_text', v_lesson.no_text
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', li.id,
          'term', li.term,
          'phonetic', li.phonetic,
          'audio_url', li.audio_url,
          'image_url', li.image_path,
          'translation', li.translation,
          'category', li.category,
          'image_author', li.image_author,
          'image_license', li.image_license,
          'image_source_url', li.image_source_url,
          'position', li.position
        )
        order by li.position
      )
      from lesson_items li
      where li.lesson_id = v_lesson.id
    ), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type', le.type,
          'position', le.position,
          'settings', le.settings,
          'available', exercise_available(v_lesson.id, le.type)
        )
        order by le.position
      )
      from lesson_exercises le
      where le.lesson_id = v_lesson.id
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'exercise', ep.exercise,
          'completed_at', ep.completed_at,
          'unsupported', ep.unsupported
        )
      )
      from exercise_progress ep
      where ep.assignment_id = v_assignment.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function submit_answer(
  p_token text,
  p_exercise exercise_type,
  p_item_id uuid,
  p_chosen_item_id uuid default null,
  p_answer_text text default null,
  p_skipped boolean default false,
  p_duration_ms int default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_term text;
  v_category text;
  v_correct boolean;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  select * into v_assignment
  from assignments
  where token = p_token and revoked = false;

  if not found then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  if (select count(*) from attempts where assignment_id = v_assignment.id) >= 2000 then
    raise exception 'attempt_limit' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from lesson_exercises
    where lesson_id = v_assignment.lesson_id and type = p_exercise
  ) then
    raise exception 'exercise_not_in_lesson' using errcode = 'P0001';
  end if;

  select term, category into v_term, v_category
  from lesson_items
  where id = p_item_id and lesson_id = v_assignment.lesson_id;

  if v_term is null then
    raise exception 'item_not_in_lesson' using errcode = 'P0001';
  end if;

  if p_chosen_item_id is not null and not exists (
    select 1 from lesson_items
    where id = p_chosen_item_id and lesson_id = v_assignment.lesson_id
  ) then
    raise exception 'choice_not_in_lesson' using errcode = 'P0001';
  end if;

  v_correct := case
    when p_skipped then null
    when p_exercise::text in ('memorize', 'repeat', 'puzzle') then true
    when p_exercise::text in (
      'pick_word', 'pick_image', 'pick_translation', 'match_pairs',
      'listen_find', 'memory_images', 'feed', 'balloons', 'whats_missing', 'shadow'
    )
      then p_chosen_item_id is not null and p_item_id = p_chosen_item_id
    -- The item is the picture, the chosen item is the word that sounded, the answer is yes or no.
    when p_exercise::text = 'true_false'
      then p_chosen_item_id is not null
        and p_answer_text in ('yes', 'no')
        and (p_item_id = p_chosen_item_id) = (p_answer_text = 'yes')
    when p_exercise::text = 'sort_groups'
      then normalize_answer(p_answer_text) = normalize_answer(v_category)
    else normalize_answer(p_answer_text) = normalize_answer(v_term)
  end;

  insert into attempts (
    assignment_id, exercise, item_id, chosen_item_id, answer_text, is_correct, skipped, duration_ms
  ) values (
    v_assignment.id, p_exercise, p_item_id, p_chosen_item_id, p_answer_text, v_correct, coalesce(p_skipped, false), p_duration_ms
  );

  insert into exercise_progress (assignment_id, exercise)
  values (v_assignment.id, p_exercise)
  on conflict (assignment_id, exercise) do nothing;

  return v_correct;
end;
$$;

-- «Мемори из картинок» is scored in moves per pair, like «Найди пары».
-- «Разложи по группам» only uses words that have a group.
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
    (
      select count(*) from lesson_items li
      where li.lesson_id = a.lesson_id
        and (le.type::text <> 'sort_groups' or length(trim(coalesce(li.category, ''))) > 0)
    ) as item_count,
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
    when base.exercise::text in ('match_pairs', 'memory_images') and base.item_count > 0
      then round(base.attempt_count::numeric / base.item_count, 2)
    else null
  end as moves_per_pair,
  case
    when base.exercise::text not in ('match_pairs', 'memory_images') and base.item_count > 0
      then round(100.0 * base.first_try_correct / base.item_count)
    else null
  end as first_try_percent
from base;

revoke all on assignment_results from anon;
grant select on assignment_results to authenticated;
