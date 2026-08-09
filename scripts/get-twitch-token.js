import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

app.get('/', (req, res) => {
  const authUrl =
    `https://id.twitch.tv/oauth2/authorize` +
    `?client_id=${process.env.TWITCH_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=channel:manage:schedule`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('No code received - something went wrong.');

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    })
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    res.send(`Error: ${JSON.stringify(data)}`);
    return;
  }

  console.log('\nAdd this line to your .env file:\n');
  console.log(`TWITCH_REFRESH_TOKEN=${data.refresh_token}\n`);
  res.send('Success - check your terminal for the refresh token, then close this tab.');
});

app.listen(PORT, () => {
  console.log(`This must be run on the machine you're browsing from (not inside Docker).`);
  console.log(`Open http://localhost:${PORT} in your browser to authorize with Twitch.`);
});
