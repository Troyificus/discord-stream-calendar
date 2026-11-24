import { supabase } from './supabaseClient.js';
import { ukParts, addDays } from './ukTime.js';

// Map keyed by ISO date -> { game, start_time_utc, attendees, attendeeIds, guestNames, open, full }.
// Only days with something scheduled are included. Shared by the calendar image, the
// going live posts and the weekly schedule post.
export async function getDayInfo(dates) {
  const { data: days, error } = await supabase
    .from('stream_days')
    .select('*, attendance(discord_user_id, display_name)')
    .in('date', dates);
  if (error) throw error;

  const dayIds = (days ?? []).map((d) => d.id);
  let approvedGuests = [];
  if (dayIds.length) {
    const { data } = await supabase
      .from('guest_requests')
      .select('stream_day_id, display_name')
      .eq('status', 'approved')
      .in('stream_day_id', dayIds);
    approvedGuests = data ?? [];
  }

  const dayInfo = new Map();
  for (const date of dates) {
    const day = (days ?? []).find((d) => d.date === date);
    const attendees = day?.attendance?.map((a) => a.display_name).filter(Boolean) ?? [];
    const attendeeIds = day?.attendance?.map((a) => a.discord_user_id).filter(Boolean) ?? [];
    const guestNames = approvedGuests.filter((g) => g.stream_day_id === day?.id).map((g) => g.display_name);
    if (!day || (!day.game && !attendees.length && !guestNames.length)) continue;

    const filled = attendees.length + guestNames.length;
    const open = Math.max(day.capacity - filled, 0);
    dayInfo.set(date, {
      date,
      game: day.game,
      start_time_utc: day.start_time_utc,
      attendees,
      attendeeIds,
      guestNames,
      open,
      full: open === 0
    });
  }
  return dayInfo;
}

// The roster entry that a stream starting at `startedAt` belongs to. Looks at yesterday,
// today and tomorrow (UK dates) so a stream that runs past midnight, or starts a little
// early, still matches. Prefers the slot whose start time is closest, within 6 hours.
export async function findLineupFor(startedAt = new Date()) {
  const today = ukParts(startedAt).isoDate;
  const dayInfo = await getDayInfo([addDays(today, -1), today, addDays(today, 1)]);

  let best = null;
  let bestGap = 6 * 60 * 60 * 1000;
  for (const info of dayInfo.values()) {
    if (!info.start_time_utc) continue;
    const gap = Math.abs(new Date(info.start_time_utc).getTime() - startedAt.getTime());
    if (gap <= bestGap) {
      best = info;
      bestGap = gap;
    }
  }
  return best ?? dayInfo.get(today) ?? null;
}
