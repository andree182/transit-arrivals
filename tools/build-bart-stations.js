#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const HEX_LABEL = { FFFF33: 'Yl', FF9933: 'Or', '339933': 'Gn', FF0000: 'Rd', '0099CC': 'Bl', B0BEC7: 'Gy' };
const ORDER = ['Rd', 'Or', 'Yl', 'Gn', 'Bl', 'Gy'];

// --- pure transforms (unit-tested) ---
function buildStops(stops) {
  const out = {};
  for (const s of stops) {
    const abbr = s.parent_station;
    if (!abbr) continue;
    (out[abbr] = out[abbr] || []).push(s.stop_id);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}
function buildStations(stops, stationLabels) {
  const byAbbr = {};
  for (const s of stops) {
    const a = s.parent_station; if (!a) continue;
    const e = byAbbr[a] || (byAbbr[a] = { name: s.stop_name, lats: [], lons: [] });
    e.lats.push(+s.stop_lat); e.lons.push(+s.stop_lon);
  }
  return Object.keys(byAbbr).map(a => {
    const e = byAbbr[a];
    const lines = (stationLabels[a] || []).slice().sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
    return {
      id: a, name: e.name,
      lat: e.lats.reduce((x, y) => x + y, 0) / e.lats.length,
      lon: e.lons.reduce((x, y) => x + y, 0) / e.lons.length,
      lines, agency: 'bart'
    };
  }).filter(e => e.id && isFinite(e.lat)).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
function buildTripMap(trips, routeColorById) {
  const out = {};
  for (const t of trips) {
    const label = HEX_LABEL[(routeColorById[t.route_id] || '').toUpperCase()];
    if (!label) continue;                               // bus-bridge / unknown route -> skip
    out[t.trip_id] = { c: label, h: t.trip_headsign || '', d: parseInt(t.direction_id, 10) || 0 };
  }
  return out;
}

// --- CSV + station-lines join (used only by main) ---
function splitCsv(line) {           // handles simple quoted fields
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = splitCsv(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsv(line); const o = {};
    head.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });
}
// abbr -> [label] via stop_times(trip_id->stop_id) + trips(trip_id->route_id) + stops(stop_id->abbr)
function stationLines(stopTimes, trips, stops, routeColorById) {
  const stopToAbbr = {}; for (const s of stops) stopToAbbr[s.stop_id] = s.parent_station;
  const tripToLabel = {}; for (const t of trips) { const l = HEX_LABEL[(routeColorById[t.route_id] || '').toUpperCase()]; if (l) tripToLabel[t.trip_id] = l; }
  const out = {};
  for (const st of stopTimes) {
    const abbr = stopToAbbr[st.stop_id], label = tripToLabel[st.trip_id];
    if (!abbr || !label) continue;
    (out[abbr] = out[abbr] || new Set()).add(label);
  }
  const flat = {}; for (const a of Object.keys(out)) flat[a] = [...out[a]];
  return flat;
}

function main() {
  const dir = process.env.GTFS_DIR || '/tmp/bart-gtfs';
  const rd = f => parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));
  const stops = rd('stops.txt'), routes = rd('routes.txt'), trips = rd('trips.txt'), stopTimes = rd('stop_times.txt');
  const routeColor = {}; for (const r of routes) routeColor[r.route_id] = r.route_color;
  const labels = stationLines(stopTimes, trips, stops, routeColor);
  const stations = buildStations(stops, labels);
  const stopMap = buildStops(stops);
  const tripMap = buildTripMap(trips, routeColor);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'bart.stations.json'), JSON.stringify(stations, null, 0) + '\n');
  fs.writeFileSync(path.join(__dirname, '..', 'cta-proxy', 'src', 'agencies', 'bart-stops.json'), JSON.stringify(stopMap, null, 0) + '\n');
  fs.writeFileSync(path.join(__dirname, '..', 'cta-proxy', 'src', 'agencies', 'bart-trips.json'), JSON.stringify(tripMap, null, 0) + '\n');
  console.log('wrote ' + stations.length + ' BART stations, ' + Object.keys(stopMap).length + ' stop groups, ' + Object.keys(tripMap).length + ' trips');
}

module.exports = { buildStations, buildStops, buildTripMap, stationLines, parseCsv };
if (require.main === module) main();
