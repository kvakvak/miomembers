/**
 * MioMembers — minimal Discord OAuth backend
 * Run: npm install && node server.js
 * Requires: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI in .env
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI = `http://localhost:${PORT}/auth/discord/callback`,
} = process.env;

// In-memory sessions (use Redis/DB in production)
const sessions = new Map();

app.use(express.static(path.join(__dirname, 'public')));

// ─── Step 1: Redirect user to Discord ────────────────────────────
app.get('/auth/discord', (_req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// ─── Step 2: Discord redirects back with ?code=... ───────────────
app.get('/auth/discord/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?login=failed');
  }

  try {
    // Exchange code for access token
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

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text());
      return res.redirect('/?login=failed');
    }

    const { access_token } = await tokenRes.json();

    // Fetch Discord user profile
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = await userRes.json();
    // user = { id, username, avatar, email, ... }

    // Create a simple session (replace with signed JWT + DB in production)
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

// ─── API: current user ───────────────────────────────────────────
function getSessionId(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

app.get('/api/me', (req, res) => {
  const session = sessions.get(getSessionId(req));
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  res.json(session);
});

app.listen(PORT, () => {
  console.log(`MioMembers running at http://localhost:${PORT}`);
});
