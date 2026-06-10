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

// `token` (the watch's per-request id, echoed back) lets the watch drop stale
// responses from a station it has since navigated away from. Omitted when there
// is no originating request (e.g. the startup ack).
function sendError(code, token) {
  var msg = { ErrorCode: code };
  if (token != null) msg.Req = token;
  Pebble.sendAppMessage(msg);
}

function agencyForStation(station) {
  return agencies.get(station.agency || 'mta');
}

function refreshFor(station, token) {
  var agency = agencyForStation(station);
  agency.getArrivals(station, function (errCode, res) {
    if (errCode) { sendError(errCode, token); return; }
    var bytes = bundleLib.encodeBundle(res.station.id, res.station.name, res.model, res.epoch);
    var bundleMsg = { Bundle: Array.prototype.slice.call(bytes) };
    if (token != null) bundleMsg.Req = token;
    // Pebble has a single AppMessage outbox, and the C inbox handler treats an
    // Alerts message as mutually exclusive with a Bundle message (it returns
    // early when Alerts is present). So send the Bundle first, then send the
    // Alerts string only AFTER the bundle send is acked — never in one dict,
    // never back-to-back synchronously. Sending the (possibly empty) alerts
    // string clears any stale alert on the watch, matching prior behavior.
    Pebble.sendAppMessage(bundleMsg, function () {
      // The watch stores alerts in a 700-byte buffer and the AppMessage inbox
      // is right-sized (2 KB), so cap the string here — an over-long alert
      // would otherwise be dropped by the inbox instead of arriving truncated.
      var alertsMsg = { Alerts: (res.alerts || []).join('\n').slice(0, 690) };
      if (token != null) alertsMsg.Req = token;
      Pebble.sendAppMessage(alertsMsg);
    });
  });
}

function handleRequest(msg) {
  var token = msg.Req;
  if (msg.UseNearest) {
    navigator.geolocation.getCurrentPosition(
      function (p) {
        var st = stations.nearestStation(p.coords.latitude, p.coords.longitude);
        if (st) refreshFor(st, token); else sendError(2, token);
      },
      function (e) { console.log('[mta] geo FAIL ' + (e && e.message)); sendError(1, token); },
      { timeout: 15000, maximumAge: 5000 }
    );
  } else if (msg.StationId) {
    // Resolve by (agency, id) so colliding ids (MTA vs WMATA "A02") pick the right
    // system. msg.Agency is absent for legacy favorites → id-only fallback.
    var st = stations.getStation(msg.StationId, msg.Agency);
    if (st) refreshFor(st, token); else sendError(2, token);
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

// Give legacy favorites (saved before agency tracking) an agency by looking up
// their id, so a re-save persists it. Best-effort id-only lookup — fine since the
// only colliding ids are MTA/WMATA, where the legacy default already resolved to MTA.
function backfillAgency(favs) {
  return (favs || []).map(function (f) {
    if (f.agency) return f;
    var st = stations.getStation(f.id);
    var c = {}; for (var k in f) if (f.hasOwnProperty(k)) c[k] = f[k];
    c.agency = st ? st.agency : '';
    return c;
  });
}

Pebble.addEventListener('showConfiguration', function () {
  var m = loadMirror();
  var db = stations._db.map(function (s) {
    return { id: s.id, name: s.name, lines: s.lines, agency: s.agency };
  });
  var html = config.buildConfigHtml(m.nearestPos, backfillAgency(m.favs), db);
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
