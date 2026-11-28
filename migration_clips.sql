-- Run this in Supabase's SQL Editor. Safe to run more than once.
-- Lets the after stream reminder carry a custom first message (the list of clips
-- waiting in Postiz). Clip drafts themselves are tracked in social_posts (kind 'clip').
alter table reminders add column if not exists note text;
