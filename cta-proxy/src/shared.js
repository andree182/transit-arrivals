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
  const r = await fetch(url, { ...(init || {}), cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('upstream ' + r.status);
  return r.json();
}
export function nowSecs() { return Math.floor(Date.now() / 1000); }
export async function fetchBuf(url, init) {
  const r = await fetch(url, { ...(init || {}), cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('upstream ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
// Fetch a Swiftly feed through its global FeedCache Durable Object. One DO instance
// per feed URL (idFromName) caches + coalesces upstream requests so the shared
// Swiftly key's rate limit is bounded regardless of how many stations/colos are hot.
export async function fetchSwiftlyFeed(env, url, key, ttl) {
  const stub = env.FEED_CACHE.get(env.FEED_CACHE.idFromName(url));
  const r = await stub.fetch('https://feedcache/', {
    method: 'POST',
    body: JSON.stringify({ url, key, ttl })
  });
  if (!r.ok) throw new Error('feedcache ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
