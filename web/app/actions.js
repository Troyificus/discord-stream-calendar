'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifySessionToken } from '../lib/session.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

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
  const { data: member } = await supabaseAdmin.from('members').select('*').eq('discord_user_id', user.id).single();
  if (!member) throw new Error('Not on the core roster.');

  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('attendance').upsert({ stream_day_id: day.id, member_id: member.id });
  revalidatePath('/');
}

export async function leaveDay(date) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  const { data: member } = await supabaseAdmin.from('members').select('*').eq('discord_user_id', user.id).single();
  if (!member) throw new Error('Not on the core roster.');

  const day = await getOrCreateDay(date);
  await supabaseAdmin.from('attendance').delete().eq('stream_day_id', day.id).eq('member_id', member.id);
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
