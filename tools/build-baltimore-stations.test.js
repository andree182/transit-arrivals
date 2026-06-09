const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-baltimore-stations.js');
test('Baltimore labels: Metro SubwayLink + Light RailLink', () => {
  assert.strictEqual(labelFor({ route_long_name: 'Metro SubwayLink', route_type: '1' }), 'M');
  assert.strictEqual(labelFor({ route_long_name: 'Light RailLink', route_type: '0' }), 'LR');
  assert.strictEqual(labelFor({ route_long_name: 'LocalLink 22', route_type: '3' }), null);
});
