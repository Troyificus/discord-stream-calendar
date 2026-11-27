// Hashtags are stored on stream_days.hashtags as one normalised string, e.g. "#warhammer #minipainting".
// The same file lives in the website (web/lib/hashtags.js); keep the two in step.

// "Warhammer, #mini painting!!" -> "#Warhammer #mini #painting"
// Accepts tags separated by spaces or commas, with or without #. Drops punctuation
// (hashtags can't contain it) and duplicates. Returns null when nothing is left.
export function normalizeHashtags(input) {
  const seen = new Set();
  const tags = [];
  for (const raw of String(input ?? '').split(/[\s,]+/)) {
    const word = raw.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!word || /^\d+$/.test(word)) continue; // all-number tags aren't treated as hashtags
    if (seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    tags.push(`#${word}`);
  }
  return tags.length ? tags.join(' ') : null;
}

// rows: stream_days rows with { game, hashtags, date }. Returns { 'warhammer': '#warhammer ...' },
// using the most recent day that had hashtags for each game - the fallback when a day has none.
export function latestHashtagsByGame(rows) {
  const map = {};
  for (const row of [...(rows ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const key = row.game?.trim().toLowerCase();
    if (key && row.hashtags && !(key in map)) map[key] = row.hashtags;
  }
  return map;
}
