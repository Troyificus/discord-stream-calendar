import { supabase } from './supabaseClient.js';

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

// Adds hashtags on their own line, keeping the post within MAX_POST_LENGTH.
// Global tags are guaranteed a place first; game tags fill whatever room is left.
// Shown in the order: game tags, then global tags. Duplicates are dropped.
export function withHashtags(text, gameTags, globalTags = '') {
  const split = (tags) => String(tags ?? '').split(/\s+/).filter(Boolean);
  const seen = new Set();
  const unique = (tags) => tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  const global = unique(split(globalTags));
  const games = unique(split(gameTags));

  const render = (g, gl) => {
    const line = [...g, ...gl].join(' ');
    return line ? `${text}\n\n${line}` : text;
  };

  const keptGlobal = [];
  for (const tag of global) {
    if (render([], [...keptGlobal, tag]).length > MAX_POST_LENGTH) break;
    keptGlobal.push(tag);
  }
  const keptGames = [];
  for (const tag of games) {
    if (render([...keptGames, tag], keptGlobal).length > MAX_POST_LENGTH) break;
    keptGames.push(tag);
  }
  return render(keptGames, keptGlobal);
}

// The site wide hashtags admins set on the website (settings key 'global_hashtags').
export async function getGlobalHashtags() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'global_hashtags').maybeSingle();
  return data?.value ?? '';
}
