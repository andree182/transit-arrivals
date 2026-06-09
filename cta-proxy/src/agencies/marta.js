import { fetchJSON, fetchBuf, nowSecs } from '../shared.js';
import { extractAlerts } from '../gtfsrt.js';

export const ROUTE_MAP = {
  RED:  { label: 'Rd', color: [228, 0, 43] },
  GOLD: { label: 'Gd', color: [255, 199, 44] },
  BLUE: { label: 'Bl', color: [0, 102, 179] },
  GREEN: { label: 'Gn', color: [0, 169, 79] }
};

const LABEL_COLOR = Object.fromEntries(Object.values(ROUTE_MAP).map(v => [v.label, v.color]));
function colorForLabel(l) { return LABEL_COLOR[l] || [128, 128, 128]; }
function norm(s) { return String(s || '').trim().toUpperCase(); }

// MARTA GTFS-RT service-alerts feed (verified 2026-06-09: HTTP 200, protobuf, NO key required).
const ALERTS_URL = 'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/alert/alerts.pb';

// informed_entity.route_id -> display label. MARTA rail GTFS route_ids are numeric;
// names included defensively in case the alerts feed uses RED/GOLD/BLUE/GREEN instead.
const GTFS_ROUTE_TO_LABEL = {
  '26987': 'Rd', RED:   'Rd',
  '26985': 'Gd', GOLD:  'Gd',
  '26984': 'Bl', BLUE:  'Bl',
  '26986': 'Gn', GREEN: 'Gn'
};

// Resolve a GTFS route_id (numeric, name, or e.g. "RED LINE") to a label, or null.
function labelForRoute(routeId) {
  const k = norm(routeId);
  if (GTFS_ROUTE_TO_LABEL[k]) return GTFS_ROUTE_TO_LABEL[k];
  for (const name of ['RED', 'GOLD', 'BLUE', 'GREEN']) {
    if (k.includes(name)) return GTFS_ROUTE_TO_LABEL[name];
  }
  return null;
}

// rows: output of extractAlerts() -> [{ routeIds:[], stopIds:[], header, effect }].
// wantLabels: requested display labels, e.g. ['Rd','Gn'].
// Returns { alerts:[str], suspensions:[{ line, color, reason }] } per the pinned contract.
export function transformAlerts(rows, wantLabels) {
  const want = new Set((wantLabels || []).map(String));
  const alerts = [], suspensions = [];
  const seenHeader = new Set(), seenSusp = new Set();   // dedup repeated entities (e.g. per-sub-route), as SEPTA does
  for (const a of (Array.isArray(rows) ? rows : [])) {
    const labels = [...new Set((a.routeIds || []).map(labelForRoute).filter(Boolean))];
    const hit = labels.filter(l => want.has(l));
    if (!hit.length) continue;                          // not a requested line -> drop
    const header = String(a.header || '').trim();
    if (header && !seenHeader.has(header)) { seenHeader.add(header); alerts.push(header); }
    const isSuspension = a.effect === 1 || /suspend|no service/i.test(header);
    if (isSuspension) {
      for (const l of hit) {
        if (seenSusp.has(l)) continue;
        seenSusp.add(l);
        suspensions.push({ line: l, color: colorForLabel(l), reason: header });
      }
    }
  }
  return { alerts, suspensions };
}

// rows: flat JSON array from MARTA traindata endpoint.
// station: MARTA STATION name to filter (exact, case-insensitive).
// now: epoch seconds.
// Returns { epoch, model:[{line,color,directions:[{label,dest,times,exp}]}] }.
// WAITING_TIME "Boarding"/"Arriving" -> now; otherwise WAITING_SECONDS is seconds-to-arrival.
export function transform(rows, station, now) {
  const want = norm(station);
  const byRoute = new Map();  // label -> Map(direction -> {dest, times, _min})
  for (const t of (Array.isArray(rows) ? rows : [])) {
    if (norm(t.STATION) !== want) continue;
    const rm = ROUTE_MAP[norm(t.LINE)];
    if (!rm) continue;
    const wt = norm(t.WAITING_TIME);
    let secs = (wt === 'BOARDING' || wt === 'ARRIVING') ? 0 : parseInt(t.WAITING_SECONDS, 10);
    if (!Number.isFinite(secs) || secs < 0) secs = 0;
    const time = now + secs;
    const dir = String(t.DIRECTION || '');
    let dirs = byRoute.get(rm.label);
    if (!dirs) { dirs = new Map(); byRoute.set(rm.label, dirs); }
    let b = dirs.get(dir);
    if (!b) { b = { dest: t.DESTINATION || '', times: [], _min: Infinity }; dirs.set(dir, b); }
    b.times.push(time);
    if (time < b._min) { b._min = time; b.dest = t.DESTINATION || b.dest; }
  }
  const model = [];
  for (const [label, dirs] of byRoute) {
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

export async function arrivals(env, station, now) {
  const data = await fetchJSON(
    `https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata?apiKey=${env.MARTA_KEY}`
  );
  return transform(data, station, now ?? nowSecs());
}

// Fetch + decode the GTFS-RT service-alerts feed and filter to the requested lines.
export async function alerts(env, routes) {
  const buf = await fetchBuf(ALERTS_URL);   // no apiKey required for gtfs-rt.itsmarta.com
  const rows = extractAlerts(buf);
  return transformAlerts(rows, routes);
}
