# Discord stream calendar

Two parts sharing one Supabase database:

- **`/` (this folder)** - a Discord bot that posts a calendar image into a channel and keeps it
  refreshed. That's all it does now - no buttons, no admin commands beyond `/calendar-post`.
- **`/web`** - the real interactive calendar (calendar.rated16bit.uk). Sign in with Discord,
  join/leave days, request to guest, and (if you're an admin) set games/times/capacity and
  approve guest requests. See `web/README.md` for its own setup.

## Bot setup order
1. Supabase - run `schema.sql` in the SQL Editor (fill in your 5 members' Discord user IDs first)
2. Discord - create the application/bot, invite it, grab the Application ID / Server ID / Channel ID
3. `cp .env.example .env` and fill it in
4. `npm install && npm run deploy-commands`
5. `docker compose up -d --build`
6. In your channel: `/calendar-post`

## Everyday commands
| What | Command |
|---|---|
| Stop | `docker compose down` |
| Start | `docker compose up -d` |
| Restart after .env change | `docker compose down && docker compose up -d` |
| Restart after code change | `docker compose up -d --build` |
| Logs | `docker compose logs -f` |
| Refresh commands after changing deploy-commands.js | `npm run deploy-commands` |
