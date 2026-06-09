import { fetchJSON, nowSecs } from '../shared.js';

// Keyed by route-id BASE. A raw route id maps to a base via baseRoute() below.
// Green-B/C/D/E all collapse here to one Gn line; Mattapan is its own red trolley.
// Silver Line is intentionally absent (bus, route_type=3 — no buses, ever).
export const ROUTE_MAP = {
  Red:      { label: 'Rd', color: [218, 41, 28] },
  Orange:   { label: 'Or', color: [237, 139, 0] },
  Blue:     { label: 'Bl', color: [0, 61, 165] },
  Green:    { label: 'Gn', color: [0, 132, 61] },
  Mattapan: { label: 'M',  color: [218, 41, 28] }
};

const ORDER = ['Rd', 'Or', 'Bl', 'Gn', 'M'];
const LABEL_COLOR = Object.fromEntries(Object.values(ROUTE_MAP).map(v => [v.label, v.color]));
function colorForLabel(l) { return LABEL_COLOR[l] || [128, 128, 128]; }

// Raw route id -> base route id used to key ROUTE_MAP. Green-* collapses to Green.
export function baseRoute(id) { return String(id || '').indexOf('Green-') === 0 ? 'Green' : String(id || ''); }
// Raw route id -> display label (or null if unsupported, e.g. a bus route).
export function labelFor(id) { const rm = ROUTE_MAP[baseRoute(id)]; return rm ? rm.label : null; }

// predictionsJson: parsed /predictions JSON:API. now: epoch seconds.
// Returns { epoch, model:[{line,color,directions:[{label,dest,times,exp}]}] }.
// Group by label; split directions by direction_id (0/1); dest from the ORIGINAL
// route's direction_destinations[direction_id]; time = arrival_time ?? departure_time
// (terminal trains null one or the other); CANCELLED/SKIPPED dropped.
export function transform(predictionsJson, now) {
  const data = Array.isArray(predictionsJson?.data) ? predictionsJson.data : [];
  const included = Array.isArray(predictionsJson?.included) ? predictionsJson.included : [];

  // route id -> { color, dirDest:[s0,s1] } from the `included` route objects.
  const routes = {};
  for (const r of included) {
    if (r.type !== 'route') continue;
    routes[r.id] = {
      color: r.attributes?.color,
      dirDest: Array.isArray(r.attributes?.direction_destinations) ? r.attributes.direction_destinations : []
    };
  }

  const byLabel = new Map(); // label -> Map(direction_id -> { dest, times, _min })
  for (const p of data) {
    if (p.type !== 'prediction') continue;
    const sr = p.attributes?.schedule_relationship;
    if (sr === 'CANCELLED' || sr === 'SKIPPED') continue;
    const routeId = p.relationships?.route?.data?.id;
    const label = labelFor(routeId);
    if (!label) continue;                                   // unsupported route (bus) -> drop
    const iso = p.attributes?.arrival_time ?? p.attributes?.departure_time;
    if (!iso) continue;                                     // neither time -> drop
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const time = Math.floor(t / 1000);
    const dir = String(p.attributes?.direction_id ?? 0);
    // dest from the ORIGINAL route's own direction_destinations (each Green branch differs).
    const dest = (routes[routeId]?.dirDest || [])[Number(dir)] || '';

    let dirs = byLabel.get(label);
    if (!dirs) { dirs = new Map(); byLabel.set(label, dirs); }
    let b = dirs.get(dir);
    if (!b) { b = { dest, times: [], _min: Infinity }; dirs.set(dir, b); }
    b.times.push(time);
    if (time < b._min) { b._min = time; if (dest) b.dest = dest; }  // soonest train's headsign
  }

  const model = [];
  for (const label of ORDER) {
    const dirs = byLabel.get(label);
    if (!dirs) continue;
    const directions = [];
    for (const k of [...dirs.keys()].sort()) {
      const b = dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: label, color: colorForLabel(label), directions });
  }
  return { epoch: now, model };
}

// --- Task 2: transformAlerts ---

const SUSPENSION_EFFECTS = new Set(['SHUTTLE', 'SUSPENSION', 'NO_SERVICE', 'STATION_CLOSURE', 'STOP_CLOSURE']);

// alertsJson: parsed /alerts JSON:API. wantLabels: ['Rd','Gn',…] (the requested station's lines).
// Returns { alerts:[short_header…], suspensions:[{line,color,reason}] } filtered to wantLabels.
// Each alert's informed_entity[].route is mapped to a label (Green-* -> Gn) via labelFor.
export function transformAlerts(alertsJson, wantLabels) {
  const want = new Set(wantLabels || []);
  const out = { alerts: [], suspensions: [] };
  const seenSusp = new Set();
  for (const a of (Array.isArray(alertsJson?.data) ? alertsJson.data : [])) {
    if (a.type !== 'alert') continue;
    const attrs = a.attributes || {};
    const informed = Array.isArray(attrs.informed_entity) ? attrs.informed_entity : [];
    const labels = informed.map(e => labelFor(e.route)).filter(Boolean);
    const hit = [...new Set(labels)].filter(l => want.has(l));
    if (!hit.length) continue;
    const text = attrs.short_header || '';
    if (text) out.alerts.push(text);
    if (SUSPENSION_EFFECTS.has(attrs.effect)) {
      for (const l of hit) {
        if (seenSusp.has(l)) continue;
        seenSusp.add(l);
        out.suspensions.push({ line: l, color: colorForLabel(l), reason: text });
      }
    }
  }
  return out;
}

// --- Task 3: arrivals / alerts wrappers ---

// Build a /predictions URL with URL-ENCODED brackets (filter%5Bstop%5D=, page%5Blimit%5D=).
function predictionsUrl(station) {
  return 'https://api-v3.mbta.com/predictions'
    + '?filter%5Bstop%5D=' + encodeURIComponent(station)
    + '&sort=departure_time&include=route&page%5Blimit%5D=50';
}
// Display label -> MBTA route id(s). `Gn` expands to all four Green branches.
const LABEL_TO_ROUTE_IDS = {
  Rd: ['Red'], Or: ['Orange'], Bl: ['Blue'],
  Gn: ['Green-B', 'Green-C', 'Green-D', 'Green-E'], M: ['Mattapan']
};

// The /alerts route carries NO station (the proxied factory sends only `routes=<labels>`),
// so MBTA filters alerts by route id, not stop. Expand the requested labels to route ids.
function alertsUrl(routes) {
  const ids = [];
  for (const l of (routes || [])) for (const id of (LABEL_TO_ROUTE_IDS[l] || [])) ids.push(id);
  const routeFilter = ids.length ? '&filter%5Broute%5D=' + encodeURIComponent(ids.join(',')) : '';
  return 'https://api-v3.mbta.com/alerts'
    + '?filter%5Bdatetime%5D=now&filter%5Bseverity%5D=3%2C4%2C5%2C6%2C7%2C8%2C9%2C10' + routeFilter;
}

function headers(env) {
  // Only attach the header when a key is present — keyless requests work at 20 req/min.
  if (!env || !env.MBTA_KEY) return {};
  return { headers: { 'x-api-key': env.MBTA_KEY } };
}

export async function arrivals(env, station, now) {
  const data = await fetchJSON(predictionsUrl(station), headers(env));
  return transform(data, now ?? nowSecs());
}

// routes: array of labels the station serves (the factory sends `routes=<labels>`).
// Fetch alerts filtered to those routes, then transformAlerts maps each alert's
// informed_entity routes back to labels and filters to the requested set.
export async function alerts(env, routes) {
  const data = await fetchJSON(alertsUrl(routes), headers(env));
  return transformAlerts(data, routes);
}
