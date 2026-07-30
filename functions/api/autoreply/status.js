import { verifySession } from '../../lib/session.js';
import { hasEntitlement, getPublicConfig } from '../../lib/autoreply.js';

function getStore(env) {
  return env.AUTOREPLY || env.ORDERS || null;
}

export async function onRequest({ env, request }) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const user = await verifySession(request.headers.get('Cookie'), env.SESSION_SECRET);
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 });

  const store = getStore(env);
  const entitled = await hasEntitlement(user, store, env);
  if (!entitled) {
    return Response.json({
      entitled: false,
      configured: false,
      active: false,
    });
  }

  const config = await getPublicConfig(user.id, store);
  return Response.json({
    entitled: true,
    configured: !!config?.configured,
    active: !!config?.active,
    prompt: config?.prompt || '',
    hasDiscordToken: !!config?.hasDiscordToken,
    hasGroqApiKey: !!config?.hasGroqApiKey,
    updatedAt: config?.updatedAt || null,
  });
}
