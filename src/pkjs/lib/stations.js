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
var SKYLINE_DB = require('./skyline.stations.json');
var PATCO_DB = require('./patco.stations.json');
var TRENURBANO_DB = require('./trenurbano.stations.json');
var LAMETRO_DB = require('./lametro.stations.json');

function tag(list, agency) {
  return list.map(function (s) {
    if (s.agency) return s;
    var c = {};
    for (var k in s) if (s.hasOwnProperty(k)) c[k] = s[k];
    c.agency = agency;
    return c;
  });
}

// Agencies built into the app but NOT YET LIVE — their proxy needs a Swiftly API
// key that isn't configured yet, so they'd return empty boards. Hidden from search,
// nearest-station, and the config chips (the chips are derived from stations in the
// DB) until the keys land. To enable one: drop it from this set and ship — no other
// change needed (its module/data are already wired up).
var NOT_YET_LIVE = { skyline: true };

// Concatenation of every agency's on-phone directory, minus the not-yet-live ones.
var DB = tag(MTA_DB, 'mta').concat(tag(CTA_DB, 'cta')).concat(tag(WMATA_DB, 'wmata')).concat(tag(MARTA_DB, 'marta')).concat(tag(BART_DB, 'bart')).concat(tag(MBTA_DB, 'mbta')).concat(tag(SEPTA_DB, 'septa')).concat(tag(GCRTA_DB, 'gcrta')).concat(tag(MIAMI_DB, 'miami')).concat(tag(BALT_DB, 'baltimore')).concat(tag(SKYLINE_DB, 'skyline')).concat(tag(PATCO_DB, 'patco')).concat(tag(TRENURBANO_DB, 'trenurbano')).concat(tag(LAMETRO_DB, 'lametro'))
  .filter(function (s) { return !NOT_YET_LIVE[s.agency]; });

function haversine(aLat, aLon, bLat, bLon) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (bLat - aLat) * toRad, dLon = (bLon - aLon) * toRad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(aLat * toRad) * Math.cos(bLat * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ~100 km from the nearest station in ANY agency's directory (NYC metro + PATH,
// Chicago CTA, …). Beyond it the user isn't near a covered system at all:
// nearestStation returns null and the watch shows the honest "no covered
// station nearby" card (error 2) instead of a fake Times Sq board.
var SERVICE_RADIUS_M = 100000;

// Distance to a station: for a multi-entrance complex, the distance to its
// CLOSEST platform (s.pts), so a spread-out complex (14 St: 1/2/3 at 7 Av, F/M/L
// + PATH at 6 Av) is detected from any entrance — coverage hugs the line of
// platforms instead of a single fat circle that misses the ends. Falls back to
// the centroid (lat/lon) for ordinary single-platform stations.
function stationDist(lat, lon, s) {
  if (s.pts && s.pts.length) {
    var m = Infinity;
    for (var k = 0; k < s.pts.length; k++) {
      var d = haversine(lat, lon, s.pts[k][0], s.pts[k][1]);
      if (d < m) m = d;
    }
    return m;
  }
  return haversine(lat, lon, s.lat, s.lon);
}

function nearestStation(lat, lon) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < DB.length; i++) {
    var d = stationDist(lat, lon, DB[i]);
    if (d < bestD) { bestD = d; best = DB[i]; }
  }
  // Outside the service area (e.g. a user in Denver): no covered system nearby.
  if (!best || bestD > SERVICE_RADIUS_M) return null;
  return best;
}

function getStation(id, agency) {
  // Prefer an exact (agency, id) match so colliding ids across systems (e.g. MTA
  // and WMATA both have "A02") resolve to the intended agency. Fall back to
  // id-only for legacy favorites that carry no agency.
  if (agency) {
    for (var a = 0; a < DB.length; a++) if (DB[a].id === id && DB[a].agency === agency) return DB[a];
    for (var b = 0; b < DB.length; b++) if (DB[b].agency === agency && DB[b].ids && DB[b].ids.indexOf(id) >= 0) return DB[b];
  }
  for (var i = 0; i < DB.length; i++) if (DB[i].id === id) return DB[i];
  // A favorite saved before a complex merge may hold a member id; resolve it.
  for (var j = 0; j < DB.length; j++) if (DB[j].ids && DB[j].ids.indexOf(id) >= 0) return DB[j];
  // Favorites saved under the old 15- / 23-byte id caps persist a TRUNCATED id
  // (e.g. "septa-holmesbur"). If the id sits exactly at a legacy cap, resolve a
  // UNIQUE prefix match; ambiguity stays a miss rather than a guess.
  if (id && (id.length === 15 || id.length === 23)) {
    var hit = null;
    for (var k = 0; k < DB.length; k++) {
      if (agency && DB[k].agency !== agency) continue;
      if (DB[k].id.length > id.length && DB[k].id.indexOf(id) === 0) {
        if (hit) return null;                 // two candidates: ambiguous
        hit = DB[k];
      }
    }
    if (hit) return hit;
  }
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
