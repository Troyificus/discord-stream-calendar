import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { supabase } from './supabaseClient.js';
import { renderCalendarImage } from './calendarImage.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateUK(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function parseDateUK(ukDate) {
  const match = ukDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`"${ukDate}" isn't a valid date - use DD/MM/YYYY, e.g. 19/08/2026.`);
  }
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (Number.isNaN(new Date(iso).getTime())) {
    throw new Error(`"${ukDate}" isn't a real date - use DD/MM/YYYY, e.g. 19/08/2026.`);
  }
  return iso;
}

export function weekdayAbbr(isoDate) {
  return WEEKDAY_ABBR[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

export function dayLabel(isoDate) {
  return `${weekdayAbbr(isoDate)} ${formatDateUK(isoDate)}`;
}

// All ISO dates in the current calendar month.
export function getMonthDates() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => {
    const d = new Date(Date.UTC(year, month, i + 1));
    return d.toISOString().slice(0, 10);
  });
}

// Splits an array into groups of `size` - used to keep select menus under Discord's 25-option cap.
export function chunkArray(arr, size = 7) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function getDaysAndApprovedGuests(dates) {
  const { data: days } = await supabase
    .from('stream_days')
    .select('*, attendance(member_id, members(display_name))')
    .in('date', dates);

  const { data: approvedGuests } = await supabase
    .from('guest_requests')
    .select('stream_day_id')
    .eq('status', 'approved');

  return { days: days ?? [], approvedGuests: approvedGuests ?? [] };
}

function openSlotsFor(date, days, approvedGuests) {
  const day = days.find((d) => d.date === date);
  if (!day) return Infinity; // no row yet = never configured = treat as open
  const attendees = day.attendance?.length ?? 0;
  const guests = approvedGuests.filter((g) => g.stream_day_id === day.id).length;
  return Math.max(day.capacity - attendees - guests, 0);
}

export async function getOpenDates(dates) {
  const { days, approvedGuests } = await getDaysAndApprovedGuests(dates);
  return dates.filter((date) => openSlotsFor(date, days, approvedGuests) > 0);
}

export async function buildMonthlyEmbed() {
  const dates = getMonthDates();
  const { days, approvedGuests } = await getDaysAndApprovedGuests(dates);

  const now = new Date();
  const title = `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  const dayInfo = new Map();
  const upcoming = [];

  for (const date of dates) {
    const day = days.find((d) => d.date === date);
    if (!day || !day.game) continue;

    const attendees = day.attendance?.map((a) => a.members?.display_name).filter(Boolean) ?? [];
    const guestCount = approvedGuests.filter((g) => g.stream_day_id === day.id).length;
    const filled = attendees.length + guestCount;
    const open = Math.max(day.capacity - filled, 0);
    const whoText = attendees.length ? attendees.join(', ') : undefined;

    dayInfo.set(date, { game: day.game, start_time_utc: day.start_time_utc, who: whoText, open, full: open === 0 });

    if (day.start_time_utc && new Date(day.start_time_utc).getTime() > Date.now()) {
      upcoming.push({ date, game: day.game, start_time_utc: day.start_time_utc });
    }
  }

  const imageBuffer = renderCalendarImage(title, dates, dayInfo);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'calendar.png' });

  const upcomingText = upcoming
    .slice(0, 3)
    .map((u) => `${dayLabel(u.date)} — ${u.game} · <t:${Math.floor(new Date(u.start_time_utc).getTime() / 1000)}:t>`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865f2)
    .setImage('attachment://calendar.png');

  if (upcomingText) {
    embed.setDescription(`**Coming up (your local time):**\n${upcomingText}`);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('manage_days').setLabel('Manage my days').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('request_guest').setLabel('Request to guest').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row], files: [attachment] };
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
