const { encryptSecret, decryptSecret } = require('./autoreply-crypto');

const CONFIG_PREFIX = 'config:';
const ENTITLEMENT_PREFIX = 'entitlement:';
const DEFAULT_TEST_USERS = ['hrawww'];

function getTestUsernames(env) {
  const raw = process.env.AUTOREPLY_TEST_USERS || DEFAULT_TEST_USERS.join(',');
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function isTestUser(username) {
  return getTestUsernames().includes(String(username || '').toLowerCase());
}

async function grantEntitlement(discordId, store, meta = {}) {
  await store.put(
    `${ENTITLEMENT_PREFIX}${discordId}`,
    JSON.stringify({ granted: true, ...meta, at: new Date().toISOString() })
  );
}

async function hasEntitlement(user, store) {
  if (!user?.id) return false;
  if (isTestUser(user.username)) return true;
  if (!store) return false;
  if (await store.get(`${ENTITLEMENT_PREFIX}${user.id}`)) return true;

  const listed = await store.list({ prefix: 'order:' });
  for (const key of listed.keys || []) {
    const raw = await store.get(key.name);
    if (!raw) continue;
    try {
      const order = JSON.parse(raw);
      if (order.discordId === user.id && order.product === 'autoreply') return true;
    } catch {
      // ignore
    }
  }
  return false;
}

async function getPublicConfig(discordId, store) {
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

async function saveConfig(discordId, body, store, secret) {
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
    ? encryptSecret(discordToken, secret)
    : existing.discordTokenEnc;
  const groqApiKeyEnc = groqApiKey
    ? encryptSecret(groqApiKey, secret)
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

module.exports = {
  grantEntitlement,
  hasEntitlement,
  getPublicConfig,
  saveConfig,
  isTestUser,
};
