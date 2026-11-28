// One-time step: lets the bot download the channel's clips.
// Twitch only hands out clip video files to apps the channel has approved with the
// channel:manage:clips permission. Run this, open the link while logged in to Twitch as
// the channel (TNT Nerds), click Authorize, then paste the address you land on.
//
// Run: docker compose exec discord-stream-calendar npm run twitch-clips-auth
import 'dotenv/config';
import readline from 'node:readline/promises';

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const redirectUri = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000';
const channel = (process.env.TWITCH_CHANNEL_LOGIN || 'tntnerds').toLowerCase();

if (!clientId || !clientSecret) {
  console.error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET need to be set in .env first.');
  process.exit(1);
}

const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
authUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: 'channel:manage:clips',
  force_verify: 'true'
}).toString();

console.log(`
1. Make sure you're logged in to twitch.tv as ${channel} in your browser.
2. Open this link and click Authorize:

${authUrl}

3. Your browser will then try to open ${redirectUri} and show an error page.
   That's expected. Copy the whole address from the address bar and paste it below.
`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pasted = (await rl.question('Paste the address here: ')).trim();
rl.close();

let code;
try {
  code = new URL(pasted).searchParams.get('code');
} catch {
  code = pasted; // they pasted just the code
}
if (!code) {
  console.error('No code found in that address. If it contains "error=", the authorisation was cancelled. Try again.');
  process.exit(1);
}

const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  })
});
if (!tokenRes.ok) {
  console.error(`Twitch didn't accept the code (HTTP ${tokenRes.status}): ${await tokenRes.text()}`);
  console.error('Codes only work once and expire quickly. Run this again and paste the new address straight away.');
  process.exit(1);
}
const { access_token: token } = await tokenRes.json();

const check = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
const info = await check.json();

if (info.login?.toLowerCase() !== channel) {
  console.error(`That authorised the account "${info.login}", not "${channel}". Log in to Twitch as ${channel} and run this again.`);
  process.exit(1);
}
if (!info.scopes?.includes('channel:manage:clips')) {
  console.error('The permission was not granted. Run this again and click Authorize.');
  process.exit(1);
}
console.log(`\nDone. ${info.login} has allowed the bot to download its clips. Nothing else needs saving; you won't need to do this again.`);
