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

// ---- Clips ----

const userIdCache = new Map();

export async function getUserId(login) {
  if (userIdCache.has(login)) return userIdCache.get(login);
  const body = await helix(`users?login=${encodeURIComponent(login)}`);
  const id = body.data?.[0]?.id;
  if (!id) throw new Error(`Twitch user "${login}" not found`);
  userIdCache.set(login, id);
  return id;
}

// All clips of a channel created between two instants (Date objects), across pages.
export async function getClipsBetween(broadcasterId, startedAt, endedAt) {
  const clips = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({
      broadcaster_id: broadcasterId,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      first: '100'
    });
    if (cursor) params.set('after', cursor);
    const body = await helix(`clips?${params}`);
    clips.push(...(body.data ?? []));
    cursor = body.pagination?.cursor ?? null;
  } while (cursor && clips.length < 1000);
  return clips;
}

// { clipId: { landscape, portrait } } download URLs (temporary). Needs the channel to have
// authorised this app with channel:manage:clips (run "npm run twitch-clips-auth" once).
export async function getClipDownloadUrls(broadcasterId, clipIds) {
  const urls = {};
  for (let i = 0; i < clipIds.length; i += 10) {
    const params = new URLSearchParams({ editor_id: broadcasterId, broadcaster_id: broadcasterId });
    for (const id of clipIds.slice(i, i + 10)) params.append('clip_id', id);
    const body = await helix(`clips/downloads?${params}`);
    for (const row of body.data ?? []) {
      urls[row.clip_id] = { landscape: row.landscape_download_url, portrait: row.portrait_download_url };
    }
  }
  return urls;
}
