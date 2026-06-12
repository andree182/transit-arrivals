'use strict';

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function haversineM(aLat, aLon, bLat, bLon) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLon = (bLon - aLon) * toRad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Title-case the first letter of each word. A word starts at the beginning of the
// string or after any character that is NOT a letter, digit, or apostrophe — so
// spaces/hyphens/slashes/parens/periods/'@' all start a new word, but mid-word
// accents, digit runs (34th), and apostrophes (Hoʻaeʻae) do not. Unicode-aware via
// \p{L}, fixing the old ASCII-\b "CorazóN" / "Ho'Ae'Ae" / "34Th" mangling.
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|[^\p{L}\d'’])(\p{L})/gu, (m, b, c) => b + c.toUpperCase());
}

// Merge station rows that share a name and sit within `distM` of each other into one
// row (union stopIds + lines, average coords). Needed for agencies that model each
// directional platform as a separate standalone stop with no parent_station (e.g.
// GCRTA light rail), which would otherwise show two identical single-direction entries.
// Mutates `stationStops`; returns the filtered station list.
function mergeByName(stations, stationStops, distM) {
  const groups = {};
  for (const s of stations) (groups[s.name.trim().toUpperCase()] ||= []).push(s);
  const removed = new Set();
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    for (let i = 0; i < g.length; i++) {
      const base = g[i];
      if (removed.has(base.id)) continue;
      for (let j = i + 1; j < g.length; j++) {
        const o = g[j];
        if (removed.has(o.id) || haversineM(base.lat, base.lon, o.lat, o.lon) > distM) continue;
        stationStops[base.id] = [...new Set(stationStops[base.id].concat(stationStops[o.id] || []))].sort();
        base.lines = [...new Set(base.lines.concat(o.lines))].sort();
        base.lat = (base.lat + o.lat) / 2; base.lon = (base.lon + o.lon) / 2;
        delete stationStops[o.id];
        removed.add(o.id);
      }
    }
  }
  return stations.filter(s => !removed.has(s.id));
}

// Merge any two stations within distM of each other into one — regardless of name —
// for co-located platforms that mergeByName misses because their names differ: a
// street-address alias ("Biscayne Bd@E Flagler St" == Bayfront Park), an
// abbreviation ("Government Ctr." == Government Center Metromover), a punctuation
// variant ("College / Bayside" == "College Bayside"), or a per-line interchange
// suffix ("Expo / Crenshaw E-Line" == "...K-Line"). The surviving row keeps the
// most descriptive name (longest; tie -> more platforms -> alphabetical), unions
// stopIds + lines, and averages coords. Mutates stationStops; returns the filtered
// list. distM must stay tight enough not to fuse genuinely-distinct adjacent
// stations (e.g. downtown Metromover stops sit ~150 m apart).
function preferKeep(a, b, stationStops) {
  if (a.name.length !== b.name.length) return a.name.length > b.name.length;
  const na = (stationStops[a.id] || []).length, nb = (stationStops[b.id] || []).length;
  if (na !== nb) return na > nb;
  return a.name <= b.name;
}
function mergeByProximity(stations, stationStops, distM) {
  const removed = new Set();
  for (let i = 0; i < stations.length; i++) {
    const a = stations[i];
    if (removed.has(a.id)) continue;
    for (let j = i + 1; j < stations.length; j++) {
      const b = stations[j];
      if (removed.has(b.id)) continue;
      if (haversineM(a.lat, a.lon, b.lat, b.lon) > distM) continue;
      const keep = preferKeep(a, b, stationStops) ? a : b;
      const drop = keep === a ? b : a;
      stationStops[keep.id] = [...new Set((stationStops[keep.id] || []).concat(stationStops[drop.id] || []))].sort();
      keep.lines = [...new Set(keep.lines.concat(drop.lines))].sort();
      keep.lat = (keep.lat + drop.lat) / 2; keep.lon = (keep.lon + drop.lon) / 2;
      delete stationStops[drop.id];
      removed.add(drop.id);
      if (drop === a) break;           // outer row was merged away; advance i
    }
  }
  return stations.filter(s => !removed.has(s.id));
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
  let stations = Object.keys(stationStops).map(station => {
    const agg = stationAgg[station];
    const parent = stopById[station];
    const name = (parent && parent.stop_name) || names[stationStops[station][0]];
    const lat = (parent && isFinite(+parent.stop_lat) && +parent.stop_lat) || agg.lats.reduce((a, b) => a + b, 0) / agg.lats.length;
    const lon = (parent && isFinite(+parent.stop_lon) && +parent.stop_lon) || agg.lons.reduce((a, b) => a + b, 0) / agg.lons.length;
    return { id: station, name, lat, lon, lines: [...agg.labels].sort(), agency: cfg.agency };
  }).filter(s => s.id && isFinite(s.lat) && isFinite(s.lon))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const k of Object.keys(stationStops)) stationStops[k].sort();
  // Optional: collapse same-named, co-located directional platforms into one station.
  if (cfg.mergeByNameMeters) stations = mergeByName(stations, stationStops, cfg.mergeByNameMeters);
  // Optional: normalize SHOUTY GTFS names to Title Case for display (phone DB + dest names).
  if (cfg.titleCase) {
    for (const s of stations) s.name = titleCase(s.name);
    for (const k of Object.keys(names)) names[k] = titleCase(names[k]);
  }
  // Optional: drop non-passenger entries (yards/depots/divisions) that appear in
  // stop_times but aren't riders' stations.
  if (cfg.excludeNameRe) {
    stations = stations.filter(s => {
      if (cfg.excludeNameRe.test(s.name)) { delete stationStops[s.id]; return false; }
      return true;
    });
  }
  // Optional: collapse co-located platforms whose names differ (street-address
  // aliases, abbreviations, per-line interchange suffixes). Runs after titleCase so
  // the surviving "longest name" comparison uses final display names.
  if (cfg.mergeByProximityMeters) stations = mergeByProximity(stations, stationStops, cfg.mergeByProximityMeters);
  return { stations, data: { stations: stationStops, names, routes: routesOut } };
}

module.exports = { buildRailArtifacts, hexToRgb, titleCase, mergeByProximity };
