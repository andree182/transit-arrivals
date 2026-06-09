'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildRailArtifacts } = require('./gtfs-rail.js');

// Minimal GTFS: one rail route "R" (type 1), one bus route "B" (type 3).
// Station P has two platforms p1/p2 (parent_station=P); bus stop b1 is standalone.
const gtfs = {
  stops: [
    { stop_id: 'P', stop_name: 'Pine', stop_lat: '41.50', stop_lon: '-81.70', location_type: '1', parent_station: '' },
    { stop_id: 'p1', stop_name: 'Pine NB', stop_lat: '41.500', stop_lon: '-81.700', location_type: '0', parent_station: 'P' },
    { stop_id: 'p2', stop_name: 'Pine SB', stop_lat: '41.501', stop_lon: '-81.701', location_type: '0', parent_station: 'P' },
    { stop_id: 'e1', stop_name: 'East End', stop_lat: '41.40', stop_lon: '-81.60', location_type: '0', parent_station: '' },
    { stop_id: 'b1', stop_name: 'Bus Only', stop_lat: '41.30', stop_lon: '-81.50', location_type: '0', parent_station: '' }
  ],
  routes: [
    { route_id: 'R', route_short_name: 'Red', route_long_name: 'Red Line', route_type: '1', route_color: 'E4002B' },
    { route_id: 'B', route_short_name: '8', route_long_name: 'Bus', route_type: '3', route_color: '000000' }
  ],
  trips: [
    { route_id: 'R', trip_id: 'r1', direction_id: '0' },
    { route_id: 'B', trip_id: 'b9', direction_id: '0' }
  ],
  stopTimes: [
    { trip_id: 'r1', stop_id: 'p1', stop_sequence: '1' },
    { trip_id: 'r1', stop_id: 'e1', stop_sequence: '2' },
    { trip_id: 'b9', stop_id: 'b1', stop_sequence: '1' }
  ]
};
const cfg = {
  id: 'gcrta', agency: 'gcrta', railTypes: new Set([0, 1, 2]),
  labelFor: r => (/red/i.test(r.route_long_name) ? 'Rd' : null)
};

test('keeps only rail stops, groups platforms under parent, drops bus stop', () => {
  const { stations, data } = buildRailArtifacts(gtfs, cfg);
  const ids = stations.map(s => s.id).sort();
  assert.deepStrictEqual(ids, ['P', 'e1']);                       // b1 (bus) excluded
  const pine = stations.find(s => s.id === 'P');
  assert.strictEqual(pine.name, 'Pine');
  assert.deepStrictEqual(pine.lines, ['Rd']);
  assert.strictEqual(pine.agency, 'gcrta');
  assert.deepStrictEqual(data.stations.P.sort(), ['p1', 'p2']);   // both platforms map to station P
  assert.deepStrictEqual(data.stations.e1, ['e1']);               // no parent -> self
});

test('routes map carries label + parsed color; names cover rail stops only', () => {
  const { data } = buildRailArtifacts(gtfs, cfg);
  assert.deepStrictEqual(data.routes.R, { label: 'Rd', color: [228, 0, 43] });
  assert.strictEqual(data.routes.B, undefined);
  assert.strictEqual(data.names.e1, 'East End');
  assert.strictEqual(data.names.b1, undefined);                   // bus stop name not bundled
});
