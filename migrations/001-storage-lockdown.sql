-- Run in the Supabase SQL editor before exposing the upgraded API.
-- Restrictive policies intersect existing permissive policies; no unrelated policies are dropped.
begin;
update storage.buckets set public = false where id = 'videos';
drop policy if exists scholarly_video_lockdown on storage.objects;
create policy scholarly_video_lockdown on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'videos') with check (bucket_id <> 'videos');
drop policy if exists scholarly_image_insert on storage.objects;
create policy scholarly_image_insert on storage.objects as restrictive for insert to anon, authenticated
with check (bucket_id <> 'Images');
drop policy if exists scholarly_image_update on storage.objects;
create policy scholarly_image_update on storage.objects as restrictive for update to anon, authenticated
using (bucket_id <> 'Images') with check (bucket_id <> 'Images');
drop policy if exists scholarly_image_delete on storage.objects;
create policy scholarly_image_delete on storage.objects as restrictive for delete to anon, authenticated
using (bucket_id <> 'Images');
commit;
-- The server-only service role performs image uploads. Do not grant it to the browser.
-- Public image reads can remain enabled; the videos bucket must remain private.
