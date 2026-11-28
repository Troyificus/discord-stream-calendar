# Discord stream calendar

Two parts sharing one Supabase database:

- **`/` (this folder)** - a Discord bot that posts a calendar image into a channel and keeps it
  refreshed, plus optional social automation (see below): going live posts, an after stream
  reminder DM, and a weekly schedule post.
- **`/web`** - the real interactive calendar (calendar.rated16bit.uk). Sign in with Discord,
  join/leave days, request to guest, and (if you're an admin) set games/times/capacity and
  approve guest requests. See `web/README.md` for its own setup.

## Bot setup order
1. Supabase - run `schema.sql` in the SQL Editor (already have a database? use
   `migration_role_based_auth.sql` instead - see below)
2. Discord - create the application/bot, invite it, grab the Application ID / Server ID / Channel ID
3. `cp .env.example .env` and fill it in
4. `npm install && npm run deploy-commands`
5. `docker compose up -d --build`
6. In your channel: `/calendar-post`

Core-member and admin status are decided by actual Discord roles, checked live via OAuth on the
website - not a list maintained anywhere. See `web/README.md`.

## Everyday commands
| What | Command |
|---|---|
| Stop | `docker compose down` |
| Start | `docker compose up -d` |
| Restart after .env change | `docker compose down && docker compose up -d` |
| Restart after code change | `docker compose up -d --build` |
| Logs | `docker compose logs -f` |
| Refresh commands after changing deploy-commands.js | `npm run deploy-commands` |

## Social automation (optional)

Each part switches itself off if its settings in `.env` are blank, so you can turn them on one at a time.

| Feature | What it does | Needs |
|---|---|---|
| Going live posts | Checks Twitch every minute. When the channel goes live it posts who's on and what game (from the roster) to Discord and your socials. Never double posts, ignores short drops/restarts, and won't announce a stream late if the bot was down. | `TWITCH_*`, plus `DISCORD_ANNOUNCE_CHANNEL_ID` and/or Postiz |
| After stream reminder | ~5 minutes after the stream ends, DMs you one small job with Done / Snooze 1 hour / Skip buttons. One follow up nudge after 2 hours, then it stops. A new stream replaces an unanswered reminder. `REMINDER_MODE=mine` only pings after streams you're on the roster for. | `TWITCH_*`, `REMINDER_DISCORD_USER_ID` |
| Weekly schedule | Sunday 18:00 UK: posts next week's schedule (text + image) in Discord, and schedules it on socials for Monday 09:00. If the roster is empty it keeps checking until the day ends. `/schedule-post` re-posts it any time after changes, replacing the socials post if it hasn't gone out yet. | Postiz and/or `DISCORD_ANNOUNCE_CHANNEL_ID` |

### Setup
1. Run `migration_social_automation.sql` in Supabase's SQL Editor.
2. Twitch: dev.twitch.tv -> Your Console -> Register Your Application (category: Other, redirect URL
   `http://localhost`, client type Confidential). Copy the Client ID and make a Client Secret.
3. Postiz: connect your socials in Postiz, then Settings -> Developers -> Public API for the key.
   Fill in `POSTIZ_API_URL` and `POSTIZ_API_KEY`, then list channel IDs with
   `docker compose run --rm discord-stream-calendar npm run postiz-channels`
   and paste the ones you want into `POSTIZ_LIVE_CHANNELS` / `POSTIZ_WEEKLY_CHANNELS`.
   TikTok and YouTube are skipped automatically (they need video); Instagram only gets the weekly post (it needs an image).
4. Your Discord user ID into `REMINDER_DISCORD_USER_ID`. Make sure you allow DMs from server members for this server.
5. `npm run deploy-commands` (adds `/schedule-post`), then `docker compose up -d --build`.
6. Check `docker compose logs -f`: it says which features are off and why.

## Clips (optional)

After each stream (about 15 minutes after it ends), the bot:
1. collects the clips people made during that stream, best first (most views), dropping clips
   under 5 seconds and near-duplicates of the same moment (`CLIPS_MAX_PER_STREAM`, default 5);
2. downloads them through Twitch's official clip download API;
3. makes a vertical 1080x1920 version: the whole clip in the middle over a blurred copy, the
   channel name at the top, and burned-in captions from Whisper (runs on the server, no API);
4. saves each one in Postiz as a **draft** (nothing is published), suggested one per day from the
   next day at `CLIP_POST_TIME`;
5. lists them in the after stream reminder DM, so the job is just reviewing and scheduling.

`/clips` (admin) does the same for any clips from the last N hours (default 12) that haven't been
prepared yet, and DMs you the result. Handy for clips made later from the VOD.

### Setup
1. Run `migration_clips.sql` in Supabase (adds `reminders.note`).
2. In dev.twitch.tv -> Your Console -> your app -> Manage, add `http://localhost:3000` as an
   OAuth Redirect URL (or set `TWITCH_REDIRECT_URI` to one that's already there).
3. Rebuild: `docker compose up -d --build` (the image now includes ffmpeg and faster-whisper).
4. Once, logged in to Twitch as the channel:
   `docker compose exec discord-stream-calendar npm run twitch-clips-auth` and follow the prompts.
5. `npm run deploy-commands` to add `/clips`.

The first captioned clip downloads the speech model (about 500 MB for `small.en`), kept in the
`whisper-models` volume. On a laptop CPU, expect roughly a minute or two per clip.
