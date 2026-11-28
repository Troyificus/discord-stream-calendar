import { getLiveStream, twitchConfigured } from './twitch.js';
import { findLineupFor } from './roster.js';
import { claim, markPosted, postedSince } from './socialLog.js';
import { postizConfigured, createPost, idsFromEnv } from './postiz.js';
import { announceInDiscord, twitchUrl, joinNames, withHashtags, getGlobalHashtags } from './announce.js';
import { createReminder } from './reminders.js';
import { clipsEnabled, processClips, reminderNote } from './clips.js';

const POLL_MS = 60 * 1000;
// Twitch can briefly report a stream as offline (dropped connection, OBS restart).
// Only treat it as ended after this many offline checks in a row (about 5 minutes).
const OFFLINE_POLLS_TO_END = 5;
// If the bot starts while a stream has been running longer than this, don't announce it late.
const STALE_AFTER_MS = 30 * 60 * 1000;
// After a crash and restart Twitch gives the stream a new ID; don't announce again this soon.
const REANNOUNCE_GAP_MS = 90 * 60 * 1000;

let current = null; // { id, startedAt }
let offlinePolls = 0;

const TEMPLATES = [
  (who, verb, game, link) => `${who} ${verb} live now with ${game}. Come hang out: ${link}`,
  (who, verb, game, link) => `Going live: ${game} with ${who}. Pull up a chair: ${link}`,
  (who, verb, game, link) => `We're live! ${who} ${verb} playing ${game} right now: ${link}`,
  (who, verb, game, link) => `${game} time. ${who} ${verb} on now: ${link}`
];

export function buildLiveText(lineup, stream, globalTags = '') {
  const names = [...(lineup?.attendees ?? []), ...(lineup?.guestNames ?? [])];
  const who = names.length ? joinNames(names) : 'TNT Nerds';
  const verb = names.length === 1 ? 'is' : 'are';
  const game = lineup?.game || stream?.game_name || 'something fun';
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return withHashtags(template(who, verb, game, twitchUrl()), lineup?.hashtags, globalTags);
}

async function handleWentLive(client, stream) {
  const startedAt = new Date(stream.started_at);
  if (!(await claim('live', stream.id))) return; // already handled (e.g. bot restarted mid-stream)

  if (Date.now() - startedAt.getTime() > STALE_AFTER_MS) {
    console.log(`Stream ${stream.id} has been live a while already; not announcing it late.`);
    return;
  }
  if (await postedSince('live', new Date(Date.now() - REANNOUNCE_GAP_MS), stream.id)) {
    console.log(`Stream ${stream.id} looks like a restart of one announced recently; not announcing again.`);
    return;
  }

  const lineup = await findLineupFor(startedAt);
  const text = buildLiveText(lineup, stream, await getGlobalHashtags());
  console.log(`Going live: ${text}`);

  await announceInDiscord(client, { content: text });

  let postizId = null;
  if (postizConfigured()) {
    try {
      postizId = await createPost({ integrationIds: idsFromEnv('POSTIZ_LIVE_CHANNELS'), content: text, type: 'now' });
    } catch (err) {
      console.error('Postiz going live post failed:', err);
    }
  }
  await markPosted('live', stream.id, postizId);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleStreamEnded(client, ended) {
  // Clips first (for every stream, whoever was on), so the reminder can list them.
  let clipResult = null;
  if (clipsEnabled()) {
    // Give people a few minutes to make end of stream clips, and Twitch time to process them.
    await sleep(Number(process.env.CLIP_DELAY_MINUTES || 10) * 60 * 1000);
    try {
      clipResult = await processClips(ended.startedAt, new Date());
    } catch (err) {
      console.error('Clip processing failed:', err);
    }
  }

  const target = process.env.REMINDER_DISCORD_USER_ID;
  if (!target) return;

  if ((process.env.REMINDER_MODE || 'mine') === 'mine') {
    const lineup = await findLineupFor(ended.startedAt);
    // Unscheduled streams (no lineup) still get a reminder, since we can't tell who was on.
    if (lineup && !lineup.attendeeIds.includes(target)) return;
  }
  await createReminder(client, ended.id, reminderNote(clipResult));
}

async function poll(client) {
  const stream = await getLiveStream(process.env.TWITCH_CHANNEL_LOGIN || 'tntnerds');

  if (stream) {
    offlinePolls = 0;
    if (current?.id === stream.id) return;
    // New stream ID while one was already running = a restart; keep the original start time
    // so the end of the whole session triggers one reminder.
    current = { id: stream.id, startedAt: current?.startedAt ?? new Date(stream.started_at) };
    await handleWentLive(client, stream);
    return;
  }

  if (!current) return;
  offlinePolls += 1;
  if (offlinePolls < OFFLINE_POLLS_TO_END) return;

  const ended = current;
  current = null;
  offlinePolls = 0;
  console.log(`Stream ${ended.id} ended.`);
  // Not awaited: clip processing takes a while and the watcher must keep checking for new streams.
  handleStreamEnded(client, ended).catch((err) => console.error('After stream handling failed:', err));
}

export function startLiveWatcher(client) {
  if (!twitchConfigured()) {
    console.log('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set: going live posts and after stream reminders are off.');
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await poll(client);
    } catch (err) {
      console.error('Live watcher check failed:', err);
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, POLL_MS);
}
