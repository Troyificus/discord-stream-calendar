const ADMIN_IDS = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

export function isAdmin(session) {
  return !!session && ADMIN_IDS.includes(session.id);
}
