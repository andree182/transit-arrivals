var stations = require('./lib/stations');
var linesLib = require('./lib/lines');
var gtfsrt = require('./lib/gtfsrt');
var arrivalsLib = require('./lib/arrivals');
var bundleLib = require('./lib/bundle');
var favsync = require('./lib/favsync');
var config = require('./lib/config');
var alertsLib = require('./lib/alerts');

var ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json';

function nowSecs() { return Math.floor(Date.now() / 1000); }

function loadMirror() {
  try { return JSON.parse(localStorage.getItem('mta_favs')) || { nearestPos: 0, favs: [] }; }
  catch (e) { return { nearestPos: 0, favs: [] }; }
}
function saveMirror(obj) {
  try { localStorage.setItem('mta_favs', JSON.stringify(obj)); } catch (e) {}
}

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

function refreshFor(station) {
  var urls = linesLib.feedUrls(station.lines);
  var rows = [], pendingFeeds = urls.length, failedFeeds = 0;
  var alertsDone = false, suspensions = [];

  function finish() {
    if (!alertsDone || pendingFeeds > 0) return;
    // All trip feeds failed AND nothing is suspended: report offline.
    if (urls.length && failedFeeds === urls.length && !suspensions.length) return sendError(3);
    var now = nowSecs();
    var ids = (station.ids || [station.id]).concat(station.pathIds || []);
    var model = arrivalsLib.buildArrivals(rows, ids, now);
    // A suspended line with no trains here becomes a synthetic banner line.
    suspensions.forEach(function (s) {
      var running = model.some(function (m) { return m.line === s.code; });
      if (!running) model.push({ line: s.code, directions: [], notice: s.reason });
    });
    if (!model.length) return sendError(4);                    // no trains, no suspensions
    var bytes = bundleLib.encodeBundle(station.id, stations.displayName(station), model, now, linesLib.colorForLine);
    Pebble.sendAppMessage({ Bundle: Array.prototype.slice.call(bytes) });
  }

  // Alerts feed (plain JSON): one fetch drives the reading screen AND suspensions.
  var ax = new XMLHttpRequest();
  ax.open('GET', ALERTS_URL, true);
  ax.onload = function () {
    if (ax.status === 200 && ax.responseText) {
      try {
        var feed = JSON.parse(ax.responseText);
        var list = alertsLib.extractAlerts(feed, station.lines, nowSecs());
        Pebble.sendAppMessage({ Alerts: list.join('\n') });
        suspensions = alertsLib.extractSuspensions(feed, station.lines, nowSecs());
      } catch (e) { console.log('[mta] alerts EXC ' + e.message); }
    }
    alertsDone = true; finish();
  };
  ax.onerror = function () { console.log('[mta] alerts network FAIL'); alertsDone = true; finish(); };
  ax.send();

  // Trip feeds (protobuf): build the live arrivals model.
  urls.forEach(function (url) {
    fetchFeed(url, function (err, buf) {
      if (err) { failedFeeds++; console.log('[mta] feed FAIL ' + err.message + ' ' + url); }
      else {
        try { rows = rows.concat(gtfsrt.extractStopTimes(buf)); }
        catch (e) { failedFeeds++; console.log('[mta] parse EXC ' + e.message + ' ' + url); }
      }
      pendingFeeds--; finish();
    });
  });
}

function sendError(code) { Pebble.sendAppMessage({ ErrorCode: code }); }

function handleRequest(msg) {
  if (msg.UseNearest) {
    navigator.geolocation.getCurrentPosition(
      function (p) {
        var st = stations.nearestStation(p.coords.latitude, p.coords.longitude);
        if (st) refreshFor(st); else sendError(2);
      },
      function (e) { console.log('[mta] geo FAIL ' + (e && e.message)); sendError(1); },
      { timeout: 15000, maximumAge: 5000 }
    );
  } else if (msg.StationId) {
    var st = stations.getStation(msg.StationId);
    if (st) refreshFor(st); else sendError(2);
  }
}

Pebble.addEventListener('ready', function () {
  Pebble.sendAppMessage({ ErrorCode: 0 });
  Pebble.sendAppMessage({ FavReq: 1 });
});
Pebble.addEventListener('appmessage', function (e) {
  if (e.payload && e.payload.FavSync) {
    saveMirror(favsync.decodeFavList(e.payload.FavSync));
    return;
  }
  handleRequest(e.payload);
});

Pebble.addEventListener('showConfiguration', function () {
  var m = loadMirror();
  var db = stations._db.map(function (s) {
    return { id: s.id, name: s.name, lines: s.lines };
  });
  var html = config.buildConfigHtml(m.nearestPos, m.favs, db);
  Pebble.openURL('data:text/html,' + encodeURIComponent(html));
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) return;
  var payload;
  try { payload = JSON.parse(decodeURIComponent(e.response)); } catch (err) { return; }
  if (!payload || !payload.favs) return;
  var bytes = favsync.encodeFavList(payload.nearestPos, payload.favs);
  Pebble.sendAppMessage({ FavSet: Array.prototype.slice.call(bytes) });
});
