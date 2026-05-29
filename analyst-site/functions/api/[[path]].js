/**
 * Cloudflare Pages Function: proxy /api/* to the production VibeSwitch API (Option A).
 *
 * Set Pages env `API_ORIGIN` (e.g. https://vibeswitch.ai). Local dev uses Vite proxy instead.
 *
 * @param {import('@cloudflare/workers-types').EventContext<{ API_ORIGIN?: string }, string, unknown>} context
 */
export async function onRequest(context) {
  const apiOrigin = String(context.env.API_ORIGIN || 'https://vibeswitch.ai').replace(/\/$/, '');
  const incoming = new URL(context.request.url);
  const target = `${apiOrigin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(context.request.headers);
  headers.delete('host');

  /** @type {RequestInit} */
  const init = {
    method: context.request.method,
    headers,
    redirect: 'manual',
  };

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
  }

  return fetch(target, init);
}
