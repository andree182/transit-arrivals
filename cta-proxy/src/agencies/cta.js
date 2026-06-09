import { ctaToEpoch } from '../ctaTime.js';
import { fetchJSON, nowSecs } from '../shared.js';

// CTA route code (eta.rt) -> { label (2-char), color [r,g,b] }. Colors are the
// GTFS route_color values.
export const ROUTE_MAP = {
  Red:  { label: 'Rd', color: [198, 12, 48] },
  Blue: { label: 'Bl', color: [0, 161, 222] },
  Brn:  { label: 'Br', color: [98, 54, 27] },
  G:    { label: 'Gr', color: [0, 155, 58] },
  Org:  { label: 'Or', color: [249, 70, 28] },
  Pink: { label: 'Pk', color: [226, 126, 166] },
  P:    { label: 'Pr', color: [82, 35, 152] },
  Y:    { label: 'Ye', color: [249, 227, 0] }
};

const LABEL_COLOR = Object.fromEntries(Object.values(ROUTE_MAP).map(v => [v.label, v.color]));
function colorForLabel(l) { return LABEL_COLOR[l] || [128, 128, 128]; }

// CTA rail-route ServiceId -> our 2-char label. ServiceId values mirror eta.rt
// (Red/Blue/Brn/G/Org/P/Pink/Y); alerts may also use "Pexp" for Purple Express,
// which folds onto Purple.
const SERVICE_TO_LABEL = Object.fromEntries(
  Object.entries(ROUTE_MAP).map(([rt, v]) => [rt, v.label])
);
SERVICE_TO_LABEL.Pexp = ROUTE_MAP.P.label;

function arr(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

// ctatt: the `ctatt` object from ttarrivals.aspx JSON. now: proxy response epoch.
// Returns { epoch, model: [{line,color,directions:[{label,dest,times,exp}]}] }.
// Per CTA Appendix D, time-to-arrival = arrT - prdt (re-anchored to `now`), and
// isApp ("Due") arrives immediately. CTA drops reached trains from the feed, so
// no past-filter is needed beyond clamping the delta at 0.
export function transform(ctatt, now) {
  const etas = ctatt && ctatt.eta ? (Array.isArray(ctatt.eta) ? ctatt.eta : [ctatt.eta]) : [];
  const byRoute = new Map();                              // rt -> Map(trDr -> {dest, times, _min})
  for (const e of etas) {
    const rm = ROUTE_MAP[e.rt];
    if (!rm) continue;
    const arrT = ctaToEpoch(e.arrT), prdt = ctaToEpoch(e.prdt);
    if (!Number.isFinite(arrT) || !Number.isFinite(prdt)) continue;
    const due = (e.isApp === '1' || e.isApp === 1);
    const t = now + (due ? 0 : Math.max(0, arrT - prdt));
    let dirs = byRoute.get(e.rt);
    if (!dirs) { dirs = new Map(); byRoute.set(e.rt, dirs); }
    let bucket = dirs.get(e.trDr);
    if (!bucket) { bucket = { dest: e.destNm || '', times: [], _min: Infinity }; dirs.set(e.trDr, bucket); }
    bucket.times.push(t);
    // Soonest train's destNm is the headsign (CTA rewrites it mid-route).
    if (t < bucket._min) { bucket._min = t; bucket.dest = e.destNm || bucket.dest; }
  }
  const model = [];
  for (const [rt, dirs] of byRoute) {
    const rm = ROUTE_MAP[rt];
    const directions = [];
    // Stable direction order: trDr 1 before 5 (then any others).
    const keys = [...dirs.keys()].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
    for (const k of keys) {
      const b = dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: rm.label, color: rm.color, directions });
  }
  return { epoch: now, model };
}

// routes: routes.aspx JSON; alerts: alerts.aspx JSON; wantLabels: ['Bl',…].
// Returns { alerts:[text…], suspensions:[{line,color,reason}] } for the requested labels.
// ImpactedService.Service entries are typed: ServiceType "R" = rail route (ServiceId
// is a route code), "X" = systemwide (applies to all lines); "T" (station) and "B"
// (bus) are ignored.
export function transformAlerts(routes, alerts, wantLabels) {
  const want = new Set(wantLabels);
  const out = { alerts: [], suspensions: [] };
  const seenSusp = new Set();

  for (const a of arr(alerts?.CTAAlerts?.Alert)) {
    const services = arr(a.ImpactedService?.Service);
    const routeLabels = services
      .filter(s => s.ServiceType === 'R')
      .map(s => SERVICE_TO_LABEL[s.ServiceId])
      .filter(Boolean);
    const systemwide = services.some(s => s.ServiceType === 'X');
    const hit = systemwide ? [...want] : routeLabels.filter(l => want.has(l));
    if (!hit.length) continue;
    const text = a.Headline || a.ShortDescription || '';
    if (text) out.alerts.push(text);
    const suspended = /suspend/i.test(a.Impact || '') || /suspend/i.test(a.Headline || '');
    if (suspended) {
      for (const l of hit) {
        if (seenSusp.has(l)) continue;
        seenSusp.add(l);
        out.suspensions.push({ line: l, color: colorForLabel(l), reason: a.ShortDescription || a.Headline || 'Service suspended' });
      }
    }
  }
  // A route whose routes.aspx RouteStatus mentions "suspend" is also suspended.
  for (const r of arr(routes?.CTARoutes?.RouteInfo)) {
    const label = SERVICE_TO_LABEL[r.ServiceId];
    if (!label || !want.has(label) || seenSusp.has(label)) continue;
    if (/suspend/i.test(r.RouteStatus || '')) {
      seenSusp.add(label);
      out.suspensions.push({ line: label, color: colorForLabel(label), reason: r.RouteStatus });
    }
  }
  return out;
}

export async function arrivals(env, station, now) {
  if (!/^\d{5}(,\d{5}){0,3}$/.test(String(station || ''))) throw new Error('bad mapid: ' + station);
  const u = `https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${env.CTA_KEY}&mapid=${station}&max=12&outputType=JSON`;
  const data = await fetchJSON(u);
  if (!data?.ctatt || data.ctatt.errCd !== '0') throw new Error('cta errCd ' + (data?.ctatt?.errCd));
  return transform(data.ctatt, now ?? nowSecs());
}

export async function alerts(env, routes) {
  const [r, a] = await Promise.all([
    fetchJSON('https://www.transitchicago.com/api/1.0/routes.aspx?outputType=JSON'),
    fetchJSON('https://www.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON&activeonly=true')
  ]);
  return transformAlerts(r, a, routes);
}
