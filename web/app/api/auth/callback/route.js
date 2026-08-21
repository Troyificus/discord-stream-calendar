import { cookies } from 'next/headers';
import { createSessionToken } from '../../../../lib/session.js';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(new URL('/', request.url));

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return new Response(`Discord sign-in failed: ${JSON.stringify(tokenData)}`, { status: 400 });
  }

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await userRes.json();

  // Look up their roles in your server - this is what decides core/admin status,
  // not any list we maintain ourselves.
  let roles = [];
  let nick = null;
  const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (memberRes.ok) {
    const member = await memberRes.json();
    roles = member.roles ?? [];
    nick = member.nick ?? null;
  }
  // If memberRes isn't ok (e.g. they're not actually in the server), roles stays empty -
  // they can still sign in and view/request as a guest, just with no special access.

  const isCore = roles.includes(process.env.DISCORD_CORE_ROLE_ID);
  const isAdmin = roles.includes(process.env.DISCORD_ADMIN_ROLE_ID);

  const session = createSessionToken({
    id: user.id,
    username: nick || user.username,
    isCore,
    isAdmin,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  const cookieStore = await cookies();
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  });

  return Response.redirect(new URL('/', request.url));
}
