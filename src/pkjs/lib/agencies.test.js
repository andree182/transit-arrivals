const { test } = require('node:test');
const assert = require('node:assert');
const agencies = require('./agencies');
const mta = agencies.get('mta');

test('mta directionWord maps (route,dir) to the borough word', () => {
  assert.strictEqual(mta._directionWord('Q', 'N'), 'MANHATTAN');
  assert.strictEqual(mta._directionWord('Q', 'S'), 'BROOKLYN');
  assert.strictEqual(mta._directionWord('M', 'N'), '');     // NONE -> empty
  assert.strictEqual(mta._directionWord('SIR', 'S'), '');
  assert.strictEqual(mta._directionWord('1', 'N'), 'BRONX');
});

test('registry exposes mta with a direct transport', () => {
  assert.strictEqual(mta.id, 'mta');
  assert.strictEqual(mta.transport, 'direct');
  assert.strictEqual(typeof mta.getArrivals, 'function');
});

test('get() defaults to mta for an unknown agency id', () => {
  assert.strictEqual(agencies.get('zzz').id, 'mta');
});

test('registry resolves the proxied CTA agency', () => {
  const c = agencies.get('cta');
  assert.strictEqual(c.id, 'cta');
  assert.strictEqual(c.transport, 'proxied');
  assert.strictEqual(typeof c.getArrivals, 'function');
});

test('stalled MTA feed and alert requests time out instead of hanging', () => new Promise((resolve) => {
  // Stalled-connection simulation: nothing ever fires unless the code set
  // xhr.timeout + ontimeout. Without them this used to spin forever.
  var requests = 0, timeouts = 0;
  global.XMLHttpRequest = function () {
    requests++;
    this.open = function () {};
    this.send = function () {
      var self = this;
      setTimeout(function () {
        if (typeof self.ontimeout === 'function' && self.timeout > 0) { timeouts++; self.ontimeout(); }
        else if (self.onerror) self.onerror(new Error('stalled'));
      }, 0);
    };
  };
  mta.getArrivals({ id: '127', name: 'Times Sq-42 St', lines: ['1'] }, function (err) {
    assert.strictEqual(err, 3);   // every feed dead -> offline
    assert.strictEqual(timeouts, requests, 'every XHR must set timeout + ontimeout');
    resolve();
  });
}));

test('registry resolves the proxied WMATA agency', () => {
  const w = agencies.get('wmata');
  assert.strictEqual(w.id, 'wmata');
  assert.strictEqual(w.transport, 'proxied');
  assert.strictEqual(typeof w.getArrivals, 'function');
});
