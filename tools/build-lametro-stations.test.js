'use strict';
const assert = require('node:assert');
const { test } = require('node:test');
const { labelFor } = require('./build-lametro-stations.js');

test('labelFor extracts the single rail letter and rejects the J bus line', () => {
  assert.strictEqual(labelFor({ route_short_name: 'A Line', route_long_name: 'Metro A Line' }), 'A');
  assert.strictEqual(labelFor({ route_short_name: 'E Line', route_long_name: 'Metro E Line' }), 'E');
  assert.strictEqual(labelFor({ route_short_name: 'K Line', route_long_name: 'Metro K Line' }), 'K');
  assert.strictEqual(labelFor({ route_short_name: 'J Line', route_long_name: 'Metro J Line (Silver)' }), null);
});
