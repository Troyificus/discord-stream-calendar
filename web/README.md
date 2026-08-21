# Stream calendar - web

The full-size, no-Discord-limits version of the calendar. Same Supabase database as the bot in
`../` - this is just a nicer way to look at and interact with the same data.

## What it does
- Shows the whole month as a real CSS grid - no width cap, no crushed fonts.
- "Sign in with Discord" identifies who's looking, using the same Discord app as the bot
  (no separate account, no password).
- Core/admin status is checked live from your actual Discord server roles at sign-in - not
  a list maintained by hand. Give someone the core role, they can join/leave days. Give them
  the admin role too, they get the admin panel (set games, capacity, approve guests).
- Anyone who isn't core gets a "Request to guest" button on open days instead.

## Setup

### 1. Discord Developer Portal
On the same application as the bot (Stream Calendar):
- OAuth2 -> Redirect URIs -> add `https://calendar.rated16bit.uk/api/auth/callback`
  (or whatever domain you actually deploy to)
- OAuth2 -> copy the Client Secret if you haven't already

### 2. Discord roles
In your server (Developer Mode on, so you can right-click -> Copy Role ID):
- A role for your core members (e.g. "Stream Team") - copy its Role ID
- Your existing `Stream Lead` admin role - copy its Role ID too

### 3. Environment variables
```
cp .env.example .env.local
```
Fill in `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` from the Developer Portal, `DISCORD_GUILD_ID`
(same as the bot's), the two role IDs from step 2, the same `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`
the bot uses, and any random long string for `SESSION_SECRET` (e.g. `openssl rand -hex 32`).

### 4. Deploy to Vercel
- Push this repo to GitHub (already done)
- On vercel.com: New Project -> import the repo -> set **Root Directory** to `web`
- Add the same environment variables from `.env.local` in Vercel's project settings
- Deploy

### 5. Point your domain at it (optional but recommended)
In Cloudflare DNS for `rated16bit.uk`, add a CNAME record: `calendar` -> your Vercel deployment
domain (Vercel shows you the exact target when you add the custom domain in its project settings).

### Local development
```
npm install
npm run dev
```
Runs on `http://localhost:3000`. You'll need a Redirect URI in the Developer Portal matching
whatever URL you're testing from (`http://localhost:3000/api/auth/callback` for local dev).
