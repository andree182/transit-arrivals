// Generic proxied-agency factory. The Worker resolves colors/dest/direction and
// includes color in suspension objects, so this holds no per-agency tables.
var PROXY_BASE = 'https://cta-proxy.david-torcivia.workers.dev';

function getJSON(url, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function () {
    if (xhr.status === 200 && xhr.responseText) {
      try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(new Error('parse')); }
    } else cb(new Error('HTTP ' + xhr.status));
  };
  xhr.onerror = function () { cb(new Error('network')); };
  // A stalled connection (accepted, never answered) fires neither onload nor
  // onerror; without this the watch spinner runs until the C-side watchdog.
  xhr.timeout = 15000;
  xhr.ontimeout = function () { cb(new Error('timeout')); };
  xhr.send();
}

// meta: { id, name, proxyBase? }. Returns an agency descriptor.
function makeProxiedAgency(meta) {
  var base = meta.proxyBase || PROXY_BASE;
  function getArrivals(station, cb) {
    var routes = (station.lines || []).join(',');
    var arrUrl = base + '/' + meta.id + '/arrivals?station=' + encodeURIComponent(station.id);
    var alrUrl = base + '/' + meta.id + '/alerts?routes=' + encodeURIComponent(routes);
    var arrDone = false, alrDone = false, arrData = null, arrErr = null, alerts = [], suspensions = [];
    function finish() {
      if (!arrDone || !alrDone) return;
      if (arrErr) return cb(3);
      var model = (arrData.model || []).slice();
      suspensions.forEach(function (s) {
        var running = model.some(function (m) { return m.line === s.line; });
        if (!running) model.push({ line: s.line, color: s.color || [128, 128, 128], directions: [], notice: s.reason });
      });
      if (!model.length) return cb(4);
      cb(null, {
        epoch: arrData.epoch,
        station: { id: station.id, name: station.name, agency: meta.id },
        model: model, alerts: alerts, suspensions: suspensions
      });
    }
    getJSON(arrUrl, function (err, data) { if (err) { arrErr = err; } else { arrData = data; } arrDone = true; finish(); });
    getJSON(alrUrl, function (err, data) { if (!err && data) { alerts = data.alerts || []; suspensions = data.suspensions || []; } alrDone = true; finish(); });
  }
  return { id: meta.id, name: meta.name, transport: 'proxied', proxyBase: base, getArrivals: getArrivals };
}

module.exports = { makeProxiedAgency: makeProxiedAgency, _PROXY_BASE: PROXY_BASE };
