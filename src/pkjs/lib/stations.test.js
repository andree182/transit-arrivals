const { test } = require('node:test');
const assert = require('node:assert');
const { nearestStation, getStation } = require('./stations');

test('nearestStation returns the closest by haversine', () => {
  // Times Sq-42 (40.7559,-73.9871) vs Astoria-Ditmars (40.7752,-73.9120)
  const near = nearestStation(40.7560, -73.9870);
  assert.strictEqual(near.name, 'Times Sq-42 St');
});

test('getStation looks up by id', () => {
  assert.strictEqual(getStation('R01').name, 'Astoria-Ditmars Blvd');
});
