import { supabaseAdmin } from './supabaseAdmin.js';

// Returns { "helldivers 2": "https://...", "balatro": "https://..." } - lowercase tag -> image URL.
export async function getThumbnailMap() {
  const { data, error } = await supabaseAdmin.from('game_thumbnails').select('tag, image_url');
  if (error) {
    console.error('Loading thumbnails failed:', error);
    return {};
  }
  const map = {};
  for (const row of data ?? []) {
    map[row.tag.toLowerCase()] = row.image_url;
  }
  return map;
}
