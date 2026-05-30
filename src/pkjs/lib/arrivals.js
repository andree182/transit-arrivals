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
function displayRoute(route) {
  if (route === 'GS' || route === 'FS' || route === 'H') return 'S';
  if (route === 'SI') return 'SIR';
  return route;
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
    var dir = dirOf(r.stop);
    if (!dir || r.time < now) return;
    var L = byLine[r.route] || (byLine[r.route] = {});
    (L[dir] || (L[dir] = [])).push({ time: r.time, dest: r.dest });
  });
  return Object.keys(byLine).sort().map(function (line) {
    var dirs = Object.keys(byLine[line]).sort().map(function (dir) {
      var arr = byLine[line][dir].sort(function (a, b) { return a.time - b.time; });
      // Headsign tracks the soonest train's real terminal (from the feed); the
      // static per-line table is the fallback when that stop isn't in the DB.
      var dest = (arr[0].dest && NAME[arr[0].dest]) ||
                 TERMINALS[line + dir] || (dir === 'N' ? 'Northbound' : 'Southbound');
      return {
        dir: dir,
        dest: dest,
        times: arr.map(function (e) { return e.time; }).slice(0, 6)
      };
    });
    return { line: displayRoute(line), directions: dirs };
  });
}
module.exports = { buildArrivals: buildArrivals, _dirOf: dirOf, _stationOf: stationOf, _displayRoute: displayRoute };
