const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-baltimore-stations.js');
test('labelFor maps Metro to M and excludes Light Rail', () => {
  assert.strictEqual(labelFor({ route_long_name: 'Owings Mills - Johns Hopkins', route_short_name: 'METRO SUBWAYLINK' }), 'M');
  assert.strictEqual(labelFor({ route_long_name: 'Metro SubwayLink', route_type: '1' }), 'M');
  assert.strictEqual(labelFor({ route_long_name: 'BWI - Hunt Valley', route_short_name: 'LIGHT RAILLINK' }), null);
  assert.strictEqual(labelFor({ route_long_name: 'Light RailLink', route_type: '0' }), null);
  assert.strictEqual(labelFor({ route_long_name: 'LocalLink 22', route_type: '3' }), null);
});
