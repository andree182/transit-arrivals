const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-gcrta-stations.js');

test('GCRTA labels: Red heavy rail + Blue/Green/Waterfront light rail', () => {
  assert.strictEqual(labelFor({ route_long_name: 'Red Line', route_short_name: '66' }), 'Rd');
  assert.strictEqual(labelFor({ route_long_name: 'Blue Line', route_short_name: '67' }), 'Bl');
  assert.strictEqual(labelFor({ route_long_name: 'Green Line', route_short_name: '68' }), 'Gn');
  assert.strictEqual(labelFor({ route_long_name: 'Waterfront Line', route_short_name: '24' }), 'W');
  assert.strictEqual(labelFor({ route_long_name: 'MetroHealth Line', route_short_name: '51' }), null);
});
