// Minimal Twitch Helix client using an app access token (client credentials).
// No user login is needed: checking whether a channel is live is public data.

let appToken = null;
let appTokenExpiresAt = 0;

export function twitchConfigured() {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

async function getAppToken(force = false) {
  if (!force && appToken && Date.now() < appTokenExpiresAt - 60_000) return appToken;

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch token request failed: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  appToken = body.access_token;
  appTokenExpiresAt = Date.now() + body.expires_in * 1000;
  return appToken;
}

async function helix(path, retried = false) {
  const token = await getAppToken(retried);
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` }
  });
  if (res.status === 401 && !retried) return helix(path, true);
  if (!res.ok) throw new Error(`Twitch API ${path} failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// Returns { id, game_name, title, started_at } if the channel is live, otherwise null.
export async function getLiveStream(login) {
  const body = await helix(`streams?user_login=${encodeURIComponent(login)}`);
  return body.data?.[0] ?? null;
}
