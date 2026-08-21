'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifySessionToken } from '../lib/session.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getMonthDates, WEEKDAY_INDEX } from '../lib/calendar.js';

async function getSessionUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get('session')?.value);
}

async function getOrCreateDay(date) {
  const { data: existing } = await supabaseAdmin.from('stream_days').select('*').eq('date', date).single();
  if (existing) return existing;
  const { data: created } = await supabaseAdmin.from('stream_days').insert({ date }).select().single();
  return created;
}

export async function joinDay(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  if (!user.isCore) throw new Error('Not on the core roster.');

  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('attendance').upsert({
    stream_day_id: day.id,
    discord_user_id: user.id,
    display_name: user.username
  });
  revalidatePath('/');
}

export async function leaveDay(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  if (!user.isCore) throw new Error('Not on the core roster.');

  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('attendance').delete().eq('stream_day_id', day.id).eq('discord_user_id', user.id);
  revalidatePath('/');
}

export async function requestGuest(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');

  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('guest_requests').insert({
    stream_day_id: day.id,
    discord_user_id: user.id,
    display_name: user.username
  });
  revalidatePath('/');
}

// ---------- Admin ----------

export async function setGame(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const date = formData.get('date');
  const game = formData.get('game');
  const time = formData.get('time');
  const startTimeUtc = new Date(`${date}T${time}:00Z`).toISOString();

  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('stream_days').update({ game, start_time_utc: startTimeUtc }).eq('id', day.id);
  revalidatePath('/');
}

export async function clearGame(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const date = formData.get('date');
  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('stream_days').update({ game: null, start_time_utc: null }).eq('id', day.id);
  revalidatePath('/');
}

export async function setCapacity(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const date = formData.get('date');
  const capacity = Number(formData.get('capacity'));
  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('stream_days').update({ capacity }).eq('id', day.id);
  revalidatePath('/');
}

export async function setRecurring(formData) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');

  const weekday = formData.get('weekday');
  const game = formData.get('game');
  const time = formData.get('time');
  const targetIndex = WEEKDAY_INDEX[weekday];
  const matches = getMonthDates().filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === targetIndex);

  for (const date of matches) {
    const startTimeUtc = new Date(`${date}T${time}:00Z`).toISOString();
    const day = await getOrCreateDay(date);
    await supabaseAdmin.from('stream_days').update({ game, start_time_utc: startTimeUtc }).eq('id', day.id);
  }
  revalidatePath('/');
}

export async function approveRequest(id) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');
  await supabaseAdmin.from('guest_requests').update({ status: 'approved' }).eq('id', id);
  revalidatePath('/');
}

export async function denyRequest(id) {
  const user = await getSessionUser();
  if (!user?.isAdmin) throw new Error('Admin only.');
  await supabaseAdmin.from('guest_requests').update({ status: 'denied' }).eq('id', id);
  revalidatePath('/');
}
