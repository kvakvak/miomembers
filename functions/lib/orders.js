const MEMBER_RATE = 0.03;
const VC_BOT_RATE = 0.5;
const SPAM_RATE = 6.5;
const AUTOREPLY_RATE = 4.0;

const PRODUCT_LABELS = {
  members: 'Discord Members',
  vc: 'VC AFK Bots',
  spam: 'Discord Spam',
  autoreply: 'Discord Auto-Reply',
};

export const PRODUCT_MIN_QTY = {
  members: 100,
  vc: 1,
  spam: 1,
  autoreply: 1,
};

export const PRODUCT_MAX_QTY = {
  spam: 1,
  autoreply: 1,
};

export function calcTotal(product, qty) {
  if (product === 'members') return qty * MEMBER_RATE;
  if (product === 'vc') return qty * VC_BOT_RATE;
  if (product === 'spam') return qty * SPAM_RATE;
  if (product === 'autoreply') return qty * AUTOREPLY_RATE;
  return null;
}

const FETCH_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'MioMembers/1.0 (https://miomembers.pages.dev)',
};

async function fetchCoinGecko(env) {
  const key = env?.COINGECKO_API_KEY;
  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', 'bitcoin,ethereum');
  url.searchParams.set('vs_currencies', 'usd');
  if (key) url.searchParams.set('x_cg_demo_api_key', key);

  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.bitcoin?.usd || !data?.ethereum?.usd) return null;
  return { btc: data.bitcoin.usd, eth: data.ethereum.usd, source: 'coingecko' };
}

async function fetchCoinbase() {
  const [btcRes, ethRes] = await Promise.all([
    fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', { headers: FETCH_HEADERS }),
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { headers: FETCH_HEADERS }),
  ]);
  if (!btcRes.ok || !ethRes.ok) return null;
  const [btcData, ethData] = await Promise.all([btcRes.json(), ethRes.json()]);
  const btc = parseFloat(btcData?.data?.amount);
  const eth = parseFloat(ethData?.data?.amount);
  if (!btc || !eth) return null;
  return { btc, eth, source: 'coinbase' };
}

async function fetchBinance() {
  const res = await fetch(
    'https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT"]',
    { headers: FETCH_HEADERS }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data)) return null;
  const btcRow = data.find((r) => r.symbol === 'BTCUSDT');
  const ethRow = data.find((r) => r.symbol === 'ETHUSDT');
  const btc = parseFloat(btcRow?.price);
  const eth = parseFloat(ethRow?.price);
  if (!btc || !eth) return null;
  return { btc, eth, source: 'binance' };
}

export async function fetchCryptoPrices(env = {}) {
  const providers = [
    () => fetchCoinGecko(env),
    () => fetchCoinbase(),
    () => fetchBinance(),
  ];

  for (const getPrices of providers) {
    try {
      const prices = await getPrices();
      if (prices) return prices;
    } catch {
      // try next provider
    }
  }

  throw new Error('Failed to fetch crypto prices');
}

export function makeOrderId() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0];
  return `MM-${n.toString(36).toUpperCase().padStart(6, '0')}`;
}

export function buildOrder({ user, product, qty, totalUsd, invite, prices, env }) {
  const ethAddress = env.ETH_ADDRESS || '0x288B865bdF8eb9DC76518C72D5C87D090126685a';
  const btcAddress = env.BTC_ADDRESS || 'bc1qwdq6qe6vg4vk2s0txg0qwq2vwge4x6yt9hx86n';

  const ethAmount = (totalUsd / prices.eth).toFixed(6);
  const btcAmount = (totalUsd / prices.btc).toFixed(8);

  return {
    id: makeOrderId(),
    product,
    productLabel: PRODUCT_LABELS[product] || product,
    qty,
    totalUsd: +totalUsd.toFixed(2),
    invite,
    discordId: user.id,
    username: user.username,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    payment: {
      eth: { address: ethAddress, amount: ethAmount, usdRate: prices.eth },
      btc: { address: btcAddress, amount: btcAmount, usdRate: prices.btc },
    },
  };
}

export async function notifyDiscord(order, env) {
  const webhook = env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `New order ${order.id}`,
        color: 5793266,
        fields: [
          { name: 'User', value: `${order.username} (${order.discordId})`, inline: true },
          { name: 'Product', value: `${order.qty} x ${order.productLabel}`, inline: true },
          { name: 'Total', value: `$${order.totalUsd.toFixed(2)}`, inline: true },
          { name: 'Invite', value: order.invite },
          { name: 'ETH', value: `${order.payment.eth.amount} ETH`, inline: true },
          { name: 'BTC', value: `${order.payment.btc.amount} BTC`, inline: true },
        ],
      }],
    }),
  });
}
