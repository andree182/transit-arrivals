// One-off: overlay PATH onto the merged MTA station DB. Co-located PATH platforms
// merge into their subway entry (PATH labels appended to `lines`, PATH stop_id in a
// new `pathIds`); WTC attaches to two complexes; the rest become standalone
// sys:"path" entries. Idempotent. Usage: node tools/attach-path.js
var fs = require('fs');
var path = require('path');
var DB_PATH = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'stations.data.json');

var PATH_STATIONS = {
  '26733': { name: 'Newark',             lat: 40.73454, lon: -74.16375, lines: ['NW', 'NH'] },
  '26729': { name: 'Harrison',           lat: 40.73942, lon: -74.15587, lines: ['NW', 'NH'] },
  '26731': { name: 'Journal Square',     lat: 40.73301, lon: -74.06289, lines: ['JH', 'JS', 'NW'] },
  '26728': { name: 'Grove Street',       lat: 40.71966, lon: -74.04245, lines: ['JH', 'JS', 'NW'] },
  '26727': { name: 'Exchange Place',     lat: 40.71676, lon: -74.03238, lines: ['W3', 'HW', 'NW'] },
  '26732': { name: 'Newport',            lat: 40.72699, lon: -74.03383, lines: ['JH', 'W3', 'HW', 'JS'] },
  '26730': { name: 'Hoboken',            lat: 40.73586, lon: -74.02922, lines: ['JH', 'H3', 'HW'] },
  '26734': { name: 'World Trade Center', lat: 40.71271, lon: -74.01193, lines: ['W3', 'HW', 'NW'] },
  '26726': { name: 'Christopher Street', lat: 40.73295, lon: -74.00707, lines: ['JH', 'W3', 'H3', 'JS'] },
  '26725': { name: '9th Street',         lat: 40.73424, lon: -73.99910, lines: ['JH', 'W3', 'H3', 'JS'] },
  '26722': { name: '14th Street',        lat: 40.73735, lon: -73.99684, lines: ['JH', 'W3', 'H3', 'JS'] },
  '26723': { name: '23rd Street',        lat: 40.74290, lon: -73.99278, lines: ['JH', 'W3', 'H3', 'JS'] },
  '26724': { name: '33rd Street',        lat: 40.74912, lon: -73.98827, lines: ['JH', 'W3', 'H3', 'JS'] }
};

// PATH stop -> list of subway entry ids it merges into. Everything else is standalone.
var MERGE = {
  '26722': ['132'],          // 14th St   -> 14 St [1/2/3/F/M/L]
  '26723': ['D18'],          // 23rd St   -> 23 St [F/M]
  '26724': ['D17'],          // 33rd St   -> 34 St-Herald Sq
  '26734': ['138', '228']    // WTC       -> WTC Cortlandt [1] AND Park Place [2/3/A/C/E/R/W]
};

var db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
var byId = {};
db.forEach(function (s) { byId[s.id] = s; });

Object.keys(MERGE).forEach(function (pathStop) {
  var labels = PATH_STATIONS[pathStop].lines;
  MERGE[pathStop].forEach(function (targetId) {
    var t = byId[targetId];
    if (!t) throw new Error('merge target not found: ' + targetId);
    t.pathIds = t.pathIds || [];
    if (t.pathIds.indexOf(pathStop) < 0) t.pathIds.push(pathStop);
    labels.forEach(function (l) { if (t.lines.indexOf(l) < 0) t.lines.push(l); });
  });
});

var merged = Object.keys(MERGE);
Object.keys(PATH_STATIONS).forEach(function (pathStop) {
  if (merged.indexOf(pathStop) >= 0) return;        // merged, not a separate pin
  if (byId[pathStop]) return;                        // already appended (idempotent)
  var p = PATH_STATIONS[pathStop];
  db.push({ id: pathStop, name: p.name, lat: p.lat, lon: p.lon, lines: p.lines, sys: 'path' });
});

fs.writeFileSync(DB_PATH, JSON.stringify(db));
console.log('PATH overlay applied: ' + merged.length + ' merged, ' +
  (Object.keys(PATH_STATIONS).length - merged.length) + ' standalone; DB now ' + db.length + ' entries');
