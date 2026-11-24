import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { supabase } from './supabaseClient.js';
import { renderCalendarImage } from './calendarImage.js';
import { getThumbnailMap } from './gameThumbnails.js';
import { getDayInfo } from './roster.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateUK(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function weekdayAbbr(isoDate) {
  return WEEKDAY_ABBR[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

export function dayLabel(isoDate) {
  return `${weekdayAbbr(isoDate)} ${formatDateUK(isoDate)}`;
}

// ISO dates for a given month, offset from the current one (0 = this month, 1 = next month).
// JS Date rolls December + 1 into January of the next year automatically.
export function getMonthDates(monthOffset = 0) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + monthOffset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => {
    const d = new Date(Date.UTC(year, month, i + 1));
    return d.toISOString().slice(0, 10);
  });
}

export function getMonthTitle(monthOffset = 0) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function buildMonthlyEmbed() {
  const months = [0].map((offset) => ({
    offset,
    title: getMonthTitle(offset),
    dates: getMonthDates(offset)
  }));
  const allDates = months.flatMap((m) => m.dates);

  const dayInfo = await getDayInfo(allDates);

  const upcoming = [];
  for (const info of dayInfo.values()) {
    if (info.start_time_utc && new Date(info.start_time_utc).getTime() > Date.now()) {
      upcoming.push({ date: info.date, game: info.game, start_time_utc: info.start_time_utc });
    }
  }

  const thumbnails = await getThumbnailMap();
  const imageBuffer = await renderCalendarImage(
    months.map(({ title, dates }) => ({ title, dates })),
    dayInfo,
    thumbnails
  );
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'calendar.png' });

  const upcomingText = upcoming
    .slice(0, 3)
    .map((u) => `${dayLabel(u.date)} — ${u.game} · <t:${Math.floor(new Date(u.start_time_utc).getTime() / 1000)}:t>`)
    .join('\n');

  let content = `**${months[0].title}**`;
  if (upcomingText) {
    content += `\n\n**Coming up (your local time):**\n${upcomingText}`;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Open full calendar').setStyle(ButtonStyle.Link).setURL('https://calendar.rated16bit.uk')
  );

  return { content, components: [row], files: [attachment], embeds: [] };
}

export async function refreshCalendarMessage(client) {
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
  const { data: setting } = await supabase.from('settings').select('value').eq('key', 'calendar_message_id').single();

  const payload = await buildMonthlyEmbed();

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
