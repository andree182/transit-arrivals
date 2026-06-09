var stations = require('./lib/stations');
var bundleLib = require('./lib/bundle');
var favsync = require('./lib/favsync');
var config = require('./lib/config');
var agencies = require('./lib/agencies');

function loadMirror() {
  try { return JSON.parse(localStorage.getItem('mta_favs')) || { nearestPos: 0, favs: [] }; }
  catch (e) { return { nearestPos: 0, favs: [] }; }
}
function saveMirror(obj) {
  try { localStorage.setItem('mta_favs', JSON.stringify(obj)); } catch (e) {}
}

function sendError(code) { Pebble.sendAppMessage({ ErrorCode: code }); }

function agencyForStation(station) {
  return agencies.get(station.agency || 'mta');
}

function refreshFor(station) {
  var agency = agencyForStation(station);
  agency.getArrivals(station, function (errCode, res) {
    if (errCode) { sendError(errCode); return; }
    var bytes = bundleLib.encodeBundle(res.station.id, res.station.name, res.model, res.epoch);
    // Pebble has a single AppMessage outbox, and the C inbox handler treats an
    // Alerts message as mutually exclusive with a Bundle message (it returns
    // early when Alerts is present). So send the Bundle first, then send the
    // Alerts string only AFTER the bundle send is acked — never in one dict,
    // never back-to-back synchronously. Sending the (possibly empty) alerts
    // string clears any stale alert on the watch, matching prior behavior.
    Pebble.sendAppMessage(
      { Bundle: Array.prototype.slice.call(bytes) },
      function () {
        Pebble.sendAppMessage({ Alerts: (res.alerts || []).join('\n') });
      }
    );
  });
}

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
