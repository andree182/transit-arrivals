var TERMINALS = require('./terminals.json');

function dirOf(stopId) {
  var c = stopId.charAt(stopId.length - 1);
  return (c === 'N' || c === 'S') ? c : null;
}
function stationOf(stopId) {
  var c = stopId.charAt(stopId.length - 1);
  return (c === 'N' || c === 'S') ? stopId.slice(0, -1) : stopId;
}

// rows: [{route,stop,time}], stationId: parent id, now: epoch secs.
function buildArrivals(rows, stationId, now) {
  var byLine = {};
  rows.forEach(function (r) {
    if (stationOf(r.stop) !== stationId) return;
    var dir = dirOf(r.stop);
    if (!dir || r.time < now) return;
    var L = byLine[r.route] || (byLine[r.route] = {});
    (L[dir] || (L[dir] = [])).push(r.time);
  });
  return Object.keys(byLine).sort().map(function (line) {
    var dirs = Object.keys(byLine[line]).sort().map(function (dir) {
      return {
        dir: dir,
        dest: TERMINALS[line + dir] || (dir === 'N' ? 'Northbound' : 'Southbound'),
        times: byLine[line][dir].sort(function (a, b) { return a - b; }).slice(0, 6)
      };
    });
    return { line: line, directions: dirs };
  });
}
module.exports = { buildArrivals: buildArrivals, _dirOf: dirOf, _stationOf: stationOf };
