import { fetchJSON, fetchBuf, nowSecs } from '../shared.js';
import { extractTripUpdates } from '../gtfsrt.js';
import BART_STOPS from './bart-stops.json';   // { abbr: [stopId,...] }
import BART_TRIPS from './bart-trips.json';    // { tripId: {c,h,d} }

const BART_DEMO_KEY = 'MW9S-E7SL-26DU-VV8V';   // BART's public demo key; used only if no BART_KEY secret

const LABEL_COLOR = {
  Yl: [255, 255, 51], Or: [255, 153, 51], Gn: [51, 153, 51],
  Rd: [255, 0, 0], Bl: [0, 153, 204], Gy: [176, 190, 199]
};
const COLOR_NAME_LABEL = { YELLOW: 'Yl', ORANGE: 'Or', GREEN: 'Gn', RED: 'Rd', BLUE: 'Bl', GREY: 'Gy' };
export const ROUTE_MAP = Object.fromEntries(Object.keys(LABEL_COLOR).map(l => [l, { label: l, color: LABEL_COLOR[l] }]));
function colorForLabel(l) { return LABEL_COLOR[l] || [128, 128, 128]; }

// Build the resolved model from a byLabel Map(label -> Map(dirKey -> {dest,times,_min})).
function buildModel(byLabel) {
  const model = [];
  for (const [label, dirs] of byLabel) {
    const directions = [];
    for (const k of [...dirs.keys()].sort()) {
      const b = dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: label, color: colorForLabel(label), directions });
  }
  return model;
}
function pushArrival(byLabel, label, dirKey, dest, time) {
  let dirs = byLabel.get(label);
  if (!dirs) { dirs = new Map(); byLabel.set(label, dirs); }
  let b = dirs.get(dirKey);
  if (!b) { b = { dest: dest || '', times: [], _min: Infinity }; dirs.set(dirKey, b); }
  b.times.push(time);
  if (time < b._min) { b._min = time; b.dest = dest || b.dest; }
}

function cdata(x) { return (x && (x['#cdata-section'] ?? x['#text'])) || (typeof x === 'string' ? x : ''); }

// bsaJson: parsed bsa.aspx JSON. Returns { alerts, suspensions }. routes ignored (advisories are system-wide).
export function transformAlerts(bsaJson) {
  const list = bsaJson?.root?.bsa;
  const arr = Array.isArray(list) ? list : (list ? [list] : []);
  const out = { alerts: [], suspensions: [] };
  // BART advisories are system-wide, so we emit at most ONE 'BART' suspension banner
  // (multiple identical banners would clutter the watch); all advisory texts still go to alerts[].
  let suspended = false;
  for (const b of arr) {
    const text = cdata(b.sms_text) || cdata(b.description);
    if (!text || /no delays reported/i.test(text)) continue;
    out.alerts.push(text);
    if (!suspended && /suspend|closed|no service|major delay/i.test(text)) {
      suspended = true;
      out.suspensions.push({ line: 'BART', color: colorForLabel('Gy'), reason: text });
    }
  }
  return out;
}

// trips: extractTripUpdates output. stopIds: Set of this station's GTFS stop ids.
// tripMap: { tripId: {c:label, h:headsign, d:0|1} }. Joins color/dir/dest the RT feed lacks.
export function transformRT(trips, stopIds, tripMap, now) {
  const byLabel = new Map();
  for (const t of (Array.isArray(trips) ? trips : [])) {
    const meta = tripMap[t.tripId];
    if (!meta || !meta.c) continue;                        // unknown/stale trip -> skip
    const stop = t.stops.find(s => stopIds.has(s.stopId));
    if (!stop) continue;                                   // trip doesn't serve this station
    const time = Math.max(stop.time, now);                 // clamp past to now
    pushArrival(byLabel, meta.c, String(meta.d), meta.h, time);
  }
  return { epoch: now, model: buildModel(byLabel) };
}

// etdJson: parsed etd.aspx JSON. Groups estimates by line color, splits by direction.
export function transformETD(etdJson, now) {
  const stations = etdJson?.root?.station;
  const list = Array.isArray(stations) ? stations : (stations ? [stations] : []);
  const byLabel = new Map();
  for (const st of list) {
    for (const grp of (Array.isArray(st.etd) ? st.etd : [])) {
      for (const e of (Array.isArray(grp.estimate) ? grp.estimate : [])) {
        if (String(e.cancelflag) === '1') continue;
        const label = COLOR_NAME_LABEL[String(e.color || '').toUpperCase()];
        if (!label) continue;
        const m = String(e.minutes || '').trim();
        const secs = /^\d+$/.test(m) ? parseInt(m, 10) * 60 : (m.toUpperCase() === 'LEAVING' ? 0 : NaN);
        if (!Number.isFinite(secs)) continue;
        pushArrival(byLabel, label, String(e.direction || ''), grp.destination, now + secs);
      }
    }
  }
  return { epoch: now, model: buildModel(byLabel) };
}

function etdUrl(station, env) {
  return 'https://api.bart.gov/api/etd.aspx?cmd=etd&json=y&orig=' + encodeURIComponent(station)
    + '&key=' + encodeURIComponent(env.BART_KEY || BART_DEMO_KEY);
}

// Hybrid: ETD primary; GTFS-RT TripUpdates fallback (colored via BART_TRIPS) when ETD fails/empty.
export async function arrivals(env, station, now) {
  const t = now ?? nowSecs();
  try {
    const data = await fetchJSON(etdUrl(station, env));
    const m = transformETD(data, t);
    // Empty model (no trains, or an all-cancelled board) intentionally falls through to the
    // GTFS-RT path; if that's also empty the result is the correct {model:[]}.
    if (m.model.length) return m;
  } catch (e) { /* fall through to GTFS-RT */ }
  try {
    const stops = BART_STOPS[station];
    if (stops && stops.length) {
      const buf = await fetchBuf('https://api.bart.gov/gtfsrt/tripupdate.aspx');
      return transformRT(extractTripUpdates(buf), new Set(stops), BART_TRIPS, t);
    }
  } catch (e) { /* fall through to empty */ }
  return { epoch: t, model: [] };
}

export async function alerts(env, routes) {
  try {
    const data = await fetchJSON('https://api.bart.gov/api/bsa.aspx?cmd=bsa&json=y&key='
      + encodeURIComponent(env.BART_KEY || BART_DEMO_KEY));
    return transformAlerts(data);
  } catch (e) { return { alerts: [], suspensions: [] }; }
}
