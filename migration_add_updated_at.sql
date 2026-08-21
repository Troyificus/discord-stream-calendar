-- Run this in Supabase's SQL Editor.
alter table stream_days add column if not exists updated_at timestamptz;
