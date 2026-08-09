import 'dotenv/config';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.TWITCH_REFRESH_TOKEN
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twitch token refresh failed: ${JSON.stringify(data)}`);

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  if (data.refresh_token && data.refresh_token !== process.env.TWITCH_REFRESH_TOKEN) {
    console.warn(
      '\nTwitch rotated your refresh token. Update TWITCH_REFRESH_TOKEN in .env to:\n',
      data.refresh_token, '\n'
    );
  }
  return cachedToken;
}

async function findCategoryId(gameName) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
  });
  const data = await res.json();
  return data.data?.[0]?.id ?? null;
}

// Creates the segment if stream_days.twitch_segment_id is null, otherwise updates it.
// Returns the segment id to store back on the row.
export async function pushSegmentToTwitch(day) {
  const token = await getAccessToken();
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;
  const categoryId = day.game ? await findCategoryId(day.game) : null;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Client-Id': process.env.TWITCH_CLIENT_ID,
    'Content-Type': 'application/json'
  };

  if (!day.twitch_segment_id) {
    const body = {
      start_time: day.start_time_utc,
      timezone: 'UTC',
      is_recurring: false,
      duration: 180,
      title: day.game || 'Stream',
      ...(categoryId ? { category_id: categoryId } : {})
    };
    const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${broadcasterId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Twitch segment create failed: ${JSON.stringify(data)}`);
    return data.data.segments[0].id;
  }

  const params = new URLSearchParams({ broadcaster_id: broadcasterId, id: day.twitch_segment_id });
  const body = {
    start_time: day.start_time_utc,
    timezone: 'UTC',
    title: day.game || 'Stream',
    ...(categoryId ? { category_id: categoryId } : {})
  };
  const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?${params}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twitch segment update failed: ${JSON.stringify(data)}`);
  return day.twitch_segment_id;
}
