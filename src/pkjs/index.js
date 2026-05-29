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

function fetchAlerts(station) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', ALERTS_URL, true);
  xhr.onload = function () {
    var list = [];
    try {
      if (xhr.status === 200 && xhr.responseText) {
        list = alertsLib.extractAlerts(JSON.parse(xhr.responseText), station.lines, nowSecs());
      }
    } catch (e) { console.log('[mta] alerts EXC ' + e.message); }
    Pebble.sendAppMessage({ Alerts: list.join('\n') });
  };
  xhr.onerror = function () { Pebble.sendAppMessage({ Alerts: '' }); };
  xhr.send();
}

function refreshFor(station) {
  fetchAlerts(station);
  var urls = linesLib.feedUrls(station.lines);
  var rows = [], pending = urls.length, failed = 0;
  if (!pending) return sendError(2);
  urls.forEach(function (url) {
    fetchFeed(url, function (err, buf) {
      if (err) { failed++; console.log('[mta] feed FAIL ' + err.message + ' ' + url); } else {
        try { rows = rows.concat(gtfsrt.extractStopTimes(buf)); } catch (e) { failed++; console.log('[mta] parse EXC ' + e.message + ' ' + url); }
      }
      if (--pending === 0) {
        if (failed === urls.length) return sendError(3);          // all feeds failed
        var now = nowSecs();
        var model = arrivalsLib.buildArrivals(rows, station.id, now);
        if (!model.length) return sendError(4);                    // no trains
        var bytes = bundleLib.encodeBundle(station.id, stations.displayName(station), model, now, linesLib.colorForLine);
        Pebble.sendAppMessage({ Bundle: Array.prototype.slice.call(bytes) });
      }
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
