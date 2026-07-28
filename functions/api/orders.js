import { verifySession } from '../lib/session.js';
import { calcTotal, fetchCryptoPrices, buildOrder, notifyDiscord, PRODUCT_MIN_QTY, PRODUCT_MAX_QTY } from '../lib/orders.js';

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

  const { product, qty } = body;
  if (!['members', 'vc', 'spam', 'autoreply'].includes(product)) {
    return Response.json({ error: 'Invalid product' }, { status: 400 });
  }

  const quantity = parseInt(qty, 10);
  if (!quantity || quantity < 1) {
    return Response.json({ error: 'Invalid quantity' }, { status: 400 });
  }

  const minQty = PRODUCT_MIN_QTY[product];
  if (quantity < minQty) {
    const unit = product === 'members' ? 'members' : product === 'spam' ? 'licenses' : product === 'autoreply' ? 'accounts' : 'items';
    return Response.json({ error: `Minimum order is ${minQty} ${unit}` }, { status: 400 });
  }

  const maxQty = PRODUCT_MAX_QTY[product];
  if (maxQty && quantity > maxQty) {
    return Response.json({ error: 'Only 1 can be purchased per order' }, { status: 400 });
  }

  const totalUsd = calcTotal(product, quantity);
  if (totalUsd === null) {
    return Response.json({ error: 'Invalid product' }, { status: 400 });
  }

  try {
    const prices = await fetchCryptoPrices(env);
    const order = buildOrder({ user, product, qty: quantity, totalUsd, prices, env });

    if (env.ORDERS) {
      await env.ORDERS.put(order.id, JSON.stringify(order), { expirationTtl: 86400 });
    }

    await notifyDiscord(order, env);

    return Response.json({ ok: true, order });
  } catch (err) {
    return Response.json({ error: err.message || 'Checkout failed' }, { status: 500 });
  }
}
