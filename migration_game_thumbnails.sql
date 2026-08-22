-- Run this in Supabase's SQL Editor.
create table if not exists game_thumbnails (
  id uuid primary key default gen_random_uuid(),
  tag text unique not null,
  image_url text not null,
  created_at timestamptz default now()
);

-- Also required (do this in the Dashboard, not SQL):
-- Storage -> New bucket -> name it exactly "game-thumbnails" -> toggle "Public bucket" ON -> Create.
-- Public is needed so the calendar page can display the images without signed URLs.
