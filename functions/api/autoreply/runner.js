import { listActiveConfigs } from '../../lib/autoreply.js';

function getStore(env) {
  return env.AUTOREPLY || env.ORDERS || null;
}

export async function onRequest({ env, request }) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const secret = request.headers.get('X-Runner-Secret');
  if (!env.RUNNER_SECRET || secret !== env.RUNNER_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = getStore(env);
  if (!store) return Response.json({ configs: [] });

  const configs = await listActiveConfigs(store, env.SESSION_SECRET);
  return Response.json({
    configs: configs.map(({ discordId, prompt, discordToken, groqApiKey, updatedAt }) => ({
      discordId,
      prompt,
      discordToken,
      groqApiKey,
      updatedAt,
    })),
  });
}
