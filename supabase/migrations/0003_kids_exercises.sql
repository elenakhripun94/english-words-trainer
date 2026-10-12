-- Picture-and-sound exercises for children who cannot read yet.
-- Enum values live in their own migration: Postgres cannot use a new value in the transaction that adds it.

alter type exercise_type add value if not exists 'listen_find';
alter type exercise_type add value if not exists 'memory_images';
alter type exercise_type add value if not exists 'feed';
alter type exercise_type add value if not exists 'true_false';
alter type exercise_type add value if not exists 'whats_missing';
alter type exercise_type add value if not exists 'balloons';
alter type exercise_type add value if not exists 'sort_groups';
alter type exercise_type add value if not exists 'shadow';
alter type exercise_type add value if not exists 'repeat';
alter type exercise_type add value if not exists 'puzzle';

-- A lesson for pre-readers hides written words and skips exercises that need reading.
alter table lessons add column if not exists no_text boolean not null default false;

-- Group for «Разложи по группам»: an id from src/lib/categories.ts.
alter table lesson_items add column if not exists category text;

-- The teacher can now add and remove words in a published lesson.
drop trigger if exists lesson_items_guard on lesson_items;
drop function if exists guard_published_items();
