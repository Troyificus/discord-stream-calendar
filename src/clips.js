// After a stream: collect the clips people made, turn the best ones into vertical captioned
// shorts, and leave them in Postiz as drafts for a human to approve.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getUserId, getClipsBetween, getClipDownloadUrls, twitchConfigured } from './twitch.js';
import { postizConfigured, createPost, uploadMedia, idsFromEnv } from './postiz.js';
import { claim, markPosted, unclaim } from './socialLog.js';
import { findLineupFor } from './roster.js';
import { twitchUrl, withHashtags, getGlobalHashtags } from './announce.js';
import { renderVertical } from './clipRender.js';
import { ukParts, addDays, ukLocalToDate } from './ukTime.js';

const MIN_SECONDS = 5;

export function clipsEnabled() {
  return (process.env.CLIPS || 'on') !== 'off' && twitchConfigured() && postizConfigured() && clipChannels().length > 0;
}

function clipChannels() {
  const ids = idsFromEnv('POSTIZ_CLIP_CHANNELS');
  return ids.length ? ids : idsFromEnv('POSTIZ_LIVE_CHANNELS');
}

// Several viewers often clip the same moment. Using each clip's position in the VOD, drop
// clips that mostly overlap a more viewed one. Expects clips sorted best first.
export function dropOverlaps(clips) {
  const kept = [];
  for (const clip of clips) {
    const start = clip.vod_offset;
    const end = start == null ? null : start + clip.duration;
    const overlaps = start != null && kept.some((k) => {
      if (k.vod_offset == null || k.video_id !== clip.video_id) return false;
      const shared = Math.min(end, k.vod_offset + k.duration) - Math.max(start, k.vod_offset);
      return shared > 0.5 * Math.min(clip.duration, k.duration);
    });
    if (!overlaps) kept.push(clip);
  }
  return kept;
}

// Best first: most views, then longest, then earliest.
export function rankClips(clips) {
  return [...clips]
    .filter((c) => c.duration >= MIN_SECONDS)
    .sort((a, b) => b.view_count - a.view_count || b.duration - a.duration || a.created_at.localeCompare(b.created_at));
}

// Suggested posting slots: one clip per day from tomorrow, at CLIP_POST_TIME UK time.
export function suggestedDates(count, from = new Date()) {
  const today = ukParts(from).isoDate;
  const time = process.env.CLIP_POST_TIME || '18:00';
  return Array.from({ length: count }, (_, i) => ukLocalToDate(addDays(today, i + 1), time));
}

export async function buildClipText(clip) {
  const lineup = await findLineupFor(new Date(clip.created_at));
  const game = lineup?.game ? ` (${lineup.game})` : '';
  const title = clip.title?.trim() || 'From the stream';
  const base = `${title}${game}\n\nCatch us live on Twitch: ${twitchUrl()}`;
  return withHashtags(base, lineup?.hashtags, await getGlobalHashtags());
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// Processes the clips made between `from` and `to`. Returns
// { drafted: [{ title, views, creator }], skipped, error } for the reminder message.
export async function processClips(from, to) {
  const result = { drafted: [], skipped: 0, error: null };
  if (!clipsEnabled()) return { ...result, error: 'not set up' };

  const login = process.env.TWITCH_CHANNEL_LOGIN || 'tntnerds';
  const max = Number(process.env.CLIPS_MAX_PER_STREAM || 5);

  const broadcasterId = await getUserId(login);
  const all = await getClipsBetween(broadcasterId, from, to);
  const candidates = dropOverlaps(rankClips(all));

  const fresh = [];
  for (const clip of candidates) {
    if (fresh.length >= max) break;
    if (await claim('clip', clip.id)) fresh.push(clip);
    else result.skipped += 1; // already handled on an earlier run
  }
  console.log(`Clips: ${all.length} found, ${candidates.length} after ranking and overlap removal, ${fresh.length} new to process.`);
  if (!fresh.length) return result;

  let urls;
  try {
    urls = await getClipDownloadUrls(broadcasterId, fresh.map((c) => c.id));
  } catch (err) {
    console.error('Getting clip downloads failed. Has the channel run "npm run twitch-clips-auth"?', err.message);
    for (const clip of fresh) await unclaim('clip', clip.id);
    return { ...result, error: 'download permission missing' };
  }

  const dates = suggestedDates(fresh.length);
  for (const [i, clip] of fresh.entries()) {
    const source = urls[clip.id]?.landscape;
    if (!source) {
      console.warn(`Clip ${clip.id} has no download link; skipping.`);
      await unclaim('clip', clip.id);
      continue;
    }
    const work = await mkdtemp(path.join(tmpdir(), 'clip-'));
    try {
      const input = path.join(work, 'source.mp4');
      await download(source, input);
      const { output, captioned } = await renderVertical(input, work, { topText: `twitch.tv/${login}` });
      const media = await uploadMedia(await readFile(output), `tnt-clip-${clip.id}.mp4`, 'video/mp4');
      const postId = await createPost({
        integrationIds: clipChannels(),
        content: await buildClipText(clip),
        image: media,
        type: 'draft',
        date: dates[i]
      });
      await markPosted('clip', clip.id, postId);
      result.drafted.push({ title: clip.title, views: clip.view_count, creator: clip.creator_name, captioned });
      console.log(`Clip ${clip.id} drafted in Postiz${captioned ? ' with captions' : ''}.`);
    } catch (err) {
      console.error(`Clip ${clip.id} failed:`, err);
      await unclaim('clip', clip.id); // so /clips can try it again
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  return result;
}

// The reminder DM text for after a stream, or null to use the standard one.
export function reminderNote(result) {
  if (!result || result.error) return null;
  if (!result.drafted.length) {
    return "🎬 Stream's over. Nobody clipped anything this time, so there's nothing to review. If you remember a good moment, clip it from the VOD in Twitch's Clips Manager, then run **/clips** in Discord and it'll be prepared for you.";
  }
  const list = result.drafted
    .map((c) => `• ${c.title || 'Untitled clip'} (${c.views} view${c.views === 1 ? '' : 's'}, clipped by ${c.creator})`)
    .join('\n');
  const n = result.drafted.length;
  return `🎬 Stream's over. **${n} clip${n === 1 ? '' : 's'}** from this stream ${n === 1 ? 'is' : 'are'} waiting in Postiz as drafts, one per day from tomorrow:\n${list}\n\nOpen each one, give it a quick check, and schedule the ones you like. Delete the rest. That's the whole job.`;
}
