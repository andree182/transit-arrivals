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

test('registry resolves the proxied WMATA agency', () => {
  const w = agencies.get('wmata');
  assert.strictEqual(w.id, 'wmata');
  assert.strictEqual(w.transport, 'proxied');
  assert.strictEqual(typeof w.getArrivals, 'function');
});
