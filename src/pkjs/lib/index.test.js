// Entry-point wiring tests for src/pkjs/index.js: the ready handshake, the
// FavSync mirror, request dispatch, and error paths. index.js registers its
// Pebble listeners at require time, so each test loads a fresh copy against
// fresh Pebble/localStorage/navigator mocks.
const { test } = require('node:test');
const assert = require('node:assert');

function mockEnv() {
  const listeners = {};
  const sent = [];
  global.Pebble = {
    addEventListener: function (name, fn) { listeners[name] = fn; },
    sendAppMessage: function (msg, ok) { sent.push(msg); if (ok) setImmediate(ok); },
    openURL: function (url) { this._url = url; }
  };
  const store = {};
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    _store: store
  };
  // Node's built-in `navigator` is a getter-only global; plain assignment is
  // silently ignored, so install the mock with defineProperty.
  Object.defineProperty(global, 'navigator', {
    value: { geolocation: { getCurrentPosition: function () {} } },
    configurable: true, writable: true
  });
  // Default XHR: every request errors fast (no network in tests).
  global.XMLHttpRequest = function () {
    this.open = function () {};
    this.send = function () { var s = this; setImmediate(function () { if (s.onerror) s.onerror(new Error('no network')); }); };
  };
  delete require.cache[require.resolve('../index.js')];
  require('../index.js');
  return { listeners: listeners, sent: sent };
}

test('ready handshake sends the startup ack then a favorites request', () => {
  const env = mockEnv();
  env.listeners.ready();
  assert.deepStrictEqual(env.sent[0], { ErrorCode: 0 });
  assert.deepStrictEqual(env.sent[1], { FavReq: 1 });
});

test('an inbound FavSync blob is mirrored to localStorage', () => {
  const env = mockEnv();
  const favsync = require('./favsync');
  const blob = Array.prototype.slice.call(favsync.encodeFavList(1, [
    { id: 'R16', name: 'Times Sq-42 St', label: 'Work', agency: 'mta' }
  ]));
  env.listeners.appmessage({ payload: { FavSync: blob } });
  const mirror = JSON.parse(global.localStorage.getItem('mta_favs'));
  assert.strictEqual(mirror.nearestPos, 1);
  assert.strictEqual(mirror.favs[0].id, 'R16');
  assert.strictEqual(mirror.favs[0].agency, 'mta');
});

test('an unknown station id answers error 2 with the request token echoed', () => {
  const env = mockEnv();
  env.listeners.appmessage({ payload: { StationId: 'no-such-station', Req: '42' } });
  assert.deepStrictEqual(env.sent[0], { ErrorCode: 2, Req: '42' });
});

test('a geolocation failure answers error 1', () => {
  const env = mockEnv();
  global.navigator.geolocation.getCurrentPosition = function (ok, fail) { fail(new Error('denied')); };
  env.listeners.appmessage({ payload: { UseNearest: 1, Req: '7' } });
  assert.deepStrictEqual(env.sent[0], { ErrorCode: 1, Req: '7' });
});

test('a fix outside the covered systems answers error 2, not a Times Sq board', () => {
  const env = mockEnv();
  global.navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 39.7392, longitude: -104.9903 } });   // Denver (uncovered)
  };
  env.listeners.appmessage({ payload: { UseNearest: 1, Req: '9' } });
  assert.deepStrictEqual(env.sent[0], { ErrorCode: 2, Req: '9' });
});
