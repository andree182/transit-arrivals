var TERMINALS = require('./terminals.json');
var STATIONS = require('./stations.data.json');
var NAME = {};
STATIONS.forEach(function (s) {
  NAME[s.id] = s.name;
  if (s.ids) s.ids.forEach(function (m) { NAME[m] = s.name; });
});

function dirOf(stopId) {
  var c = stopId.charAt(stopId.length - 1);
  return (c === 'N' || c === 'S') ? c : null;
}
function stationOf(stopId) {
  var c = stopId.charAt(stopId.length - 1);
  return (c === 'N' || c === 'S') ? stopId.slice(0, -1) : stopId;
}

// The shuttle and SIR feeds carry distinct route_ids (GS/FS/H, SI); collapse
// them onto the bullet riders actually see — every shuttle is the gray "S", and
// SI is the "SIR" roundel. Headsigns stay keyed on the raw id (above, via
// TERMINALS) so each shuttle keeps its own destinations.
// PATH services carry numeric GTFS route_ids; map them to the 2-char colored
// bullet riders see. Subway ids pass through (Q stays Q).
var PATH_LABEL = {
  '862': 'NW', '859': 'H3', '860': 'HW', '861': 'JS',
  '1024': 'JH', '74320': 'NH', '77285': 'W3'
};
function displayRoute(route) {
  if (PATH_LABEL[route]) return PATH_LABEL[route];
  if (route === 'GS' || route === 'FS' || route === 'H') return 'S';
  if (route === 'SI') return 'SIR';
  return route;
}

// Official MTA service order (the sequence riders read on the system map and in
// every station): numbered IRT lines, then the lettered trunks grouped by color
// (A/C/E blue, B/D/F/M orange, …), then G, the Brooklyn lines, shuttles, SIR,
// and finally the PATH bullets. Lines flip through this order on UP/DOWN, so the
// order is wayfinding — not the accident of an alphabetical key sort.
var SERVICE_ORDER = [
  '1', '2', '3', '4', '5', '6', '7',
  'A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'S', 'SIR',
  'NW', 'HW', 'W3', 'JS', 'JH', 'NH', 'H3'
];
function serviceRank(route) {
  var i = SERVICE_ORDER.indexOf(displayRoute(route));
  return i < 0 ? SERVICE_ORDER.length : i;   // unknown bullets sort to the tail
}

// rows: [{route,stop,time}], stationId: a parent id or an array of parent ids
// (a station complex shares one entry but spans several GTFS parent stations),
// now: epoch secs.
function buildArrivals(rows, stationId, now) {
  var idSet = {};
  (Array.isArray(stationId) ? stationId : [stationId]).forEach(function (i) { idSet[i] = true; });
  var byLine = {};
  rows.forEach(function (r) {
    if (!idSet[stationOf(r.stop)]) return;
    // Subway encodes direction in the N/S stop suffix; PATH has no suffix and
    // uses GTFS-RT direction_id (1 -> 'N' toward Manhattan, 0 -> 'S' toward NJ).
    var dir = dirOf(r.stop) || (r.dir === 1 ? 'N' : r.dir === 0 ? 'S' : null);
    if (!dir || r.time < now) return;
    // Express variants carry a trailing 'X' (e.g. '6X'). A rider on the platform
    // boards whichever 6 arrives next, so express folds onto the base line as one
    // timeline; each arrival keeps an `exp` flag for the diamond marker. Shuttles
    // (GS/FS) end in S, not X, so they stay distinct.
    var exp = /X$/.test(r.route);
    var key = exp ? r.route.slice(0, -1) : r.route;
    var L = byLine[key] || (byLine[key] = {});
    (L[dir] || (L[dir] = [])).push({ time: r.time, dest: r.dest, exp: exp });
  });
  return Object.keys(byLine).sort(function (a, b) {
    var ra = serviceRank(a), rb = serviceRank(b);
    return ra !== rb ? ra - rb : (a < b ? -1 : a > b ? 1 : 0);
  }).map(function (key) {
    var dirs = Object.keys(byLine[key]).sort().map(function (dir) {
      var arr = byLine[key][dir].sort(function (a, b) { return a.time - b.time; });
      // Headsign tracks the soonest train's real terminal (from the feed); the
      // static per-line table is the fallback when that stop isn't in the DB.
      var dest = (arr[0].dest && NAME[arr[0].dest]) ||
                 TERMINALS[key + dir] || (dir === 'N' ? 'Northbound' : 'Southbound');
      return {
        dir: dir,
        dest: dest,
        times: arr.map(function (e) { return e.time; }).slice(0, 6),
        exp: arr.map(function (e) { return e.exp; }).slice(0, 6)
      };
    });
    return { line: displayRoute(key), directions: dirs };
  });
}
module.exports = { buildArrivals: buildArrivals, _dirOf: dirOf, _stationOf: stationOf, _displayRoute: displayRoute };
