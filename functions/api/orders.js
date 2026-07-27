import { verifySession } from '../lib/session.js';
import { calcTotal, fetchCryptoPrices, buildOrder, notifyDiscord } from '../lib/orders.js';

export async function onRequest({ env, request }) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const user = await verifySession(request.headers.get('Cookie'), env.SESSION_SECRET);
  if (!user) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { product, qty, invite } = body;
  if (!['members', 'vc'].includes(product)) {
    return Response.json({ error: 'Invalid product' }, { status: 400 });
  }

  const quantity = parseInt(qty, 10);
  if (!quantity || quantity < 1) {
    return Response.json({ error: 'Invalid quantity' }, { status: 400 });
  }
  if (product === 'members' && quantity < 100) {
    return Response.json({ error: 'Minimum order is 100 members' }, { status: 400 });
  }

  const inviteTrimmed = (invite || '').trim();
  if (!inviteTrimmed || !/^https?:\/\/(discord\.(gg|com)\/|discordapp\.com\/invite\/)/i.test(inviteTrimmed)) {
    return Response.json({ error: 'Valid Discord invite link required' }, { status: 400 });
  }

  const totalUsd = calcTotal(product, quantity);
  if (totalUsd === null) {
    return Response.json({ error: 'Invalid product' }, { status: 400 });
  }

  try {
    const prices = await fetchCryptoPrices();
    const order = buildOrder({ user, product, qty: quantity, totalUsd, invite: inviteTrimmed, prices, env });

    if (env.ORDERS) {
      await env.ORDERS.put(order.id, JSON.stringify(order), { expirationTtl: 86400 });
    }

    await notifyDiscord(order, env);

    return Response.json({ ok: true, order });
  } catch (err) {
    return Response.json({ error: err.message || 'Checkout failed' }, { status: 500 });
  }
}
