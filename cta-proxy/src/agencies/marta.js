import { fetchJSON, nowSecs } from '../shared.js';

export const ROUTE_MAP = {
  RED:  { label: 'Rd', color: [228, 0, 43] },
  GOLD: { label: 'Gd', color: [255, 199, 44] },
  BLUE: { label: 'Bl', color: [0, 102, 179] },
  GREEN: { label: 'Gn', color: [0, 169, 79] }
};

const LABEL_COLOR = Object.fromEntries(Object.values(ROUTE_MAP).map(v => [v.label, v.color]));
function colorForLabel(l) { return LABEL_COLOR[l] || [128, 128, 128]; }
function norm(s) { return String(s || '').trim().toUpperCase(); }

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

// MARTA v1: trains only — no alerts endpoint (spec §2b)
export async function alerts() { return { alerts: [], suspensions: [] }; }
