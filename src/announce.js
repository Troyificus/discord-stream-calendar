// Posts to the Discord announcements channel, if one is configured.
export async function announceInDiscord(client, payload) {
  const channelId = process.env.DISCORD_ANNOUNCE_CHANNEL_ID;
  if (!channelId) return null;
  try {
    const channel = await client.channels.fetch(channelId);
    return await channel.send(payload);
  } catch (err) {
    console.error('Discord announcement failed:', err);
    return null;
  }
}

export function twitchUrl() {
  return `https://twitch.tv/${process.env.TWITCH_CHANNEL_LOGIN || 'tntnerds'}`;
}

// ['Troy', 'Sean', 'Dave'] -> 'Troy, Sean and Dave'; long lists get '+ N more'.
export function joinNames(names, max = 4) {
  if (!names.length) return '';
  const shown = names.length > max ? names.slice(0, max - 1) : names;
  const extra = names.length - shown.length;
  const list = extra ? [...shown, `${extra} more`] : shown;
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

// Bluesky allows 300 characters and X 280; posts are kept under this.
export const MAX_POST_LENGTH = 270;

// Adds as many of the hashtags as fit within MAX_POST_LENGTH, on their own line.
export function withHashtags(text, hashtags) {
  const tags = [...new Set(String(hashtags ?? '').split(/\s+/).filter(Boolean))];
  let out = text;
  const kept = [];
  for (const tag of tags) {
    const candidate = `${text}\n\n${[...kept, tag].join(' ')}`;
    if (candidate.length > MAX_POST_LENGTH) break;
    kept.push(tag);
    out = candidate;
  }
  return out;
}
