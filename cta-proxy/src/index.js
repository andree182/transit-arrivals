import { cached, json, corsResponse, nowSecs } from './shared.js';
import * as cta from './agencies/cta.js';
import * as wmata from './agencies/wmata.js';
import * as marta from './agencies/marta.js';
import * as lametro from './agencies/lametro.js';
import * as bart from './agencies/bart.js';
import * as mbta from './agencies/mbta.js';
import * as septa from './agencies/septa.js';
import * as gcrta from './agencies/gcrta.js';
import * as miami from './agencies/miami.js';
import * as baltimore from './agencies/baltimore.js';
import * as skyline from './agencies/skyline.js';

const AGENCIES = { cta, wmata, marta, lametro, bart, mbta, septa, gcrta, miami, baltimore, skyline };
const ARR_TTL = 25, ALR_TTL = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return corsResponse('ok');
    const m = url.pathname.match(/^\/([a-z]+)\/(arrivals|alerts)$/);
    if (m) {
      const agency = AGENCIES[m[1]];
      if (!agency) return json({ error: 'unknown agency' }, 0);
      if (m[2] === 'arrivals') {
        const station = url.searchParams.get('station') || url.searchParams.get('mapid');
        if (!station) return json({ error: 'missing station' }, 0);
        return cached(request, ctx, ARR_TTL, async () => agency.arrivals(env, station, nowSecs()))
          .catch((e) => { console.log(JSON.stringify({ msg: 'arrivals fail', agency: m[1], err: String(e) })); return json({ epoch: nowSecs(), model: [] }, 0); });
      }
      const routes = (url.searchParams.get('routes') || '').split(',').filter(Boolean);
      return cached(request, ctx, ALR_TTL, async () => agency.alerts(env, routes))
        .catch((e) => { console.log(JSON.stringify({ msg: 'alerts fail', agency: m[1], err: String(e) })); return json({ alerts: [], suspensions: [] }, 0); });
    }
    return corsResponse('not found', { status: 404 });
  }
};
