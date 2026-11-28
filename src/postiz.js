// Minimal client for the Postiz public API (https://docs.postiz.com/public-api).
// Postiz owns the connections to each social network; the bot just hands it posts.
//
// POSTIZ_API_URL: https://api.postiz.com/public/v1 for Postiz Cloud,
//                 or https://<your postiz backend>/public/v1 if self-hosted.
// POSTIZ_API_KEY: Postiz -> Settings -> Developers -> Public API.
// Note: create post is rate limited (roughly 30 to 100 an hour depending on version),
// far above what this bot sends.

// Platforms that can't take a text-only or image post, so the bot never sends them anything.
const VIDEO_ONLY = new Set(['tiktok', 'youtube']);
// Platforms that need an image attached.
const NEEDS_IMAGE = new Set(['instagram', 'instagram-standalone', 'pinterest']);

let integrationCache = null;
let integrationCacheAt = 0;

export function postizConfigured() {
  return Boolean(process.env.POSTIZ_API_URL && process.env.POSTIZ_API_KEY);
}

function baseUrl() {
  return process.env.POSTIZ_API_URL.replace(/\/+$/, '');
}

async function postizFetch(path, options = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: { Authorization: process.env.POSTIZ_API_KEY, ...(options.headers ?? {}) }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Postiz ${options.method ?? 'GET'} ${path} failed: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// [{ id, name, identifier, profile, disabled, ... }]
export async function listIntegrations({ fresh = false } = {}) {
  if (!fresh && integrationCache && Date.now() - integrationCacheAt < 60 * 60 * 1000) return integrationCache;
  integrationCache = await postizFetch('/integrations');
  integrationCacheAt = Date.now();
  return integrationCache;
}

// Comma separated list of integration IDs from an env var -> array.
export function idsFromEnv(name) {
  return (process.env[name] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Threads only allows one topic tag per post (the first one counts, the rest are clutter),
// so keep the first hashtag and drop the others. Game tags come before global tags in our
// posts, so this keeps the stream's first game tag, or the first global tag if it has none.
export function keepFirstHashtag(content) {
  let kept = false;
  const stripped = content.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (match, lead) => {
    if (kept) return lead === '\n' ? '\n' : '';
    kept = true;
    return match;
  });
  return stripped
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function contentFor(identifier, content) {
  return identifier === 'threads' ? keepFirstHashtag(content) : content;
}

function settingsFor(identifier) {
  switch (identifier) {
    case 'x':
      return { __type: 'x', who_can_reply_post: 'everyone' };
    case 'instagram':
    case 'instagram-standalone':
      return { __type: identifier, post_type: 'post', collaborators: [] };
    default:
      return { __type: identifier };
  }
}

// Uploads a PNG buffer, returns { id, path } ready to attach to a post.
export async function uploadImage(buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);
  const media = await postizFetch('/upload', { method: 'POST', body: form });
  return { id: media.id, path: media.path };
}

// Sends one post to several channels. type: 'now' or 'schedule'.
// Returns the first Postiz post ID (deleting it removes the whole group), or null if nothing was sent.
export async function createPost({ integrationIds, content, image = null, type = 'now', date = new Date() }) {
  if (!integrationIds.length) return null;

  const integrations = await listIntegrations();
  const posts = [];
  for (const id of integrationIds) {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) {
      console.warn(`Postiz: no connected channel with ID ${id}, skipping. Run "npm run postiz-channels" to list IDs.`);
      continue;
    }
    if (integration.disabled) {
      console.warn(`Postiz: channel ${integration.name} is disabled, skipping.`);
      continue;
    }
    if (VIDEO_ONLY.has(integration.identifier) || (NEEDS_IMAGE.has(integration.identifier) && !image)) {
      console.warn(`Postiz: ${integration.identifier} can't take this kind of post, skipping ${integration.name}.`);
      continue;
    }
    posts.push({
      integration: { id },
      value: [{ content: contentFor(integration.identifier, content), image: image ? [image] : [] }],
      settings: settingsFor(integration.identifier)
    });
  }
  if (!posts.length) return null;

  const result = await postizFetch('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, date: date.toISOString(), shortLink: false, tags: [], posts })
  });
  return Array.isArray(result) ? result[0]?.postId ?? null : result?.postId ?? null;
}

export async function deletePost(postId) {
  await postizFetch(`/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
}
