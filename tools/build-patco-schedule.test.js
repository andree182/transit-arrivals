'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { labelFor } = require('./build-patco-schedule.js');
test('PATCO labels its single High Speed Line', () => {
  assert.strictEqual(labelFor({ route_long_name: 'High Speed Line', route_type: '1' }), 'PA');
  assert.strictEqual(labelFor({ route_long_name: 'Bus 400', route_type: '3' }), null);
});
