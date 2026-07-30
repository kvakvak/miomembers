const WebSocket = require('ws');
const { decryptSecret } = require('./autoreply-crypto');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DM_INTENTS = 4096 + 32768; // direct messages + message content

async function callGroq({ groqApiKey, prompt, message }) {
  const res = await fetch(GROQ_URL, {
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
  if (!res.ok) throw new Error(data?.error?.message || 'Groq request failed');
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned an empty reply');
  return text.slice(0, 1900);
}

class AutoReplySession {
  constructor(config, onStatus) {
    this.config = config;
    this.onStatus = onStatus;
    this.ws = null;
    this.heartbeatInterval = null;
    this.userId = null;
    this.processing = new Set();
  }

  log(message) {
    this.onStatus?.(this.config.discordId, message);
  }

  async start() {
    const gatewayRes = await fetch('https://discord.com/api/v10/gateway');
    const gateway = await gatewayRes.json();
    if (!gateway?.url) throw new Error('Could not fetch Discord gateway');

    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${gateway.url}?v=10&encoding=json`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (raw) => this.handlePayload(raw.toString()));
    this.ws.on('close', () => {
      this.log('disconnected');
      this.cleanup();
    });
    this.ws.on('error', (err) => this.log(`socket error: ${err.message}`));
  }

  cleanup() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
    this.ws = null;
  }

  stop() {
    this.cleanup();
    if (this.ws) this.ws.close();
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  handlePayload(raw) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const { op, d, t } = payload;

    if (op === 10) {
      this.send({
        op: 2,
        d: {
          token: this.config.discordToken,
          intents: DM_INTENTS,
          properties: { os: 'linux', browser: 'd', device: 'd' },
        },
      });
      this.heartbeatInterval = setInterval(() => this.send({ op: 1, d: null }), d.heartbeat_interval);
      return;
    }

    if (op === 11) return;

    if (t === 'READY') {
      this.userId = d.user.id;
      this.log(`online as ${d.user.username}`);
      return;
    }

    if (t === 'MESSAGE_CREATE') {
      this.onDirectMessage(d).catch((err) => this.log(`reply failed: ${err.message}`));
    }
  }

  async onDirectMessage(message) {
    if (message.guild_id) return;
    if (!message.content?.trim()) return;
    if (message.author?.bot) return;
    if (this.userId && message.author.id === this.userId) return;
    if (this.processing.has(message.id)) return;

    this.processing.add(message.id);
    try {
      this.log(`DM from ${message.author.username}: ${message.content.slice(0, 80)}`);
      const reply = await callGroq({
        groqApiKey: this.config.groqApiKey,
        prompt: this.config.prompt,
        message: message.content,
      });
      await this.sendDiscordMessage(message.channel_id, reply);
      this.log(`replied in channel ${message.channel_id}`);
    } finally {
      this.processing.delete(message.id);
    }
  }

  async sendDiscordMessage(channelId, content) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: this.config.discordToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || 'Failed to send Discord message');
    }
  }
}

class AutoReplyRunnerManager {
  constructor({ store, sessionSecret, onStatus }) {
    this.store = store;
    this.sessionSecret = sessionSecret;
    this.onStatus = onStatus || ((id, msg) => console.log(`[autoreply:${id}] ${msg}`));
    this.sessions = new Map();
  }

  async getDecryptedConfig(discordId) {
    const raw = await this.store.get(`config:${discordId}`);
    if (!raw) return null;
    const config = JSON.parse(raw);
    if (!config.active) return null;
    const discordToken = decryptSecret(config.discordTokenEnc, this.sessionSecret);
    const groqApiKey = decryptSecret(config.groqApiKeyEnc, this.sessionSecret);
    if (!discordToken || !groqApiKey || !config.prompt) return null;
    return {
      discordId,
      prompt: config.prompt,
      discordToken,
      groqApiKey,
    };
  }

  async reload(discordId) {
    this.stopOne(discordId);
    const config = await this.getDecryptedConfig(discordId);
    if (!config) return;
    const session = new AutoReplySession(config, this.onStatus);
    this.sessions.set(discordId, session);
    try {
      await session.start();
    } catch (err) {
      this.onStatus(discordId, `failed to start: ${err.message}`);
      this.sessions.delete(discordId);
    }
  }

  stopOne(discordId) {
    const session = this.sessions.get(discordId);
    if (session) {
      session.stop();
      this.sessions.delete(discordId);
    }
  }

  async startAll() {
    const listed = await this.store.list({ prefix: 'config:' });
    for (const key of listed.keys || []) {
      const discordId = key.name.replace('config:', '');
      await this.reload(discordId);
    }
  }

  stopAll() {
    for (const discordId of [...this.sessions.keys()]) {
      this.stopOne(discordId);
    }
  }
}

module.exports = { AutoReplyRunnerManager, AutoReplySession, callGroq };
