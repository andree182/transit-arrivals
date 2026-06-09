const CORS = { 'access-control-allow-origin': '*' };
export function json(obj, ttl) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}`, ...CORS }
  });
}
export function corsResponse(body, init = {}) {
  return new Response(body, { ...init, headers: { ...(init.headers || {}), ...CORS } });
}
export async function cached(request, ctx, ttl, build) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await build();
  const resolved = json(res, ttl);
  ctx.waitUntil(cache.put(request, resolved.clone()));
  return resolved;
}
export async function fetchJSON(url, init) {
  const r = await fetch(url, { cf: { cacheTtl: 0 }, ...(init || {}) });
  if (!r.ok) throw new Error('upstream ' + r.status);
  return r.json();
}
export function nowSecs() { return Math.floor(Date.now() / 1000); }
