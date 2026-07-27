import { getRedirectUri } from '../../lib/session.js';

export async function onRequest({ env, request }) {
  const clientId = env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return new Response('Discord OAuth not configured', { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(request),
    response_type: 'code',
    scope: 'identify email',
  });

  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
}
