-- Run this in Supabase's SQL Editor. Safe to run more than once.
-- Adds the tables for going live posts, after stream reminders and the weekly schedule post.

-- Ledger of what the bot has posted, so restarts never double post.
-- kind = 'live' (ref = Twitch stream ID) or 'weekly' (ref = the week's Monday, e.g. 2026-11-30).
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ref text not null,
  postiz_post_id text,
  posted_at timestamptz,
  created_at timestamptz default now(),
  unique (kind, ref)
);

-- After stream reminder DMs. status: active, done, skipped, superseded.
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null unique,
  status text not null default 'active',
  sends int not null default 0,
  next_send_at timestamptz,
  created_at timestamptz default now()
);

-- Only the bot (service key) touches these; RLS with no policies keeps them
-- off the public API.
alter table social_posts enable row level security;
alter table reminders enable row level security;
