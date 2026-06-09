const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-skyline-stations.js');
test('Skyline label matches only the rail route', () => {
  assert.strictEqual(labelFor({ route_long_name: 'Skyline', route_short_name: 'SKY', route_type: '1' }), 'SK');
  assert.strictEqual(labelFor({ route_long_name: 'Rail', route_short_name: 'Skyline', route_type: '2' }), 'SK');
  assert.strictEqual(labelFor({ route_long_name: 'Kalihi', route_short_name: '1', route_type: '3' }), null);
});
