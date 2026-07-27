import { clearSessionCookie } from '../../_lib/session.js';

export async function onRequest({ request }) {
  const origin = new URL(request.url).origin;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/`,
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
