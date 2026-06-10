'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-trenurbano-schedule.js');
test('Tren Urbano keeps only the TU metro route', () => {
  assert.strictEqual(labelFor({ route_id: 'TU', route_long_name: 'Bayamón - Sagrado Corazón', route_type: '1' }), 'TU');
  assert.strictEqual(labelFor({ route_id: 'MA001', route_long_name: 'Cataño - Viejo San Juan', route_type: '4' }), null);
  assert.strictEqual(labelFor({ route_id: '7', route_long_name: 'Bus 7', route_type: '3' }), null);
});
