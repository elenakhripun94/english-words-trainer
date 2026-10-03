-- English Words Trainer: schema, row level security, student RPCs, storage.

create extension if not exists pgcrypto;

create type exercise_type as enum (
  'memorize',
  'pick_word',
  'pick_image',
  'match_pairs',
  'pick_translation',
  'spell',
  'dictation',
  'pronounce'
);

create type lesson_status as enum ('draft', 'published', 'archived');

create table lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  title text not null,
  topic text,
  description text,
  level text,
  status lesson_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lesson_items (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  position int not null,
  term text not null,
  translation text,
  phonetic text,
  audio_url text,
  image_path text,
  image_source text,
  image_source_url text,
  image_author text,
  image_license text,
  created_at timestamptz not null default now()
);

create table lesson_exercises (
  lesson_id uuid not null references lessons (id) on delete cascade,
  type exercise_type not null,
  position int not null,
  settings jsonb not null default '{}',
  primary key (lesson_id, type)
);

create table students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  revoked boolean not null default false,
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table attempts (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references assignments (id) on delete cascade,
  exercise exercise_type not null,
  item_id uuid not null references lesson_items (id) on delete cascade,
  chosen_item_id uuid references lesson_items (id) on delete cascade,
  answer_text text,
  is_correct boolean,
  skipped boolean not null default false,
  duration_ms int,
  created_at timestamptz not null default now()
);

create table exercise_progress (
  assignment_id uuid not null references assignments (id) on delete cascade,
  exercise exercise_type not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unsupported boolean not null default false,
  primary key (assignment_id, exercise)
);

create table image_search_cache (
  query text not null,
  page int not null default 1,
  results jsonb not null,
  created_at timestamptz not null default now(),
  primary key (query, page)
);

create index lesson_items_lesson_position_idx on lesson_items (lesson_id, position);
create index assignments_lesson_idx on assignments (lesson_id);
create index attempts_lookup_idx on attempts (assignment_id, exercise, item_id, created_at);

-- Mirrors src/lib/answers.ts normalizeAnswer. Keep the two in sync.
create function normalize_answer(t text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(t, ''), $src$’‘`´$src$, $dst$''''$dst$)),
        '[.!?]+\s*$',
        ''
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

create function exercise_available(p_lesson_id uuid, p_type exercise_type)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_type in ('pick_word', 'pick_image') then
      (select count(*) >= 2 from lesson_items where lesson_id = p_lesson_id)
    when p_type = 'match_pairs' then
      (select count(*) >= 3 from lesson_items where lesson_id = p_lesson_id)
    when p_type = 'pick_translation' then
      (
        select count(*) >= 2
          and coalesce(bool_and(length(trim(coalesce(translation, ''))) > 0), false)
        from lesson_items
        where lesson_id = p_lesson_id
      )
    else true
  end
$$;

create function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lessons_touch
before update on lessons
for each row execute function touch_updated_at();

create function touch_lesson()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update lessons
  set updated_at = now()
  where id = coalesce(new.lesson_id, old.lesson_id);
  return null;
end;
$$;

create trigger lesson_items_touch
after insert or update or delete on lesson_items
for each row execute function touch_lesson();

create trigger lesson_exercises_touch
after insert or update or delete on lesson_exercises
for each row execute function touch_lesson();

create function guard_published_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  lid uuid;
  lesson_state lesson_status;
begin
  lid := case when tg_op = 'DELETE' then old.lesson_id else new.lesson_id end;
  select status into lesson_state from lessons where id = lid;
  if lesson_state in ('published', 'archived') then
    raise exception 'published_lesson_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger lesson_items_guard
before insert or delete on lesson_items
for each row execute function guard_published_items();

create function guard_publish()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if not exists (select 1 from lesson_items where lesson_id = new.id) then
      raise exception 'lesson_has_no_items' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from lesson_items
      where lesson_id = new.id and (image_path is null or length(trim(image_path)) = 0)
    ) then
      raise exception 'items_missing_images' using errcode = 'P0001';
    end if;
    if not exists (select 1 from lesson_exercises where lesson_id = new.id) then
      raise exception 'lesson_has_no_exercises' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger lessons_guard_publish
before update on lessons
for each row execute function guard_publish();

alter table lessons enable row level security;
alter table lesson_items enable row level security;
alter table lesson_exercises enable row level security;
alter table students enable row level security;
alter table assignments enable row level security;
alter table attempts enable row level security;
alter table exercise_progress enable row level security;
alter table image_search_cache enable row level security;

create policy lessons_owner on lessons
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy students_owner on students
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy lesson_items_owner on lesson_items
for all to authenticated
using (
  exists (
    select 1 from lessons l
    where l.id = lesson_id and l.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from lessons l
    where l.id = lesson_id and l.owner_id = auth.uid()
  )
);

create policy lesson_exercises_owner on lesson_exercises
for all to authenticated
using (
  exists (
    select 1 from lessons l
    where l.id = lesson_id and l.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from lessons l
    where l.id = lesson_id and l.owner_id = auth.uid()
  )
);

create policy assignments_owner on assignments
for all to authenticated
using (
  exists (
    select 1 from lessons l
    where l.id = lesson_id and l.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from lessons l
    where l.id = lesson_id and l.owner_id = auth.uid()
  )
  and exists (
    select 1 from students s
    where s.id = student_id and s.owner_id = auth.uid()
  )
);

create policy attempts_select on attempts
for select to authenticated
using (
  exists (
    select 1
    from assignments a
    join lessons l on l.id = a.lesson_id
    where a.id = assignment_id and l.owner_id = auth.uid()
  )
);

create policy exercise_progress_select on exercise_progress
for select to authenticated
using (
  exists (
    select 1
    from assignments a
    join lessons l on l.id = a.lesson_id
    where a.id = assignment_id and l.owner_id = auth.uid()
  )
);

revoke all on table image_search_cache from anon, authenticated;

create function get_assignment(p_token text)
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
      'level', v_lesson.level
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

create function submit_answer(
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

  select term into v_term
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
    when p_skipped or p_exercise = 'memorize' then null
    when p_exercise in ('pick_word', 'pick_image', 'pick_translation', 'match_pairs')
      then p_chosen_item_id is not null and p_item_id = p_chosen_item_id
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

create function complete_exercise(
  p_token text,
  p_exercise exercise_type,
  p_unsupported boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
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

  if not exists (
    select 1 from lesson_exercises
    where lesson_id = v_assignment.lesson_id and type = p_exercise
  ) then
    raise exception 'exercise_not_in_lesson' using errcode = 'P0001';
  end if;

  insert into exercise_progress (assignment_id, exercise, completed_at, unsupported)
  values (v_assignment.id, p_exercise, now(), coalesce(p_unsupported, false))
  on conflict (assignment_id, exercise) do update
  set completed_at = now(),
      unsupported = exercise_progress.unsupported or excluded.unsupported;

  if not exists (
    select 1
    from lesson_exercises le
    where le.lesson_id = v_assignment.lesson_id
      and exercise_available(le.lesson_id, le.type)
      and not exists (
        select 1 from exercise_progress ep
        where ep.assignment_id = v_assignment.id
          and ep.exercise = le.type
          and ep.completed_at is not null
      )
  ) then
    update assignments
    set completed_at = now()
    where id = v_assignment.id and completed_at is null;
  end if;
end;
$$;

revoke all on function normalize_answer(text) from public;
revoke all on function exercise_available(uuid, exercise_type) from public;
revoke all on function get_assignment(text) from public;
revoke all on function submit_answer(text, exercise_type, uuid, uuid, text, boolean, int) from public;
revoke all on function complete_exercise(text, exercise_type, boolean) from public;

grant execute on function exercise_available(uuid, exercise_type) to authenticated;
grant execute on function get_assignment(text) to anon, authenticated;
grant execute on function submit_answer(text, exercise_type, uuid, uuid, text, boolean, int) to anon, authenticated;
grant execute on function complete_exercise(text, exercise_type, boolean) to anon, authenticated;

create view assignment_results
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

insert into storage.buckets (id, name, public)
values ('lesson-images', 'lesson-images', true)
on conflict (id) do update set public = true;

create policy lesson_images_public_read on storage.objects
for select to public
using (bucket_id = 'lesson-images');

create policy lesson_images_auth_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'lesson-images');

create policy lesson_images_auth_update on storage.objects
for update to authenticated
using (bucket_id = 'lesson-images');

create policy lesson_images_auth_delete on storage.objects
for delete to authenticated
using (bucket_id = 'lesson-images');
