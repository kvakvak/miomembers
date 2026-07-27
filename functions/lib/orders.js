const MEMBER_RATE = 0.03;
const VC_BOT_RATE = 0.5;

export function calcTotal(product, qty) {
  if (product === 'members') return qty * MEMBER_RATE;
  if (product === 'vc') return qty * VC_BOT_RATE;
  return null;
}

export async function fetchCryptoPrices() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error('Failed to fetch crypto prices');
  const data = await res.json();
  return {
    btc: data.bitcoin.usd,
    eth: data.ethereum.usd,
  };
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
    productLabel: product === 'members' ? 'Discord Members' : 'VC AFK Bots',
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
