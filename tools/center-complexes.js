// Recompute each merged NYC complex's coordinate as the CENTROID of its member
// platforms, so the map pin sits in the middle of a spread-out complex instead
// of at one edge. 14 St/6 Av is the motivating case: its 1/2/3 entrance (7 Av) is
// a long block from the F/M/L/PATH entrance (6 Av), and merge-complexes.js used
// the representative member's coordinate (the 1/2/3), leaving the pin ~300m west
// of the 6 Av entrance. An edge pin makes nearest-station fragile under the GPS
// drift you get underground. Centroids keep the complex nearest from any entrance.
//
// Member coords: subway parent stations from the MTA GTFS stops.txt; PATH from the
// table below (mirrors tools/attach-path.js). Only lat/lon are touched — lines,
// ids, pathIds and names are left exactly as-is. Run this LAST, after
// merge-complexes.js and attach-path.js.
//
// Usage: node tools/center-complexes.js [path/to/mta/stops.txt]   (default /tmp/stops.txt)
'use strict';
var fs = require('fs');
var path = require('path');
var STOPS = process.argv[2] || '/tmp/stops.txt';
var DATA = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'stations.data.json');

// PATH platform coords (mirrors tools/attach-path.js PATH_STOPS).
var PATH_COORDS = {
  '26733': [40.73454, -74.16375], '26729': [40.73942, -74.15587], '26731': [40.73301, -74.06289],
  '26728': [40.71966, -74.04245], '26727': [40.71676, -74.03238], '26732': [40.72699, -74.03383],
  '26730': [40.73586, -74.02922], '26734': [40.71271, -74.01193], '26726': [40.73295, -74.00707],
  '26725': [40.73424, -73.99910], '26722': [40.73735, -73.99684], '26723': [40.74290, -73.99278],
  '26724': [40.74912, -73.98827]
};

// stop_id -> [lat, lon] for every subway parent station, plus the PATH stops.
var coord = {};
var rows = fs.readFileSync(STOPS, 'utf8').split(/\r?\n/);
for (var i = 1; i < rows.length; i++) {
  var c = rows[i].split(',');
  if (c.length < 4 || !c[0]) continue;
  var la = parseFloat(c[2]), lo = parseFloat(c[3]);
  if (isFinite(la) && isFinite(lo)) coord[c[0]] = [la, lo];
}
for (var k in PATH_COORDS) coord[k] = PATH_COORDS[k];

var data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
var fixed = 0, missing = [];
data.forEach(function (s) {
  var members = (s.ids || []).concat(s.pathIds || []);
  if (members.length < 2) return;            // single-platform stations are already centred
  var la = 0, lo = 0, pts = [];
  members.forEach(function (m) {
    if (coord[m]) { la += coord[m][0]; lo += coord[m][1]; pts.push([+coord[m][0].toFixed(5), +coord[m][1].toFixed(5)]); }
    else missing.push(s.id + '/' + m);
  });
  if (!pts.length) return;
  s.lat = +(la / pts.length).toFixed(6);     // centroid: the map pin
  s.lon = +(lo / pts.length).toFixed(6);
  s.pts = pts;                               // every entrance/platform: nearest-station matches the CLOSEST one,
  fixed++;                                   // so coverage hugs the complex's axis instead of a fat circle
});
fs.writeFileSync(DATA, JSON.stringify(data) + '\n');
console.error('centered + pts on ' + fixed + ' complexes' + (missing.length ? '; missing coords for ' + missing.join(', ') : ''));
