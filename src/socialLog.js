import { supabase } from './supabaseClient.js';

// social_posts is a ledger of everything the bot has (or deliberately hasn't) posted,
// keyed by (kind, ref), e.g. ('live', twitch stream ID) or ('weekly', '2026-11-30').
// Inserting the row first acts as a lock, so a restart or a double tick can't post twice.

// true if this call created the row (so the caller should go ahead), false if it already existed.
export async function claim(kind, ref) {
  const { error } = await supabase.from('social_posts').insert({ kind, ref });
  if (!error) return true;
  if (error.code === '23505') return false; // unique violation: already claimed
  throw error;
}

export async function getEntry(kind, ref) {
  const { data, error } = await supabase.from('social_posts').select('*').eq('kind', kind).eq('ref', ref).maybeSingle();
  if (error) throw error;
  return data;
}

export async function markPosted(kind, ref, postizPostId = null) {
  const { error } = await supabase
    .from('social_posts')
    .update({ posted_at: new Date().toISOString(), postiz_post_id: postizPostId })
    .eq('kind', kind)
    .eq('ref', ref);
  if (error) throw error;
}

// Was anything of this kind actually posted since `since` (other than `exceptRef`)?
export async function postedSince(kind, since, exceptRef) {
  const { data, error } = await supabase
    .from('social_posts')
    .select('ref')
    .eq('kind', kind)
    .neq('ref', exceptRef)
    .gte('posted_at', since.toISOString())
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
