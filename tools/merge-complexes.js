// One-off generator: merges station entries that belong to the same NYCT
// "complex" (free in-system transfer) into a single station so the app shows
// ALL lines at a physical station, not just the platform nearest your GPS.
//
// Complex membership is taken from the official MTA subway GTFS transfers.txt
// (cross-stop edges = same complex). Download it from:
//   https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip  (transfers.txt)
//
// Usage: node tools/merge-complexes.js [path/to/transfers.txt]
//   Reads + rewrites src/pkjs/lib/stations.data.json in place.
var fs = require('fs');
var path = require('path');
var TRANSFERS = process.argv[2] || '/tmp/transfers.txt';
var DATA = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'stations.data.json');

var stations = JSON.parse(fs.readFileSync(DATA, 'utf8'));
var byId = {};
stations.forEach(function (s) { byId[s.id] = s; });

// Union-find over station ids that exist in our DB.
var parent = {};
function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
function union(a, b) { parent[find(a)] = find(b); }
stations.forEach(function (s) { parent[s.id] = s.id; });

var lines = fs.readFileSync(TRANSFERS, 'utf8').split(/\r?\n/);
for (var i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  var c = lines[i].split(',');
  var from = c[0], to = c[1];
  if (from === to) continue;
  if (byId[from] && byId[to]) union(from, to);
}

// Group members by component root.
var groups = {};
stations.forEach(function (s) {
  var r = find(s.id);
  (groups[r] || (groups[r] = [])).push(s);
});

// Sane bullet ordering for the merged line list (cosmetic; config display).
var ORDER = ['1','2','3','4','5','6','7','A','C','E','B','D','F','M','G','J','Z','L','N','Q','R','W','S','SIR'];
function lineRank(l) { var i = ORDER.indexOf(l); return i < 0 ? 99 : i; }

var out = [];
Object.keys(groups).forEach(function (root) {
  var members = groups[root];
  if (members.length === 1) { out.push(members[0]); return; }
  // Representative: most lines, tie -> shortest name, tie -> smallest id.
  var rep = members.slice().sort(function (a, b) {
    return (b.lines.length - a.lines.length) ||
           (a.name.length - b.name.length) ||
           (a.id < b.id ? -1 : 1);
  })[0];
  var lineSet = {};
  members.forEach(function (m) { m.lines.forEach(function (l) { lineSet[l] = true; }); });
  var mergedLines = Object.keys(lineSet).sort(function (a, b) {
    return (lineRank(a) - lineRank(b)) || (a < b ? -1 : 1);
  });
  var ids = members.map(function (m) { return m.id; }).sort();
  // Pin at the CENTROID, not the representative's coord — a spread-out complex
  // (14 St/6 Av: 1/2/3 at 7 Av, F/M/L at 6 Av) must stay nearest from any entrance.
  // (PATH members are layered on later by attach-path.js, then re-centred by
  // center-complexes.js, which is the authoritative final pass.)
  var clat = members.reduce(function (a, m) { return a + m.lat; }, 0) / members.length;
  var clon = members.reduce(function (a, m) { return a + m.lon; }, 0) / members.length;
  out.push({ id: rep.id, name: rep.name, lat: +clat.toFixed(6), lon: +clon.toFixed(6), lines: mergedLines, ids: ids });
});

// Keep output stable: sort by id.
out.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
fs.writeFileSync(DATA, JSON.stringify(out) + '\n');
console.error('stations: ' + stations.length + ' -> ' + out.length +
  ' (' + out.filter(function (s) { return s.ids; }).length + ' complexes)');
