-- Run this in Supabase's SQL Editor.
alter table guest_requests add column if not exists discord_message_id text;
