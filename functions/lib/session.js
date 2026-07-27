const COOKIE_NAME = 'miomembers_session';
const MAX_AGE = 60 * 60 * 24 * 7;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(user, secret) {
  const payload = {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    email: user.email || null,
    exp: Date.now() + MAX_AGE * 1000,
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = toBase64Url(new TextEncoder().encode(payloadStr));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${COOKIE_NAME}=${payloadB64}.${sigB64}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export async function verifySession(cookieHeader, secret) {
  if (!cookieHeader || !secret) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const [payloadB64, sigB64] = match[1].split('.');
  if (!payloadB64 || !sigB64) return null;

  const key = await getKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    new TextEncoder().encode(payloadB64)
  );
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  if (payload.exp < Date.now()) return null;
  return payload;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getRedirectUri(request) {
  return `${new URL(request.url).origin}/auth/discord/callback`;
}
