require('dotenv').config();
const { AutoReplyRunnerManager, AutoReplySession } = require('./autoreply-runner');

const RUNNER_URL = process.env.AUTOREPLY_RUNNER_URL || 'https://miomembers.pages.dev/api/autoreply/runner';
const RUNNER_SECRET = process.env.RUNNER_SECRET;

if (!RUNNER_SECRET) {
  console.error('Set RUNNER_SECRET in .env');
  process.exit(1);
}

const sessions = new Map();
const POLL_MS = Number(process.env.AUTOREPLY_POLL_MS || 15000);

function log(discordId, message) {
  console.log(`[autoreply:${discordId}] ${message}`);
}

async function fetchConfigs() {
  const res = await fetch(RUNNER_URL, {
    headers: { 'X-Runner-Secret': RUNNER_SECRET },
  });
  if (!res.ok) throw new Error(`Runner sync failed (${res.status})`);
  const data = await res.json();
  return data.configs || [];
}

async function syncOnce() {
  const configs = await fetchConfigs();
  const activeIds = new Set(configs.map((c) => c.discordId));

  for (const id of [...sessions.keys()]) {
    if (!activeIds.has(id)) {
      sessions.get(id).stop();
      sessions.delete(id);
      log(id, 'stopped');
    }
  }

  for (const config of configs) {
    if (sessions.has(config.discordId)) continue;
    const session = new AutoReplySession(config, log);
    sessions.set(config.discordId, session);
    try {
      await session.start();
    } catch (err) {
      log(config.discordId, `failed to start: ${err.message}`);
      sessions.delete(config.discordId);
    }
  }
}

async function main() {
  console.log(`Auto-reply runner polling ${RUNNER_URL}`);
  await syncOnce();
  setInterval(() => {
    syncOnce().catch((err) => console.error('sync error:', err.message));
  }, POLL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
