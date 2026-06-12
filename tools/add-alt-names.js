// One-off: attach member platform names to merged complexes as `alt` (search
// aliases). A complex keeps one display name (its representative's), so the
// other members' names — "6 Av" inside "14 St", "Court St" inside "Borough
// Hall" — were unsearchable. The config page matches alt names too, so riders
// can find a complex by ANY of its platforms' names.
//
// Subway member names come from the official GTFS stops.txt:
//   https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
// PATH member names mirror attach-path.js's MERGE map (only merged stops can
// contribute an alias).
//
// Idempotent: alt is rebuilt from scratch on each run.
// Usage: node tools/add-alt-names.js [path/to/stops.txt]
var fs = require('fs');
var path = require('path');
var normTokens = require('../src/pkjs/lib/config')._normTokens;
var STOPS = process.argv[2] || '/tmp/gtfs_subway/stops.txt';
var DATA = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'stations.data.json');

// PATH stops that merge into subway entries (see attach-path.js MERGE).
var PATH_NAMES = {
  '26722': '14th Street', '26723': '23rd Street',
  '26724': '33rd Street', '26734': 'World Trade Center'
};

// stop_id -> stop_name for parent stations (location_type=1 rows have a bare id).
var nameById = {};
fs.readFileSync(STOPS, 'utf8').split(/\r?\n/).slice(1).forEach(function (line) {
  if (!line) return;
  // stop_name (field 2) may be quoted if it contains a comma.
  var m = line.match(/^([^,]+),(?:"([^"]*)"|([^,]*)),/);
  if (m) nameById[m[1]] = m[2] || m[3];
});

var db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
var withAlt = 0;
db.forEach(function (s) {
  delete s.alt;
  var members = (s.ids || []).map(function (id) { return nameById[id]; })
    .concat((s.pathIds || []).map(function (id) { return PATH_NAMES[id]; }));
  // Keep names that say something NEW: drop any whose normalized tokens match
  // the entry's own name ("14th Street" ~ "14 St") or an already-kept alt.
  var seen = {};
  seen[normTokens(s.name).join(' ')] = true;
  var alt = [];
  members.forEach(function (n) {
    if (!n) return;
    var key = normTokens(n).join(' ');
    if (seen[key]) return;
    seen[key] = true;
    alt.push(n);
  });
  if (alt.length) { s.alt = alt; withAlt++; }
});

fs.writeFileSync(DATA, JSON.stringify(db) + '\n');
console.log('alt names attached: ' + withAlt + ' of ' + db.length + ' entries');
