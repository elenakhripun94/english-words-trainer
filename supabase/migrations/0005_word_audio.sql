-- Word audio generated in the teacher's browser (Kokoro) and stored like pictures.
-- audio_source: 'kokoro:<voice>' for a generated file, 'dictionary' for a recording from dictionaryapi.dev.

alter table lesson_items add column if not exists audio_source text;

update lesson_items set audio_source = 'dictionary' where audio_url is not null and audio_source is null;

insert into storage.buckets (id, name, public)
values ('lesson-audio', 'lesson-audio', true)
on conflict (id) do update set public = true;

create policy lesson_audio_public_read on storage.objects
for select to public
using (bucket_id = 'lesson-audio');

create policy lesson_audio_auth_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'lesson-audio');

create policy lesson_audio_auth_update on storage.objects
for update to authenticated
using (bucket_id = 'lesson-audio');

create policy lesson_audio_auth_delete on storage.objects
for delete to authenticated
using (bucket_id = 'lesson-audio');
