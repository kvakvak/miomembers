import { verifySession } from '../_lib/session.js';

export async function onRequest({ env, request }) {
  const cookie = request.headers.get('Cookie');
  const user = await verifySession(cookie, env.SESSION_SECRET);

  if (!user) {
    return Response.json({ loggedIn: false }, { status: 401 });
  }

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`;

  return Response.json({
    loggedIn: true,
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl,
  });
}
