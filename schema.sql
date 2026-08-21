-- Run this once in Supabase's SQL Editor, for a brand new setup.
-- (If you already have the old schema, use migration_role_based_auth.sql instead.)

create table stream_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  game text,
  start_time_utc timestamptz,
  capacity int not null default 4,
  updated_at timestamptz
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  stream_day_id uuid references stream_days(id) on delete cascade,
  discord_user_id text not null,
  display_name text not null,
  created_at timestamptz default now(),
  unique (stream_day_id, discord_user_id)
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

-- No members table needed - "core member" and "admin" are decided by Discord roles,
-- checked live via OAuth (see web/.env.example: DISCORD_CORE_ROLE_ID / DISCORD_ADMIN_ROLE_ID).
