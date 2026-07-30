import { verifySession } from '../../lib/session.js';
import {
  hasEntitlement,
  getPublicConfig,
  saveConfig,
} from '../../lib/autoreply.js';

function getStore(env) {
  return env.AUTOREPLY || env.ORDERS || null;
}

export async function onRequest({ env, request }) {
  const user = await verifySession(request.headers.get('Cookie'), env.SESSION_SECRET);
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 });

  const store = getStore(env);
  const entitled = await hasEntitlement(user, store, env);
  if (!entitled) {
    return Response.json({ error: 'Auto-Reply not purchased' }, { status: 403 });
  }

  if (request.method === 'GET') {
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

  if (request.method === 'PUT') {
    if (!store) {
      return Response.json({ error: 'Storage not configured' }, { status: 503 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    try {
      const config = await saveConfig(user.id, body, store, env.SESSION_SECRET);
      return Response.json({ ok: true, config });
    } catch (err) {
      return Response.json({ error: err.message || 'Save failed' }, { status: 400 });
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
