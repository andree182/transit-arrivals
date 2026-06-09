'use strict';

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// gtfs: { stops, routes, trips, stopTimes } parsed rows.
// cfg:  { id, agency, railTypes:Set<number>, labelFor(route)->label|null,
//         colorFor?(route,label)->[r,g,b] }  (colorFor optional; defaults to route_color)
// Returns { stations:[phone DB], data:{ stations, names, routes } }.
function buildRailArtifacts(gtfs, cfg) {
  const fallback = [128, 128, 128];
  // 1. rail routes -> routesOut + label-by-route
  const routesOut = {}, labelByRoute = {};
  for (const r of gtfs.routes) {
    if (!cfg.railTypes.has(+r.route_type)) continue;
    const label = cfg.labelFor(r);
    if (!label) continue;
    const color = (cfg.colorFor && cfg.colorFor(r, label)) || hexToRgb(r.route_color) || fallback;
    routesOut[r.route_id] = { label, color };
    labelByRoute[r.route_id] = label;
  }
  // 2. trip -> rail route
  const tripRoute = {};
  for (const t of gtfs.trips) if (routesOut[t.route_id]) tripRoute[t.trip_id] = t.route_id;
  // 3. stop -> set of rail labels (via stop_times)
  const stopLabels = {};
  for (const st of gtfs.stopTimes) {
    const rid = tripRoute[st.trip_id];
    if (!rid) continue;
    (stopLabels[st.stop_id] = stopLabels[st.stop_id] || new Set()).add(labelByRoute[rid]);
  }
  // 4. index stops; resolve station id = parent_station || stop_id
  const stopById = {};
  for (const s of gtfs.stops) stopById[s.stop_id] = s;
  const railStopIds = Object.keys(stopLabels);
  const names = {}, stationAgg = {};
  // First pass: identify rail stations and aggregate labels/coords from stops in stop_times
  const railStationIds = new Set();
  for (const sid of railStopIds) {
    const s = stopById[sid]; if (!s) continue;
    names[sid] = s.stop_name;
    const station = s.parent_station || sid;
    railStationIds.add(station);
    const agg = stationAgg[station] || (stationAgg[station] = { lats: [], lons: [], labels: new Set() });
    agg.lats.push(+s.stop_lat); agg.lons.push(+s.stop_lon);
    for (const l of stopLabels[sid]) agg.labels.add(l);
  }
  // Second pass: build stationStops by collecting ALL child platforms for each rail station
  const stationStops = {};
  for (const station of railStationIds) stationStops[station] = [];
  for (const s of gtfs.stops) {
    const station = s.parent_station || s.stop_id;
    if (!stationStops[station]) continue;
    // include this stop if it's a child platform (has parent_station) or is the station itself (no parent)
    if (s.parent_station) {
      stationStops[station].push(s.stop_id);
    } else if (railStationIds.has(s.stop_id)) {
      // standalone stop (no parent) — only add self if it was directly a rail stop
      if (stopLabels[s.stop_id]) stationStops[s.stop_id].push(s.stop_id);
    }
  }
  // 5. phone DB rows; prefer the parent station's own name/coords when present
  const stations = Object.keys(stationStops).map(station => {
    const agg = stationAgg[station];
    const parent = stopById[station];
    const name = (parent && parent.stop_name) || names[stationStops[station][0]];
    const lat = (parent && isFinite(+parent.stop_lat) && +parent.stop_lat) || agg.lats.reduce((a, b) => a + b, 0) / agg.lats.length;
    const lon = (parent && isFinite(+parent.stop_lon) && +parent.stop_lon) || agg.lons.reduce((a, b) => a + b, 0) / agg.lons.length;
    return { id: station, name, lat, lon, lines: [...agg.labels].sort(), agency: cfg.agency };
  }).filter(s => s.id && isFinite(s.lat) && isFinite(s.lon))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const k of Object.keys(stationStops)) stationStops[k].sort();
  return { stations, data: { stations: stationStops, names, routes: routesOut } };
}

module.exports = { buildRailArtifacts, hexToRgb };
