var proxied = require('./proxied');
var stations = require('./stations');
var linesLib = require('./lines');
var gtfsrt = require('./gtfsrt');
var arrivalsLib = require('./arrivals');
var alertsLib = require('./alerts');

var ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json';

// Borough WORD each (route, N/S) direction heads toward. "" for lines whose ends
// share a borough (shuttles, SIR) — the headsign disambiguates. (Was the 0–4
// dirCode enum in bundle.js; v6 carries the word, so it lives here now.)
var MAN = 'MANHATTAN', BKN = 'BROOKLYN', QNS = 'QUEENS', BRX = 'BRONX', NONE = '';
var DIR_WORD = {
  '1': { N: BRX, S: MAN }, '2': { N: BRX, S: BKN }, '3': { N: MAN, S: BKN },
  '4': { N: BRX, S: BKN }, '5': { N: BRX, S: BKN }, '6': { N: BRX, S: MAN },
  '7': { N: QNS, S: MAN },
  'A': { N: MAN, S: QNS }, 'C': { N: MAN, S: BKN }, 'E': { N: QNS, S: MAN },
  'B': { N: BRX, S: BKN }, 'D': { N: BRX, S: BKN }, 'F': { N: QNS, S: BKN },
  'M': { N: NONE, S: NONE },
  'G': { N: QNS, S: BKN },
  'J': { N: QNS, S: MAN }, 'Z': { N: QNS, S: MAN },
  'N': { N: QNS, S: BKN }, 'Q': { N: MAN, S: BKN }, 'R': { N: QNS, S: BKN }, 'W': { N: QNS, S: MAN },
  'L': { N: MAN, S: BKN },
  'S': { N: NONE, S: NONE }, 'SIR': { N: NONE, S: NONE }
};
function directionWord(route, dir) {
  var d = DIR_WORD[route];
  if (!d) return '';
  return dir === 'N' ? d.N : d.S;
}
function nowSecs() { return Math.floor(Date.now() / 1000); }

function fetchFeed(url, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function () {
    if (xhr.status === 200 && xhr.response) cb(null, new Uint8Array(xhr.response));
    else cb(new Error('HTTP ' + xhr.status));
  };
  xhr.onerror = function () { cb(new Error('network')); };
  xhr.send();
}

// Attach color + direction word to the raw arrivals model from arrivals.js.
function decorate(model) {
  return model.map(function (ln) {
    var color = linesLib.colorForLine(ln.line);
    if (!ln.directions || ln.directions.length === 0) {
      return { line: ln.line, color: color, directions: [], notice: ln.notice || '' };
    }
    var dirs = ln.directions.map(function (d) {
      return { label: directionWord(ln.line, d.dir), dest: d.dest, times: d.times, exp: d.exp };
    });
    return { line: ln.line, color: color, directions: dirs };
  });
}

function getArrivals(station, cb) {
  var feeds = linesLib.feedGroups(station.lines);
  var rows = [], pendingFeeds = feeds.length, failedFeeds = 0;
  var failedLines = {};   // line -> true: its feed failed (after a retry), so its data is missing
  var alertsDone = false, suspensions = [], alerts = [];

  function finish() {
    if (!alertsDone || pendingFeeds > 0) return;
    if (feeds.length && failedFeeds === feeds.length && !suspensions.length) return cb(3);
    var now = nowSecs();
    var ids = (station.ids || [station.id]).concat(station.pathIds || []);
    var rawModel = arrivalsLib.buildArrivals(rows, ids, now);
    suspensions.forEach(function (s) {
      var running = rawModel.some(function (m) { return m.line === s.code; });
      if (!running) rawModel.push({ line: s.code, directions: [], notice: s.reason });
    });
    // A feed that failed (even after one retry) would otherwise hide its lines
    // entirely; surface them as NO DATA so the rider still sees every line the
    // station serves (e.g. F/M/L at 14 St when the B-D-F-M or L feed hiccups),
    // not just the lines whose feed happened to load. "No live arrivals" prefix
    // makes the watch render "NO DATA" (same as SEPTA El/BSL).
    Object.keys(failedLines).forEach(function (l) {
      if (!rawModel.some(function (m) { return m.line === l; })) {
        rawModel.push({ line: l, directions: [], notice: 'No live arrivals right now' });
      }
    });
    if (!rawModel.length) return cb(4);
    cb(null, {
      epoch: now,
      station: { id: station.id, name: stations.displayName(station), agency: 'mta' },
      model: decorate(rawModel),
      alerts: alerts,
      suspensions: suspensions.map(function (s) { return { line: s.code, reason: s.reason }; })
    });
  }

  var ax = new XMLHttpRequest();
  ax.open('GET', ALERTS_URL, true);
  ax.onload = function () {
    if (ax.status === 200 && ax.responseText) {
      try {
        var feed = JSON.parse(ax.responseText);
        alerts = alertsLib.extractAlerts(feed, station.lines, nowSecs());
        suspensions = alertsLib.extractSuspensions(feed, station.lines, nowSecs());
      } catch (e) { console.log('[mta] alerts EXC ' + e.message); }
    }
    alertsDone = true; finish();
  };
  ax.onerror = function () { console.log('[mta] alerts network FAIL'); alertsDone = true; finish(); };
  ax.send();

  // Fetch a feed; on a network error, retry once before giving up (a single
  // transient hiccup shouldn't silently drop that feed's whole line group).
  function fetchFeedRetry(url, done) {
    fetchFeed(url, function (err, buf) {
      if (!err) return done(null, buf);
      fetchFeed(url, done);
    });
  }
  feeds.forEach(function (f) {
    fetchFeedRetry(f.url, function (err, buf) {
      var failed = false;
      if (err) { failed = true; console.log('[mta] feed FAIL ' + err.message + ' ' + f.url); }
      else {
        try { rows = rows.concat(gtfsrt.extractStopTimes(buf)); }
        catch (e) { failed = true; console.log('[mta] parse EXC ' + e.message + ' ' + f.url); }
      }
      if (failed) { failedFeeds++; f.lines.forEach(function (l) { failedLines[l] = true; }); }
      pendingFeeds--; finish();
    });
  });
}

var MTA = {
  id: 'mta', name: 'MTA', transport: 'direct',
  getArrivals: getArrivals,
  _directionWord: directionWord
};

var REGISTRY = {
  mta: MTA,
  cta: proxied.makeProxiedAgency({ id: 'cta', name: 'CTA' }),
  wmata: proxied.makeProxiedAgency({ id: 'wmata', name: 'Metro' }),
  marta: proxied.makeProxiedAgency({ id: 'marta', name: 'MARTA' }),
  bart: proxied.makeProxiedAgency({ id: 'bart', name: 'BART' }),
  mbta: proxied.makeProxiedAgency({ id: 'mbta', name: 'MBTA' }),
  septa: proxied.makeProxiedAgency({ id: 'septa', name: 'SEPTA' }),
  gcrta: proxied.makeProxiedAgency({ id: 'gcrta', name: 'RTA' }),
  miami: proxied.makeProxiedAgency({ id: 'miami', name: 'Metrorail' }),
  baltimore: proxied.makeProxiedAgency({ id: 'baltimore', name: 'MdMTA' }),
  skyline: proxied.makeProxiedAgency({ id: 'skyline', name: 'Skyline' }),
  patco: proxied.makeProxiedAgency({ id: 'patco', name: 'PATCO' }),
  trenurbano: proxied.makeProxiedAgency({ id: 'trenurbano', name: 'Tren Urbano' }),
};
function get(id) { return REGISTRY[id] || MTA; }   // default to MTA for legacy favorites

module.exports = { get: get, _registry: REGISTRY };
