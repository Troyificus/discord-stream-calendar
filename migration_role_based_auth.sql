-- Run this in Supabase's SQL Editor.
-- This clears existing attendance rows (test data) since the shape is changing -
-- re-add any real signups afterward.

alter table attendance drop constraint if exists attendance_stream_day_id_member_id_key;
alter table attendance drop constraint if exists attendance_member_id_fkey;
delete from attendance;
alter table attendance drop column if exists member_id;
alter table attendance add column discord_user_id text not null;
alter table attendance add column display_name text not null;
alter table attendance add constraint attendance_stream_day_id_discord_user_id_key unique (stream_day_id, discord_user_id);

-- No longer used - "core member" and "admin" are now determined by Discord roles,
-- checked live via OAuth, not by a table we maintain by hand. Safe to drop whenever:
-- drop table if exists members;
