var DB = require('./stations.data.json');

function haversine(aLat, aLon, bLat, bLon) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (bLat - aLat) * toRad, dLon = (bLon - aLon) * toRad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(aLat * toRad) * Math.cos(bLat * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestStation(lat, lon) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < DB.length; i++) {
    var d = haversine(lat, lon, DB[i].lat, DB[i].lon);
    if (d < bestD) { bestD = d; best = DB[i]; }
  }
  return best;
}

function getStation(id) {
  for (var i = 0; i < DB.length; i++) if (DB[i].id === id) return DB[i];
  // A favorite saved before a complex merge may hold a member id; resolve it.
  for (var j = 0; j < DB.length; j++) if (DB[j].ids && DB[j].ids.indexOf(id) >= 0) return DB[j];
  return null;
}

function displayName(station) {
  var lines = (station.lines && station.lines.length)
    ? ' (' + station.lines.join('') + ')'
    : '';
  return station.name + lines;
}

module.exports = { nearestStation: nearestStation, getStation: getStation, displayName: displayName, _db: DB };
