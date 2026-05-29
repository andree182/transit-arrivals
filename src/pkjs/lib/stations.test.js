const { test } = require('node:test');
const assert = require('node:assert');
const { nearestStation, getStation, displayName } = require('./stations');

test('nearestStation returns the closest by haversine', () => {
  // Times Sq-42 (40.7559,-73.9871) vs Astoria-Ditmars (40.7752,-73.9120)
  const near = nearestStation(40.7560, -73.9870);
  assert.strictEqual(near.name, 'Times Sq-42 St');
});

test('getStation looks up by id', () => {
  assert.strictEqual(getStation('R01').name, 'Astoria-Ditmars Blvd');
});

test('displayName appends parenthesized line letters', () => {
  assert.strictEqual(displayName(getStation('L16')), 'DeKalb Av (L)');
});

test('displayName joins multiple lines without separators', () => {
  const st = { name: '14 St-Union Sq', lines: ['4','5','6','L','N','Q','R','W'] };
  assert.strictEqual(displayName(st), '14 St-Union Sq (456LNQRW)');
});

test('displayName omits parens when no lines', () => {
  assert.strictEqual(displayName({ name: 'Nowhere', lines: [] }), 'Nowhere');
});
