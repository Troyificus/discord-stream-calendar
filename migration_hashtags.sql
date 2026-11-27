-- Run this in Supabase's SQL Editor. Safe to run more than once.
-- Optional hashtags per scheduled stream, e.g. "#warhammer #minipainting".
-- Set by admins on the website; used in social posts, not shown on the public calendar.
alter table stream_days add column if not exists hashtags text;
