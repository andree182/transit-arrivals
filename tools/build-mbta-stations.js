#!/usr/bin/env node
'use strict';
var https = require('https'); var fs = require('fs'); var path = require('path');

// Raw route id -> display label (Green-* collapses to Gn). Mirrors mbta.js labelFor.
var BASE = { Red: 'Rd', Orange: 'Or', Blue: 'Bl', Green: 'Gn', Mattapan: 'M' };
var ORDER = ['Rd', 'Or', 'Bl', 'Gn', 'M'];
function labelFor(routeId) {
  var base = String(routeId || '').indexOf('Green-') === 0 ? 'Green' : String(routeId || '');
  return BASE[base] || null;
}
// All subway + light-rail route ids whose parent stations we fetch (Silver Line excluded — bus).
var ROUTES = ['Red', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan'];

// Pure: union per-route stop arrays by place-* id into directory entries. Exported for tests.
// perRouteStopArrays: [{ route, stops:[{ id, attributes:{ name, latitude, longitude } }] }]
function buildStations(perRouteStopArrays) {
  var byId = {};
  (perRouteStopArrays || []).forEach(function (group) {
    var label = labelFor(group.route);
    if (!label) return;
    (group.stops || []).forEach(function (s) {
      var a = s.attributes || {};
      var e = byId[s.id] || (byId[s.id] = { id: s.id, name: a.name, lat: +a.latitude, lon: +a.longitude, set: {} });
      e.set[label] = 1;
    });
  });
  return Object.keys(byId).map(function (id) {
    var e = byId[id];
    var lines = ORDER.filter(function (l) { return e.set[l]; });
    return { id: e.id, name: e.name, lat: e.lat, lon: e.lon, lines: lines, agency: 'mbta' };
  }).filter(function (e) { return e.id && e.name && e.lines.length && isFinite(e.lat) && isFinite(e.lon) && e.lat !== 0 && e.lon !== 0; })
    .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
}

function getJSON(url, key) {
  return new Promise(function (resolve, reject) {
    var opts = {};
    // Only attach x-api-key header when a key is present; keyless works at 20 req/min.
    if (key) opts = { headers: { 'x-api-key': key } };
    https.get(url, opts, function (res) {
      var buf = ''; res.on('data', function (d) { buf += d; });
      res.on('end', function () { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function main() {
  var KEY = process.env.MBTA_KEY || null;  // keyless works at 20 req/min; key optional
  // Fetch parent stations (location_type=1) per route, sequentially to stay polite.
  var groups = [];
  (function next(i) {
    if (i >= ROUTES.length) return write();
    var r = ROUTES[i];
    var url = 'https://api-v3.mbta.com/stops?filter%5Broute%5D=' + encodeURIComponent(r) + '&filter%5Blocation_type%5D=1';
    getJSON(url, KEY).then(function (j) {
      groups.push({ route: r, stops: Array.isArray(j.data) ? j.data : [] });
      next(i + 1);
    }).catch(function (e) { console.error('fetch ' + r + ' failed: ' + e.message); process.exit(1); });
  })(0);

  function write() {
    var out = buildStations(groups);
    var dst = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'mbta.stations.json');
    fs.writeFileSync(dst, JSON.stringify(out, null, 0) + '\n');
    console.log('wrote ' + out.length + ' MBTA stations -> ' + dst);
  }
}

module.exports = { buildStations: buildStations, labelFor: labelFor };
if (require.main === module) main();
