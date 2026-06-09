var MTA_DB = require('./stations.data.json');
var CTA_DB = require('./cta.stations.json');
var WMATA_DB = require('./wmata.stations.json');
var MARTA_DB = require('./marta.stations.json');
var BART_DB = require('./bart.stations.json');
var MBTA_DB = require('./mbta.stations.json');
var SEPTA_DB = require('./septa.stations.json');
var GCRTA_DB = require('./gcrta.stations.json');
var MIAMI_DB = require('./miami.stations.json');
var BALT_DB = require('./baltimore.stations.json');

function tag(list, agency) {
  return list.map(function (s) {
    if (s.agency) return s;
    var c = {};
    for (var k in s) if (s.hasOwnProperty(k)) c[k] = s[k];
    c.agency = agency;
    return c;
  });
}

// Concatenation of every agency's on-phone directory.
var DB = tag(MTA_DB, 'mta').concat(tag(CTA_DB, 'cta')).concat(tag(WMATA_DB, 'wmata')).concat(tag(MARTA_DB, 'marta')).concat(tag(BART_DB, 'bart')).concat(tag(MBTA_DB, 'mbta')).concat(tag(SEPTA_DB, 'septa')).concat(tag(GCRTA_DB, 'gcrta')).concat(tag(MIAMI_DB, 'miami')).concat(tag(BALT_DB, 'baltimore'));

function haversine(aLat, aLon, bLat, bLon) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (bLat - aLat) * toRad, dLon = (bLon - aLon) * toRad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(aLat * toRad) * Math.cos(bLat * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ~100 km from the nearest station in ANY agency's directory (NYC metro + PATH,
// Chicago CTA, …). Beyond it the user isn't near a covered system at all and we
// fall back to the default hub rather than a meaningless thousands-of-miles pin.
var SERVICE_RADIUS_M = 100000;
var DEFAULT_STATION_ID = 'R16';   // Times Sq-42 St — the canonical fallback hub

function nearestStation(lat, lon) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < DB.length; i++) {
    var d = haversine(lat, lon, DB[i].lat, DB[i].lon);
    if (d < bestD) { bestD = d; best = DB[i]; }
  }
  // Outside the service area (e.g. a user in LA): default to Times Square rather
  // than the meaningless "closest" station thousands of miles away.
  if (!best || bestD > SERVICE_RADIUS_M) return getStation(DEFAULT_STATION_ID) || best;
  return best;
}

function getStation(id) {
  for (var i = 0; i < DB.length; i++) if (DB[i].id === id) return DB[i];
  // A favorite saved before a complex merge may hold a member id; resolve it.
  for (var j = 0; j < DB.length; j++) if (DB[j].ids && DB[j].ids.indexOf(id) >= 0) return DB[j];
  return null;
}

function displayName(station) {
  if (station.sys === 'path') return station.name + ' · PATH';
  var lines = (station.lines && station.lines.length)
    ? ' (' + station.lines.join('') + ')'
    : '';
  return station.name + lines;
}

module.exports = { nearestStation: nearestStation, getStation: getStation, displayName: displayName, _db: DB };
