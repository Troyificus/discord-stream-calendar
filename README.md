# Discord stream calendar

Setup order: Supabase -> Discord -> Twitch -> get a Twitch refresh token -> fill in .env -> deploy commands -> run.

## 1. Supabase
Run schema.sql in the Supabase SQL Editor (fill in your 5 members' Discord user IDs at the
bottom first). Copy your Project URL and service_role key from Project Settings -> API.

## 2. Discord
Create the application/bot in the Developer Portal, invite it with `bot` +
`applications.commands` scopes, and grab your Application ID, Server ID, and
`#calendar` Channel ID (Developer Mode -> right click -> Copy ID). Create a
`Stream Lead` role for admins.

## 3. Twitch app
Register an app at dev.twitch.tv/console/apps with redirect URL
`http://localhost:3000/callback`. Copy the Client ID and generate a Client Secret.

## 4. Fill in .env
```
cp .env.example .env
nano .env
```
Fill in everything except TWITCH_REFRESH_TOKEN and TWITCH_BROADCASTER_ID for now.

## 5. Get your Twitch refresh token (run this locally, not in Docker)
```
npm install
npm run get-twitch-token
```
Open http://localhost:3000 in your browser, log in with the streaming account, approve
the scope. Your terminal prints a TWITCH_REFRESH_TOKEN line - paste it into .env.

To get TWITCH_BROADCASTER_ID, run:
```
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" -H "Client-Id: YOUR_CLIENT_ID" \
  "https://api.twitch.tv/helix/users?login=your_twitch_username"
```
(the access token printed just before the refresh token in your terminal works here too)
and copy the "id" field from the response into .env.

## 6. Register the slash commands
```
npm run deploy-commands
```

## 7. Build and run with Docker
```
docker compose up -d --build
docker compose logs -f
```

## 8. Post the calendar
In your #calendar channel, run `/calendar-post`. Then try:
- `/calendar-setgame date:2026-08-14 game:Balatro time:19:00`
- `/calendar-setcapacity date:2026-08-14 capacity:6`
- `/calendar-requests` to review pending guest requests, oldest first

## Everyday commands
| What | Command |
|---|---|
| Stop | `docker compose down` |
| Start | `docker compose up -d` |
| Restart after .env change | `docker compose down && docker compose up -d` |
| Restart after code change | `docker compose up -d --build` |
| Logs | `docker compose logs -f` |
