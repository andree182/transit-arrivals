var stations = require('./lib/stations');
var linesLib = require('./lib/lines');
var gtfsrt = require('./lib/gtfsrt');
var arrivalsLib = require('./lib/arrivals');
var bundleLib = require('./lib/bundle');

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

function refreshFor(station) {
  var urls = linesLib.feedUrls(station.lines);
  var rows = [], pending = urls.length, failed = 0;
  if (!pending) return sendError(2);
  urls.forEach(function (url) {
    fetchFeed(url, function (err, buf) {
      if (err) { failed++; } else {
        try { rows = rows.concat(gtfsrt.extractStopTimes(buf)); } catch (e) { failed++; }
      }
      if (--pending === 0) {
        if (failed === urls.length) return sendError(3);          // all feeds failed
        var now = nowSecs();
        var model = arrivalsLib.buildArrivals(rows, station.id, now);
        if (!model.length) return sendError(4);                    // no trains
        var bytes = bundleLib.encodeBundle(station.name, model, now, linesLib.colorForLine);
        Pebble.sendAppMessage({ Bundle: Array.prototype.slice.call(bytes) });
      }
    });
  });
}

function sendError(code) { Pebble.sendAppMessage({ ErrorCode: code }); }

function handleRequest(msg) {
  if (msg.UseNearest) {
    navigator.geolocation.getCurrentPosition(
      function (p) { refreshFor(stations.nearestStation(p.coords.latitude, p.coords.longitude)); },
      function () { sendError(1); },                                // location unavailable
      { timeout: 15000, maximumAge: 60000 }
    );
  } else if (msg.StationId) {
    var st = stations.getStation(msg.StationId);
    if (st) refreshFor(st); else sendError(2);
  }
}

Pebble.addEventListener('ready', function () { Pebble.sendAppMessage({ ErrorCode: 0 }); });
Pebble.addEventListener('appmessage', function (e) { handleRequest(e.payload); });
