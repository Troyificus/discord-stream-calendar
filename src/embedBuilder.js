import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { supabase } from './supabaseClient.js';

export function getWeekDates() {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function formatDateUK(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export async function buildWeeklyEmbed() {
  const dates = getWeekDates();

  const { data: days } = await supabase
    .from('stream_days')
    .select('*, attendance(member_id, members(display_name))')
    .in('date', dates);

  const { data: approvedGuests } = await supabase
    .from('guest_requests')
    .select('stream_day_id')
    .eq('status', 'approved');

  const embed = new EmbedBuilder()
    .setTitle(`Week of ${dates[0]} to ${dates[6]}`)
    .setColor(0x5865f2);

  for (const date of dates) {
    const day = days?.find((d) => d.date === date);

    if (!day || (!day.game && !day.attendance?.length)) {
      embed.addFields({ name: formatDateUK(date), value: 'No stream scheduled', inline: false });
      continue;
    }

    const attendees = day.attendance?.map((a) => a.members?.display_name).filter(Boolean) ?? [];
    const guestCount = approvedGuests?.filter((g) => g.stream_day_id === day.id).length ?? 0;
    const filled = attendees.length + guestCount;
    const open = Math.max(day.capacity - filled, 0);

    const unixTime = day.start_time_utc ? Math.floor(new Date(day.start_time_utc).getTime() / 1000) : null;
    const timeText = unixTime ? `<t:${unixTime}:t>` : 'time tbc';
    const gameText = day.game || 'game tbc';

    const lines = [
      `${gameText} - ${timeText}`,
      attendees.length ? `Playing: ${attendees.join(', ')}` : 'Playing: nobody yet',
      open > 0 ? `${open} slot${open === 1 ? '' : 's'} open` : 'Full'
    ];

    embed.addFields({ name: formatDateUK(date), value: lines.join('\n'), inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('manage_days').setLabel('Manage my days').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('request_guest').setLabel('Request to guest').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

export async function refreshCalendarMessage(client) {
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
  const { data: setting } = await supabase.from('settings').select('value').eq('key', 'calendar_message_id').single();

  const payload = await buildWeeklyEmbed();

  if (setting?.value) {
    try {
      const message = await channel.messages.fetch(setting.value);
      await message.edit(payload);
      return message;
    } catch {
      // message was deleted - fall through and post a new one
    }
  }

  const message = await channel.send(payload);
  await supabase.from('settings').upsert({ key: 'calendar_message_id', value: message.id });
  return message;
}
