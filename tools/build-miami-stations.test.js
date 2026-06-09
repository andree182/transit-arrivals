const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-miami-stations.js');
// Miami Metrorail is one combined route in GTFS: "REGULAR METRORAIL SERVICE" -> 'MR'.
// Metromover (inner/outer loops + Airport People Mover) -> 'MM'.
test('Miami labels: Metrorail (single combined route) + Metromover', () => {
  assert.strictEqual(labelFor({ route_long_name: 'REGULAR METRORAIL SERVICE', route_short_name: '2600' }), 'MR');
  assert.strictEqual(labelFor({ route_long_name: 'Metrorail Orange Line', route_short_name: 'Orange' }), 'MR');
  assert.strictEqual(labelFor({ route_long_name: 'Metromover Inner Loop', route_short_name: 'Inner' }), 'MM');
  assert.strictEqual(labelFor({ route_long_name: 'AIRPORT PEOPLE MOVER', route_short_name: 'MIA' }), 'MM');
  assert.strictEqual(labelFor({ route_long_name: 'Route 11', route_short_name: '11' }), null);
});
