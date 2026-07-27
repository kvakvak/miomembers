import { signSession, getRedirectUri } from '../../_lib/session.js';

export async function onRequest({ env, request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code || url.searchParams.get('error')) {
    return Response.redirect(`${url.origin}/?login=failed`, 302);
  }

  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return Response.redirect(`${url.origin}/?login=failed`, 302);
  }

  const redirectUri = getRedirectUri(request);

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return Response.redirect(`${url.origin}/?login=failed`, 302);
    }

    const { access_token } = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return Response.redirect(`${url.origin}/?login=failed`, 302);
    }

    const user = await userRes.json();
    const cookie = await signSession(user, env.SESSION_SECRET);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/?login=success`,
        'Set-Cookie': cookie,
      },
    });
  } catch {
    return Response.redirect(`${url.origin}/?login=failed`, 302);
  }
}
