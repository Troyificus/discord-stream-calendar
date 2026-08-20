# Discord stream calendar

Setup order: Supabase -> Discord -> fill in .env -> deploy commands -> run.

## 1. Supabase
Run schema.sql in the Supabase SQL Editor (fill in your 5 members' Discord user IDs at the
bottom first). Copy your Project URL and service_role key from Project Settings -> API.

## 2. Discord
Create the application/bot in the Developer Portal, invite it with `bot` +
`applications.commands` scopes, and grab your Application ID, Server ID, and
`#calendar` Channel ID (Developer Mode -> right click -> Copy ID). Create a
`Stream Lead` role for admins.

## 3. Fill in .env
```
cp .env.example .env
nano .env
```

## 4. Register the slash commands
```
npm install
npm run deploy-commands
```
Run this again any time a command's options change (not needed for ordinary code changes).

## 5. Build and run with Docker
```
docker compose up -d --build
docker compose logs -f
```

## 6. Post the calendar
In your #calendar channel, run `/calendar-post`. It shows the whole current month, one
line per day. Then try:
- `/calendar-setgame date:19/08/2026 game:Balatro time:19:00` - one-off, single day
- `/calendar-setrecurring weekday:Monday game:"Helldivers 2" time:19:00` - sets every
  matching weekday this month in one go
- `/calendar-setcapacity date:19/08/2026 capacity:6`
- `/calendar-requests` to review pending guest requests, oldest first

All dates in commands and on the calendar use DD/MM/YYYY.

## Everyday commands
| What | Command |
|---|---|
| Stop | `docker compose down` |
| Start | `docker compose up -d` |
| Restart after .env change | `docker compose down && docker compose up -d` |
| Restart after code change | `docker compose up -d --build` |
| Logs | `docker compose logs -f` |
