-- Already applied. Locks game_thumbnails off the public (anon) API.
-- The bot and the website both use the service key, which bypasses RLS, and the
-- images themselves live in the public Storage bucket, so nothing visible changes.
alter table game_thumbnails enable row level security;
