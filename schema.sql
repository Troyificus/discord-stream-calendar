-- Run this once in Supabase's SQL Editor.

create table members (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text unique not null,
  display_name text not null
);

create table stream_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  game text,
  start_time_utc timestamptz,
  capacity int not null default 4,
  twitch_segment_id text
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  stream_day_id uuid references stream_days(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  created_at timestamptz default now(),
  unique (stream_day_id, member_id)
);

create table guest_list (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text unique not null,
  display_name text not null,
  added_at timestamptz default now()
);

create table guest_requests (
  id uuid primary key default gen_random_uuid(),
  stream_day_id uuid references stream_days(id) on delete cascade,
  discord_user_id text not null,
  display_name text not null,
  created_at timestamptz default now(),
  status text not null default 'pending'
);

create table settings (
  key text primary key,
  value text
);

-- Seed your 5 core members here — replace the IDs and names.
-- Get each person's Discord user ID with Developer Mode on:
-- right-click their name -> Copy User ID.
insert into members (discord_user_id, display_name) values
  ('PASTE_DISCORD_USER_ID_1', 'Name 1'),
  ('PASTE_DISCORD_USER_ID_2', 'Name 2'),
  ('PASTE_DISCORD_USER_ID_3', 'Name 3'),
  ('PASTE_DISCORD_USER_ID_4', 'Name 4'),
  ('PASTE_DISCORD_USER_ID_5', 'Name 5');
