'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifySessionToken } from '../lib/session.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getMonthDates, WEEKDAY_INDEX, formatDateUK } from '../lib/calendar.js';

async function getSessionUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get('session')?.value);
}

function check(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function getUKOffsetMinutes(date) {
  // Compare noon UTC on that date to how it reads in Europe/London, to get the current
  // BST/GMT offset for that specific date (handles the March/October changeover correctly).
  const utcNoon = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(utcNoon);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute - 12 * 60; // +60 during BST, 0 during GMT
}

// Admin enters UK wall-clock time (matching everything else in the UI) - this converts
// it to the correct UTC instant to store, accounting for BST/GMT automatically.
function parseTimeToUtc(date, time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) {
    throw new Error(`"${time}" isn't a valid time - use the time picker (HH:MM).`);
  }
  const naiveUtc = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(naiveUtc.getTime())) {
    throw new Error(`"${date} ${time}" isn't a valid date/time.`);
  }
  const offsetMinutes = getUKOffsetMinutes(date);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60_000).toISOString();
}

async function getOrCreateDay(date) {
  const { data: existing, error: selectError } = await supabaseAdmin.from('stream_days').select('*').eq('date', date).maybeSingle();
  check(selectError, 'Looking up that day failed');
  if (existing) return existing;

  const { data: created, error: insertError } = await supabaseAdmin.from('stream_days').insert({ date }).select().single();
  check(insertError, 'Creating that day failed');
  return created;
}

export async function joinDay(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  if (!user.isCore) throw new Error('Not on the core roster.');

  const day = await getOrCreateDay(date);
  const { error } = await supabaseAdmin.from('attendance').upsert({
    stream_day_id: day.id,
    discord_user_id: user.id,
    display_name: user.username
  });
  check(error, 'Joining failed');
  revalidatePath('/');
}

export async function leaveDay(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  if (!user.isCore) throw new Error('Not on the core roster.');

  const day = await getOrCreateDay(date);
  const { error } = await supabaseAdmin.from('attendance').delete().eq('stream_day_id', day.id).eq('discord_user_id', user.id);
  check(error, 'Leaving failed');
  revalidatePath('/');
}

export async function requestGuest(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');

  const day = await getOrCreateDay(date);
  const { error } = await supabaseAdmin.from('guest_requests').insert({
    stream_day_id: day.id,
    discord_user_id: user.id,
    display_name: user.username
  });
  check(error, 'Sending the request failed');
  revalidatePath('/');

  if (process.env.DISCORD_GUEST_REQUEST_WEBHOOK_URL) {
    try {
      await fetch(process.env.DISCORD_GUEST_REQUEST_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**${user.username}** wants to guest on **${formatDateUK(date)}** - review it in the calendar's Admin panel.`
        })
      });
    } catch (err) {
      // Notification failing shouldn't block the actual request from being saved.
      console.error('Guest request webhook failed:', err);
    }
  }
}

// ---------- Admin ----------

export async function setGame(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const date = formData.get('date');
  const game = formData.get('game');
  const time = formData.get('time');
  if (!date) throw new Error('Pick a date.');
  if (!game) throw new Error('Enter a game.');
  const startTimeUtc = parseTimeToUtc(date, time);

  const day = await getOrCreateDay(date);
  const { error } = await supabaseAdmin.from('stream_days').update({ game, start_time_utc: startTimeUtc, updated_at: new Date().toISOString() }).eq('id', day.id);
  check(error, 'Saving the game failed');
  revalidatePath('/');
}

export async function clearGame(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const date = formData.get('date');
  if (!date) throw new Error('Pick a date.');

  const day = await getOrCreateDay(date);
  const { error } = await supabaseAdmin.from('stream_days').update({ game: null, start_time_utc: null, updated_at: new Date().toISOString() }).eq('id', day.id);
  check(error, 'Clearing the game failed');

  // No event, no attendees - clear anyone who'd signed up or requested to guest for it.
  const { error: attendanceError } = await supabaseAdmin.from('attendance').delete().eq('stream_day_id', day.id);
  check(attendanceError, 'Clearing signups failed');

  const { error: requestsError } = await supabaseAdmin.from('guest_requests').delete().eq('stream_day_id', day.id);
  check(requestsError, 'Clearing guest requests failed');

  revalidatePath('/');
}

export async function setCapacity(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const date = formData.get('date');
  const capacity = Number(formData.get('capacity'));
  if (!date) throw new Error('Pick a date.');
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Capacity must be a whole number of at least 1.');

  const day = await getOrCreateDay(date);
  const { error } = await supabaseAdmin.from('stream_days').update({ capacity, updated_at: new Date().toISOString() }).eq('id', day.id);
  check(error, 'Saving capacity failed');
  revalidatePath('/');
}

export async function setRecurring(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const weekday = formData.get('weekday');
  const game = formData.get('game');
  const time = formData.get('time');
  if (!game) throw new Error('Enter a game.');
  if (!(weekday in WEEKDAY_INDEX)) throw new Error(`"${weekday}" isn't a valid weekday.`);

  const targetIndex = WEEKDAY_INDEX[weekday];
  const matches = getMonthDates().filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === targetIndex);
  if (!matches.length) throw new Error(`No ${weekday}s left this month.`);

  for (const date of matches) {
    const startTimeUtc = parseTimeToUtc(date, time);
    const day = await getOrCreateDay(date);
    const { error } = await supabaseAdmin.from('stream_days').update({ game, start_time_utc: startTimeUtc, updated_at: new Date().toISOString() }).eq('id', day.id);
    check(error, `Saving ${date} failed`);
  }
  revalidatePath('/');
}

export async function approveRequest(id) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');
  const { error } = await supabaseAdmin.from('guest_requests').update({ status: 'approved' }).eq('id', id);
  check(error, 'Approving failed');
  revalidatePath('/');
}

export async function denyRequest(id) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');
  const { error } = await supabaseAdmin.from('guest_requests').update({ status: 'denied' }).eq('id', id);
  check(error, 'Denying failed');
  revalidatePath('/');
}

export async function uploadThumbnail(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const tag = (formData.get('tag') || '').trim();
  const file = formData.get('file');
  if (!tag) throw new Error('Enter a game tag - it must match the game name you type into "Set a day" exactly (not case-sensitive).');
  if (!file || typeof file === 'string' || file.size === 0) throw new Error('Choose an image file.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
  const path = `${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('game-thumbnails')
    .upload(path, bytes, { contentType: file.type || 'image/png', upsert: true });
  check(uploadError, 'Uploading the thumbnail failed - check the "game-thumbnails" storage bucket exists and is public');

  const { data: publicUrlData } = supabaseAdmin.storage.from('game-thumbnails').getPublicUrl(path);

  const { error: dbError } = await supabaseAdmin
    .from('game_thumbnails')
    .upsert({ tag: tag.toLowerCase(), image_url: publicUrlData.publicUrl }, { onConflict: 'tag' });
  check(dbError, 'Saving the thumbnail failed');

  revalidatePath('/');
}
