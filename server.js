require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createAutoreplyStore } = require('./services/autoreply-store');
const {
  hasEntitlement,
  getPublicConfig,
  saveConfig,
  grantEntitlement,
} = require('./services/autoreply-api');
const { AutoReplyRunnerManager } = require('./services/autoreply-runner');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI = `http://localhost:${PORT}/auth/discord/callback`,
  SESSION_SECRET = 'dev-session-secret-change-me',
} = process.env;

const sessions = new Map();
const autoreplyStore = createAutoreplyStore();
const autoreplyRunner = new AutoReplyRunnerManager({
  store: autoreplyStore,
  sessionSecret: SESSION_SECRET,
});

app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html'],
}));

app.get('/auth/discord', (_req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?login=failed');

  try {
    const tokenParams = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });

    if (!tokenRes.ok) return res.redirect('/?login=failed');

    const { access_token } = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const user = await userRes.json();

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      discordId: user.id,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
      loggedInAt: Date.now(),
    });

    res.setHeader(
      'Set-Cookie',
      `session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
    );
    res.redirect('/?login=success');
  } catch (err) {
    console.error(err);
    res.redirect('/?login=failed');
  }
});

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;
  return sessions.get(match[1]) || null;
}

function sessionUser(session) {
  if (!session) return null;
  return {
    id: session.discordId,
    username: session.username,
    avatar: session.avatar,
    email: session.email,
  };
}

app.get('/api/me', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.discordId}/${session.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(session.discordId) % 5}.png`;

  res.json({
    loggedIn: true,
    id: session.discordId,
    username: session.username,
    email: session.email,
    avatarUrl,
  });
});

async function autoreplyStatusHandler(req, res) {
  const user = sessionUser(getSession(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });

  const entitled = await hasEntitlement(user, autoreplyStore);
  if (!entitled) {
    return res.json({ entitled: false, configured: false, active: false });
  }

  const config = await getPublicConfig(user.id, autoreplyStore);
  res.json({
    entitled: true,
    configured: !!config?.configured,
    active: !!config?.active,
    prompt: config?.prompt || '',
    hasDiscordToken: !!config?.hasDiscordToken,
    hasGroqApiKey: !!config?.hasGroqApiKey,
    updatedAt: config?.updatedAt || null,
  });
}

async function autoreplyConfigHandler(req, res) {
  const user = sessionUser(getSession(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });

  const entitled = await hasEntitlement(user, autoreplyStore);
  if (!entitled) return res.status(403).json({ error: 'Auto-Reply not purchased' });

  if (req.method === 'GET') {
    const config = await getPublicConfig(user.id, autoreplyStore);
    return res.json({
      entitled: true,
      configured: !!config?.configured,
      active: !!config?.active,
      prompt: config?.prompt || '',
      hasDiscordToken: !!config?.hasDiscordToken,
      hasGroqApiKey: !!config?.hasGroqApiKey,
      updatedAt: config?.updatedAt || null,
    });
  }

  try {
    const saved = await saveConfig(user.id, req.body, autoreplyStore, SESSION_SECRET);
    await autoreplyRunner.reload(user.id);
    res.json({ ok: true, config: saved });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Save failed' });
  }
}

app.get('/api/autoreply/status', autoreplyStatusHandler);
app.get('/api/autoreply/config', autoreplyConfigHandler);
app.put('/api/autoreply/config', autoreplyConfigHandler);

app.post('/api/orders', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  const { product, qty, invite } = req.body || {};
  if (product === 'autoreply') {
    await grantEntitlement(session.discordId, autoreplyStore, { source: 'order' });
    await autoreplyStore.put(`order:test-${session.discordId}`, JSON.stringify({
      discordId: session.discordId,
      product: 'autoreply',
      username: session.username,
    }));
  }

  res.status(501).json({
    error: 'Local orders checkout is limited. Use production site for crypto checkout, or test Auto-Reply as hrawww.',
  });
});

app.get('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.redirect('/');
});

app.listen(PORT, async () => {
  console.log(`MioMembers running at http://localhost:${PORT}`);
  await autoreplyRunner.startAll();
});
