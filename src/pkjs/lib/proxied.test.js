const { test } = require('node:test');
const assert = require('node:assert');
const proxied = require('./proxied');

var cta = proxied.makeProxiedAgency({ id: 'cta', name: 'CTA' });

function mockXHR(responses) {
  global.XMLHttpRequest = function () {
    this.open = function (m, u) { this._url = u; };
    this.send = function () {
      var self = this;
      var key = Object.keys(responses).find(function (k) { return self._url.indexOf(k) >= 0; });
      setTimeout(function () {
        if (key) { self.status = 200; self.responseText = JSON.stringify(responses[key]); self.onload(); }
        else { self.onerror(new Error('no mock for ' + self._url)); }
      }, 0);
    };
  };
}

const STATION = { id: '40380', name: 'Clark/Lake', lines: ['Bl', 'Br'], agency: 'cta' };

test('getArrivals assembles the common model from proxy responses', () => new Promise((resolve) => {
  mockXHR({
    '/cta/arrivals': { epoch: 1000, model: [
      { line: 'Bl', color: [0,161,222], directions: [ { label:'', dest:"O'Hare", times:[1180], exp:[false] } ] }
    ] },
    '/cta/alerts': { alerts: ['Blue Line: heads up'], suspensions: [] }
  });
  cta.getArrivals(STATION, function (err, res) {
    assert.strictEqual(err, null);
    assert.deepStrictEqual(res.station, { id: '40380', name: 'Clark/Lake', agency: 'cta' });
    assert.strictEqual(res.epoch, 1000);
    assert.strictEqual(res.model[0].line, 'Bl');
    assert.deepStrictEqual(res.alerts, ['Blue Line: heads up']);
    assert.deepStrictEqual(res.suspensions, []);
    resolve();
  });
}));

test('merges suspensions as synthetic banner lines when no trains run', () => new Promise((resolve) => {
  mockXHR({
    '/cta/arrivals': { epoch: 1000, model: [] },
    '/cta/alerts': { alerts: [], suspensions: [{ line: 'Br', color: [98, 54, 27], reason: 'Suspended A-B' }] }
  });
  cta.getArrivals(STATION, function (err, res) {
    assert.strictEqual(err, null);
    var banner = res.model.find(function (m) { return m.line === 'Br'; });
    assert.deepStrictEqual(banner.directions, []);
    assert.strictEqual(banner.notice, 'Suspended A-B');
    assert.deepStrictEqual(banner.color, [98, 54, 27]);   // color came from the proxy suspension
    resolve();
  });
}));

test('reports offline (code 3) when the arrivals fetch fails', () => new Promise((resolve) => {
  mockXHR({ '/cta/alerts': { alerts: [], suspensions: [] } });  // arrivals has no mock -> onerror
  cta.getArrivals(STATION, function (err) { assert.strictEqual(err, 3); resolve(); });
}));

test('reports no-trains (code 4) when model and suspensions are empty', () => new Promise((resolve) => {
  mockXHR({ '/cta/arrivals': { epoch: 1000, model: [] }, '/cta/alerts': { alerts: [], suspensions: [] } });
  cta.getArrivals(STATION, function (err) { assert.strictEqual(err, 4); resolve(); });
}));

test('a stalled request times out and reports offline (code 3)', () => new Promise((resolve) => {
  // A server that accepts the connection but never responds: onload/onerror
  // never fire. Only xhr.timeout + ontimeout get the rider out of the spinner.
  var sawTimeout = false;
  global.XMLHttpRequest = function () {
    this.open = function () {};
    this.send = function () {
      var self = this;
      setTimeout(function () {
        if (typeof self.ontimeout === 'function' && self.timeout > 0) { sawTimeout = true; self.ontimeout(); }
        else if (self.onerror) self.onerror(new Error('stalled'));
      }, 0);
    };
  };
  cta.getArrivals(STATION, function (err) {
    assert.strictEqual(err, 3);
    assert.ok(sawTimeout, 'getJSON must set xhr.timeout and ontimeout');
    resolve();
  });
}));
