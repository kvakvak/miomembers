import { encryptSecret, decryptSecret } from './secrets.js';

const CONFIG_PREFIX = 'config:';
const ENTITLEMENT_PREFIX = 'entitlement:';

export const DEFAULT_TEST_USERS = ['hrawww'];

export function getTestUsernames(env) {
  const raw = env?.AUTOREPLY_TEST_USERS || DEFAULT_TEST_USERS.join(',');
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isTestUser(username, env) {
  return getTestUsernames(env).includes(String(username || '').toLowerCase());
}

export async function grantEntitlement(discordId, store, meta = {}) {
  if (!store || !discordId) return;
  await store.put(
    `${ENTITLEMENT_PREFIX}${discordId}`,
    JSON.stringify({ granted: true, ...meta, at: new Date().toISOString() })
  );
}

export async function hasEntitlement(user, store, env) {
  if (!user?.id) return false;
  if (isTestUser(user.username, env)) return true;

  if (!store) return false;

  const entitlement = await store.get(`${ENTITLEMENT_PREFIX}${user.id}`);
  if (entitlement) return true;

  if (store.list) {
    const orders = await store.list({ prefix: 'order:' });
    for (const key of orders.keys || []) {
      const raw = await store.get(key.name);
      if (!raw) continue;
      try {
        const order = JSON.parse(raw);
        if (order.discordId === user.id && order.product === 'autoreply') return true;
      } catch {
        // ignore bad rows
      }
    }
  }

  return false;
}

export async function getPublicConfig(discordId, store) {
  if (!store || !discordId) return null;
  const raw = await store.get(`${CONFIG_PREFIX}${discordId}`);
  if (!raw) return null;
  try {
    const config = JSON.parse(raw);
    return {
      prompt: config.prompt || '',
      active: !!config.active,
      configured: !!(config.discordTokenEnc && config.groqApiKeyEnc && config.prompt),
      updatedAt: config.updatedAt || null,
      hasDiscordToken: !!config.discordTokenEnc,
      hasGroqApiKey: !!config.groqApiKeyEnc,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(discordId, body, store, secret) {
  const prompt = String(body.prompt || '').trim();
  const discordToken = String(body.discordToken || '').trim();
  const groqApiKey = String(body.groqApiKey || '').trim();
  const active = body.active !== false;

  if (!prompt) throw new Error('Prompt is required');
  if (prompt.length > 4000) throw new Error('Prompt is too long (max 4000 chars)');

  const existingRaw = await store.get(`${CONFIG_PREFIX}${discordId}`);
  let existing = {};
  if (existingRaw) {
    try { existing = JSON.parse(existingRaw); } catch { existing = {}; }
  }

  const discordTokenEnc = discordToken
    ? await encryptSecret(discordToken, secret)
    : existing.discordTokenEnc;
  const groqApiKeyEnc = groqApiKey
    ? await encryptSecret(groqApiKey, secret)
    : existing.groqApiKeyEnc;

  if (!discordTokenEnc) throw new Error('Discord token is required');
  if (!groqApiKeyEnc) throw new Error('Groq API key is required');

  const record = {
    discordId,
    prompt,
    discordTokenEnc,
    groqApiKeyEnc,
    active,
    updatedAt: new Date().toISOString(),
  };

  await store.put(`${CONFIG_PREFIX}${discordId}`, JSON.stringify(record));
  return getPublicConfig(discordId, store);
}

export async function getDecryptedConfig(discordId, store, secret) {
  if (!store || !discordId || !secret) return null;
  const raw = await store.get(`${CONFIG_PREFIX}${discordId}`);
  if (!raw) return null;
  try {
    const config = JSON.parse(raw);
    if (!config.active) return null;
    const discordToken = await decryptSecret(config.discordTokenEnc, secret);
    const groqApiKey = await decryptSecret(config.groqApiKeyEnc, secret);
    if (!discordToken || !groqApiKey || !config.prompt) return null;
    return {
      discordId,
      prompt: config.prompt,
      discordToken,
      groqApiKey,
      updatedAt: config.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function listActiveConfigs(store, secret) {
  if (!store?.list) return [];
  const listed = await store.list({ prefix: CONFIG_PREFIX });
  const configs = [];
  for (const key of listed.keys || []) {
    const discordId = key.name.replace(CONFIG_PREFIX, '');
    const config = await getDecryptedConfig(discordId, store, secret);
    if (config) configs.push(config);
  }
  return configs;
}

export async function callGroq({ groqApiKey, prompt, message }) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message },
      ],
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Groq request failed');
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned an empty reply');
  return text.slice(0, 1900);
}
