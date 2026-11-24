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
