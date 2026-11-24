import { AttachmentBuilder } from 'discord.js';
import { getDayInfo } from './roster.js';
import { renderCalendarImage } from './calendarImage.js';
import { getThumbnailMap } from './gameThumbnails.js';
import { weekdayAbbr } from './embedBuilder.js';
import { claim, getEntry, markPosted } from './socialLog.js';
import { postizConfigured, createPost, deletePost, uploadImage, idsFromEnv } from './postiz.js';
import { announceInDiscord, twitchUrl } from './announce.js';
import { ukParts, addDays, mondayOf, ukLocalToDate, formatUkTime } from './ukTime.js';

const CHECK_MS = 60 * 1000;
// Bluesky allows 300 characters and X 280; above this the short version is used.
const MAX_TEXT = 270;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let running = false;

function prettyDate(isoDate) {
  return `${Number(isoDate.slice(8, 10))} ${SHORT_MONTHS[Number(isoDate.slice(5, 7)) - 1]}`;
}

export function buildWeeklyText(dayInfo) {
  const lines = [...dayInfo.values()].map((info) => {
    const time = info.start_time_utc ? formatUkTime(info.start_time_utc) : 'time tbc';
    return `${weekdayAbbr(info.date)}: ${info.game || 'game tbc'}, ${time}`;
  });
  const full = `This week on TNT Nerds 🎮\n${lines.join('\n')}\n(UK times)\n${twitchUrl()}`;
  if (full.length <= MAX_TEXT) return full;
  return `This week on TNT Nerds: ${dayInfo.size} streams 🎮 Full schedule in the picture. ${twitchUrl()}`;
}

// Builds and sends the schedule for the week starting `weekStart` (a Monday).
// fromDate: leave out days before this (used for midweek updates).
// Returns a short summary string for logs and the admin command.
export async function publishWeek(client, weekStart, { fromDate = null } = {}) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => !fromDate || d >= fromDate);
  const dayInfo = await getDayInfo(dates);
  const scheduled = new Map([...dayInfo].filter(([, info]) => info.game || info.start_time_utc));
  if (!scheduled.size) return 'Nothing scheduled that week, so nothing was posted.';

  const thumbnails = await getThumbnailMap();
  const image = await renderCalendarImage(
    [{ title: `TNT Nerds: week of ${prettyDate(weekStart)}`, dates }],
    scheduled,
    thumbnails
  );
  const text = buildWeeklyText(scheduled);

  await announceInDiscord(client, { content: text, files: [new AttachmentBuilder(image, { name: 'schedule.png' })] });

  const channels = idsFromEnv('POSTIZ_WEEKLY_CHANNELS');
  if (!postizConfigured() || !channels.length) {
    await markPosted('weekly', weekStart, null);
    return 'Posted in Discord (Postiz is not set up, so no socials).';
  }

  const previous = await getEntry('weekly', weekStart);
  const publishAt = ukLocalToDate(weekStart, process.env.WEEKLY_PUBLISH_TIME || '09:00');
  const stillScheduled = publishAt.getTime() > Date.now() + 5 * 60 * 1000;

  // Replace a not yet published post for this week instead of stacking a second one.
  if (previous?.postiz_post_id && stillScheduled) {
    try {
      await deletePost(previous.postiz_post_id);
    } catch (err) {
      console.error('Removing the old scheduled post failed (it may already be gone):', err);
    }
  }

  const media = await uploadImage(image, `tnt-schedule-${weekStart}.png`);
  const postId = await createPost({
    integrationIds: channels,
    content: text,
    image: media,
    type: stillScheduled ? 'schedule' : 'now',
    date: stillScheduled ? publishAt : new Date()
  });
  await markPosted('weekly', weekStart, postId);
  return stillScheduled
    ? `Posted in Discord and scheduled on socials for ${publishAt.toISOString()}.`
    : 'Posted in Discord and on socials.';
}

async function maybePostWeekly(client) {
  const now = ukParts();
  const postDay = Number(process.env.WEEKLY_POST_DAY ?? 0); // 0 = Sunday
  if (now.weekday !== postDay || now.hhmm < (process.env.WEEKLY_POST_TIME || '18:00')) return;

  const weekStart = addDays(mondayOf(now.isoDate), 7); // the coming Monday
  if (await getEntry('weekly', weekStart)) return; // already done this week

  // If the roster isn't filled in yet, try again next minute (until the day ends).
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayInfo = await getDayInfo(dates);
  if (![...dayInfo.values()].some((info) => info.game || info.start_time_utc)) return;

  if (!(await claim('weekly', weekStart))) return;
  console.log(`Weekly schedule post for ${weekStart}: ${await publishWeek(client, weekStart)}`);
}

export function startWeeklyLoop(client) {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await maybePostWeekly(client);
    } catch (err) {
      console.error('Weekly schedule post failed:', err);
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, CHECK_MS);
}

// For the /schedule-post admin command: on Sunday it covers next week, any other day
// the rest of this week.
export async function postScheduleNow(client) {
  const today = ukParts().isoDate;
  const isSunday = ukParts().weekday === 0;
  const weekStart = isSunday ? addDays(today, 1) : mondayOf(today);
  await claim('weekly', weekStart); // make sure the ledger row exists; fine if it already did
  return publishWeek(client, weekStart, { fromDate: isSunday ? null : today });
}
