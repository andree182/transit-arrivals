import { fetchJSON, fetchBuf, nowSecs } from '../shared.js';
import { extractTripUpdates, extractAlerts } from '../gtfsrt.js';
import STATIONS from './septa-stations.json';
import STOPNAMES from './septa-stopnames.json';

const RR_BLUE = [26, 42, 90];

// GTFS route_id -> { label, color }. Defaults; verify hex vs GTFS routes.txt route_color.
export const ROUTE_MAP = {
  L1: { label: 'L', color: [0, 124, 196] },
  B1: { label: 'B', color: [243, 135, 38] },
  B2: { label: 'B', color: [243, 135, 38] },
  B3: { label: 'B', color: [243, 135, 38] },
  M1: { label: 'M', color: [124, 60, 168] },
  T1: { label: 'T', color: [0, 135, 82] },
  T2: { label: 'T', color: [0, 135, 82] },
  T3: { label: 'T', color: [0, 135, 82] },
  T4: { label: 'T', color: [0, 135, 82] },
  T5: { label: 'T', color: [0, 135, 82] },
  G1: { label: 'G', color: [0, 135, 82] },
  D1: { label: 'D', color: [150, 130, 90] },
  D2: { label: 'D', color: [150, 130, 90] }
};

// Display-label -> color (for el-lines and alert suspensions, which key by label).
export const LABEL_COLOR = {
  L: [0, 124, 196], B: [243, 135, 38], M: [124, 60, 168],
  T: [0, 135, 82], G: [0, 135, 82], D: [150, 130, 90]
};
function colorForLabel(l) { return LABEL_COLOR[l] || RR_BLUE; }

// Regional Rail line string -> short label; fallback to a 2-char initialism.
export const RR_LABELS = {
  'Airport': 'AI', 'Chestnut Hill East': 'CE', 'Chestnut Hill West': 'CW',
  'Cynwyd': 'CY', 'Fox Chase': 'FC', 'Lansdale/Doylestown': 'LD',
  'Media/Wawa': 'MW', 'Manayunk/Norristown': 'MN', 'Paoli/Thorndale': 'PT',
  'Trenton': 'TR', 'Warminster': 'WA', 'Wilmington/Newark': 'WN', 'West Trenton': 'WT'
};
function rrLabel(line) {
  if (RR_LABELS[line]) return RR_LABELS[line];
  const words = String(line || '').split(/[\s/]+/).filter(Boolean);
  if (!words.length) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Parse "YYYY-MM-DD HH:mm:ss(.SSS)" as a naive wall-clock -> integer seconds.
// NOT a real epoch: only differences are meaningful (same-zone offset cancels).
export function naiveParse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m.map(Number);
  // Date.UTC gives a monotone integer; we never treat it as a true local epoch.
  return Math.floor(Date.UTC(Y, Mo - 1, D, H, Mi, S) / 1000);
}

// Parse the dynamic-key "... Departures: Month D, YYYY, h:mm am/pm" -> naive seconds.
function parseKeyTime(key) {
  const m = /Departures:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(String(key || ''));
  if (!m) return null;
  const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6,
                   august:7, september:8, october:9, november:10, december:11 };
  const mo = MONTHS[m[1].toLowerCase()];
  if (mo == null) return null;
  let h = Number(m[4]) % 12;
  if (/pm/i.test(m[6])) h += 12;
  return Math.floor(Date.UTC(Number(m[3]), mo, Number(m[2]), h, Number(m[5]), 0) / 1000);
}

export function transformRR(arrivalsJson, now) {
  if (!arrivalsJson || typeof arrivalsJson !== 'object') return [];
  const keys = Object.keys(arrivalsJson);
  if (!keys.length) return [];
  const key = keys[0];
  const keyTime = parseKeyTime(key);
  const groups = Array.isArray(arrivalsJson[key]) ? arrivalsJson[key] : [];
  const trains = [];
  for (const g of groups) {
    if (g && Array.isArray(g.Northbound)) for (const t of g.Northbound) trains.push(t);
    if (g && Array.isArray(g.Southbound)) for (const t of g.Southbound) trains.push(t);
  }
  const byLine = new Map();  // label -> Map(dir -> {dest, times, _min})
  for (const t of trains) {
    const label = rrLabel(t.line);
    const dep = naiveParse(t.depart_time) ?? naiveParse(t.sched_time);
    if (dep == null) continue;
    let time;
    if (keyTime == null) { time = now; }
    else { const delta = dep - keyTime; time = now + (delta > 0 ? delta : 0); }
    const dir = String(t.direction || '');
    let dirs = byLine.get(label);
    if (!dirs) { dirs = new Map(); byLine.set(label, dirs); }
    let b = dirs.get(dir);
    if (!b) { b = { dest: t.destination || '', times: [], _min: Infinity }; dirs.set(dir, b); }
    b.times.push(time);
    if (time < b._min) { b._min = time; b.dest = t.destination || b.dest; }
  }
  const model = [];
  for (const [label, dirs] of byLine) {
    const directions = [];
    for (const k of [...dirs.keys()].sort()) {
      const b = dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: label, color: RR_BLUE, directions });
  }
  return model;
}

export function transformRT(trips, station, stopNames, now) {
  const want = new Set((station && station.rt) || []);
  if (!want.size || !Array.isArray(trips)) return [];
  const names = stopNames || {};
  const byLabel = new Map();  // label -> { color, dirs:Map(dir -> {dest,times,_min}) }
  for (const trip of trips) {
    const rm = ROUTE_MAP[trip.routeId];
    if (!rm) continue;                                 // not a rail/trolley route (e.g. bus) -> drop
    const hit = (trip.stops || []).find(s => want.has(s.stopId));
    if (!hit || !hit.time) continue;                   // trip doesn't serve this station
    const last = trip.stops[trip.stops.length - 1];
    const dest = (last && names[last.stopId]) || '';
    const dir = String(trip.directionId == null ? '' : trip.directionId);
    let entry = byLabel.get(rm.label);
    if (!entry) { entry = { color: rm.color, dirs: new Map() }; byLabel.set(rm.label, entry); }
    let b = entry.dirs.get(dir);
    if (!b) { b = { dest, times: [], _min: Infinity }; entry.dirs.set(dir, b); }
    b.times.push(hit.time);
    if (hit.time < b._min) { b._min = hit.time; if (dest) b.dest = dest; }
  }
  const model = [];
  for (const [label, entry] of byLabel) {
    const directions = [];
    for (const k of [...entry.dirs.keys()].sort()) {
      const b = entry.dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: label, color: entry.color, directions });
  }
  return model;
}

const EL_NOTICE = "No live arrivals — SEPTA doesn't publish them";

export function elLines(labels) {
  const seen = new Set();
  const out = [];
  for (const l of (labels || [])) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push({ line: l, color: colorForLabel(l), directions: [], notice: EL_NOTICE });
  }
  return out;
}

// Concatenate per-mode models; first occurrence of a label wins.
export function mergeModels(...models) {
  const seen = new Set();
  const out = [];
  for (const m of models) {
    for (const ln of (m || [])) {
      if (seen.has(ln.line)) continue;
      seen.add(ln.line);
      out.push(ln);
    }
  }
  return out;
}

const RT_TRIP_URL = 'https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb';

function rrUrl(name) {
  return 'https://www3.septa.org/api/Arrivals/index.php?station=' +
    encodeURIComponent(name) + '&results=6';
}

// Pure-ish: given a fan-out entry, mode fetchers, stop names, and now -> merged model.
// fetchers.rr() -> arrivals JSON; fetchers.rt() -> extractTripUpdates output.
// Each mode degrades independently.
export async function resolveModel(entry, fetchers, stopNames, now) {
  if (!entry) return [];
  const parts = [];
  if (entry.rr && fetchers.rr) {
    try { parts.push(transformRR(await fetchers.rr(entry.rr), now)); }
    catch (e) { console.log(JSON.stringify({ msg: 'septa rr fail', err: String(e) })); }
  }
  if (entry.rt && entry.rt.length && fetchers.rt) {
    try {
      const trips = await fetchers.rt();
      parts.push(transformRT(trips, entry, stopNames, now));
    } catch (e) { console.log(JSON.stringify({ msg: 'septa rt fail', err: String(e) })); }
  }
  if (entry.el && entry.el.length) parts.push(elLines(entry.el));
  return mergeModels(...parts);
}

export async function arrivals(env, slug, now) {
  now = now ?? nowSecs();
  const entry = STATIONS[slug];
  if (!entry) return { epoch: now, model: [] };
  const fetchers = {
    rr: (name) => fetchJSON(rrUrl(name)),
    rt: async () => extractTripUpdates(await fetchBuf(RT_TRIP_URL))
  };
  const model = await resolveModel(entry, fetchers, STOPNAMES, now);
  return { epoch: now, model };
}

const ALERTS_URL = 'https://www3.septa.org/gtfsrt/septa-pa-us/Service/rtServiceAlerts.pb';

// El/BSL gtfs route ids that don't appear in ROUTE_MAP for arrivals still need
// label mapping for alerts; ROUTE_MAP already covers L1,B1,B2,B3,M1,T*,G1,D*.
function labelForRoute(rid) { return (ROUTE_MAP[rid] || {}).label; }

const EFFECT_NO_SERVICE = 1;

export function transformAlerts(alerts, wantLabels) {
  const want = new Set(wantLabels || []);
  const out = { alerts: [], suspensions: [] };
  const seenSusp = new Set();
  for (const a of (Array.isArray(alerts) ? alerts : [])) {
    const labels = [...new Set((a.routeIds || []).map(labelForRoute).filter(Boolean))];
    const hit = labels.filter(l => want.has(l));
    if (!hit.length) continue;
    const header = a.header || '';
    if (header) out.alerts.push(header);
    const isSuspension = a.effect === EFFECT_NO_SERVICE || /suspend|no service/i.test(header);
    if (isSuspension) {
      for (const l of hit) {
        if (seenSusp.has(l)) continue;
        seenSusp.add(l);
        out.suspensions.push({ line: l, color: colorForLabel(l), reason: header });
      }
    }
  }
  return out;
}

export async function alerts(env, routes) {
  const data = extractAlerts(await fetchBuf(ALERTS_URL));
  return transformAlerts(data, routes);
}
