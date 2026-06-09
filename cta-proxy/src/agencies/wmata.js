import { fetchJSON, nowSecs } from '../shared.js';

export const ROUTE_MAP = {
  RD: { label: 'Rd', color: [186, 12, 47] },
  OR: { label: 'Or', color: [237, 139, 0] },
  SV: { label: 'Sv', color: [145, 157, 157] },
  BL: { label: 'Bl', color: [0, 156, 222] },
  YL: { label: 'Yl', color: [255, 210, 0] },
  GR: { label: 'Gn', color: [0, 177, 64] }
};

const LABEL_COLOR = Object.fromEntries(Object.values(ROUTE_MAP).map(v => [v.label, v.color]));
function colorForLabel(l) { return LABEL_COLOR[l] || [128, 128, 128]; }

// data: parsed GetPrediction JSON { Trains:[…] }. now: epoch seconds.
// Returns { epoch, model:[{line,color,directions:[{label,dest,times,exp}]}] }.
// Min "BRD"/"ARR" -> now; numeric string -> now + minutes*60; "---"/"" -> drop.
// Group "1"/"2" splits directions; DestinationName is the headsign.
export function transform(data, now) {
  const trains = Array.isArray(data?.Trains) ? data.Trains : [];
  const byRoute = new Map();  // Line code -> Map(Group -> {dest, times, _min})
  for (const t of trains) {
    const rm = ROUTE_MAP[t.Line];
    if (!rm) continue;
    const min = String(t.Min || '').trim().toUpperCase();
    let secs;
    if (min === 'BRD' || min === 'ARR') secs = 0;
    else if (/^\d+$/.test(min)) secs = parseInt(min, 10) * 60;
    else continue;  // '---' or '' -> drop
    const time = now + secs;
    const dir = String(t.Group || '1');
    let dirs = byRoute.get(t.Line);
    if (!dirs) { dirs = new Map(); byRoute.set(t.Line, dirs); }
    let b = dirs.get(dir);
    if (!b) { b = { dest: t.DestinationName || '', times: [], _min: Infinity }; dirs.set(dir, b); }
    b.times.push(time);
    // Soonest train's DestinationName is the headsign.
    if (time < b._min) { b._min = time; b.dest = t.DestinationName || b.dest; }
  }
  const model = [];
  for (const [line, dirs] of byRoute) {
    const rm = ROUTE_MAP[line];
    const directions = [];
    for (const k of [...dirs.keys()].sort()) {
      const b = dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: rm.label, color: rm.color, directions });
  }
  return { epoch: now, model };
}

const WMATA_TO_LABEL = Object.fromEntries(Object.keys(ROUTE_MAP).map(k => [k, ROUTE_MAP[k].label]));

// data: parsed Incidents JSON { Incidents:[…] }. wantLabels: ['Rd',…].
// Returns { alerts:[text…], suspensions:[{line,color,reason}] } filtered to requested labels.
// LinesAffected is semicolon-delimited WMATA line codes ("RD; BL;").
// Suspensions detected by "suspend", "no service", or "no train" in Description.
export function transformAlerts(data, wantLabels) {
  const want = new Set(wantLabels);
  const out = { alerts: [], suspensions: [] };
  const seen = new Set();
  for (const inc of (Array.isArray(data?.Incidents) ? data.Incidents : [])) {
    const labels = String(inc.LinesAffected || '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(code => WMATA_TO_LABEL[code])
      .filter(Boolean);
    const hit = labels.filter(l => want.has(l));
    if (!hit.length) continue;
    const text = inc.Description || '';
    if (text) out.alerts.push(text);
    if (/suspend|no service|no train/i.test(text)) {
      for (const l of hit) {
        if (seen.has(l)) continue;
        seen.add(l);
        out.suspensions.push({ line: l, color: colorForLabel(l), reason: text });
      }
    }
  }
  return out;
}

export async function arrivals(env, station, now) {
  const data = await fetchJSON(
    `https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${encodeURIComponent(station)}?api_key=${env.WMATA_KEY}`
  );
  return transform(data, now ?? nowSecs());
}

export async function alerts(env, routes) {
  const data = await fetchJSON(
    `https://api.wmata.com/Incidents.svc/json/Incidents?api_key=${env.WMATA_KEY}`
  );
  return transformAlerts(data, routes);
}
