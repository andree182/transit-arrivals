import { transformArrivals } from './arrivals.js';
import { transformAlerts } from './alerts.js';

const ARR_TTL = 25;   // seconds — keeps well under 100k/day CTA quota
const ALR_TTL = 60;

const CORS = { 'access-control-allow-origin': '*' };

function json(obj, ttl) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}`, ...CORS }
  });
}

async function cached(request, ctx, ttl, build) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await build();
  const resolved = json(res, ttl);
  ctx.waitUntil(cache.put(request, resolved.clone()));
  return resolved;
}

async function fetchJSON(url) {
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('upstream ' + r.status);
  return r.json();
}

function nowSecs() { return Math.floor(Date.now() / 1000); }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') return new Response('ok', { headers: CORS });

    if (url.pathname === '/cta/arrivals') {
      const mapid = url.searchParams.get('mapid');
      if (!/^\d{5}$/.test(mapid || '')) return json({ error: 'bad mapid' }, 0);
      return cached(request, ctx, ARR_TTL, async () => {
        const u = `https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${env.CTA_KEY}&mapid=${mapid}&max=12&outputType=JSON`;
        const data = await fetchJSON(u);
        if (!data?.ctatt || data.ctatt.errCd !== '0') throw new Error('cta errCd ' + (data?.ctatt?.errCd));
        return transformArrivals(data.ctatt, nowSecs());
      }).catch((e) => {
        console.log(JSON.stringify({ msg: 'cta upstream fail', path: url.pathname, err: String(e) }));
        return json({ epoch: nowSecs(), model: [] }, 0);
      });
    }

    if (url.pathname === '/cta/alerts') {
      const labels = (url.searchParams.get('routes') || '').split(',').filter(Boolean);
      return cached(request, ctx, ALR_TTL, async () => {
        const [routes, alerts] = await Promise.all([
          fetchJSON('https://www.transitchicago.com/api/1.0/routes.aspx?outputType=JSON'),
          fetchJSON('https://www.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON&activeonly=true')
        ]);
        return transformAlerts(routes, alerts, labels);
      }).catch((e) => {
        console.log(JSON.stringify({ msg: 'cta upstream fail', path: url.pathname, err: String(e) }));
        return json({ alerts: [], suspensions: [] }, 0);
      });
    }

    return new Response('not found', { status: 404, headers: CORS });
  }
};
