// Proxied CTA agency. Calls the Worker and returns the common arrivals model.
// The proxy already resolves colors/dest/direction, so this is thin.
var PROXY_BASE = 'https://cta-proxy.david-torcivia.workers.dev';

function getJSON(url, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function () {
    if (xhr.status === 200 && xhr.responseText) {
      try { cb(null, JSON.parse(xhr.responseText)); }
      catch (e) { cb(new Error('parse')); }
    } else cb(new Error('HTTP ' + xhr.status));
  };
  xhr.onerror = function () { cb(new Error('network')); };
  xhr.send();
}

function getArrivals(station, cb) {
  var routes = (station.lines || []).join(',');
  var arrUrl = PROXY_BASE + '/cta/arrivals?mapid=' + encodeURIComponent(station.id);
  var alrUrl = PROXY_BASE + '/cta/alerts?routes=' + encodeURIComponent(routes);

  var arrDone = false, alrDone = false;
  var arrData = null, arrErr = null, alerts = [], suspensions = [];

  function finish() {
    if (!arrDone || !alrDone) return;
    if (arrErr) return cb(3);                              // arrivals fetch failed -> offline
    var model = (arrData.model || []).slice();
    // A suspended line with no running trains becomes a synthetic banner line
    // (matches the MTA agency / index.js behavior).
    suspensions.forEach(function (s) {
      var running = model.some(function (m) { return m.line === s.line; });
      if (!running) model.push({ line: s.line, color: [128, 128, 128], directions: [], notice: s.reason });
    });
    if (!model.length) return cb(4);                       // no trains, no suspensions
    cb(null, {
      epoch: arrData.epoch,
      station: { id: station.id, name: station.name + ' · CTA', agency: 'cta' },
      model: model,
      alerts: alerts,
      suspensions: suspensions
    });
  }

  getJSON(arrUrl, function (err, data) {
    if (err) { arrErr = err; } else { arrData = data; }
    arrDone = true; finish();
  });
  getJSON(alrUrl, function (err, data) {
    if (!err && data) { alerts = data.alerts || []; suspensions = data.suspensions || []; }
    alrDone = true; finish();
  });
}

module.exports = {
  id: 'cta', name: 'CTA', transport: 'proxied',
  proxyBase: PROXY_BASE,
  getArrivals: getArrivals
};
