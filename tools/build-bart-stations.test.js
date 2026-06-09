const { test } = require('node:test');
const assert = require('node:assert');
const { buildStations, buildStops, buildTripMap } = require('./build-bart-stations');

// minimal parsed rows (already CSV-parsed into objects)
const STOPS = [
  { stop_id: 'A10-1', stop_name: 'Lake Merritt', stop_lat: '37.7973', stop_lon: '-122.2653', location_type: '0', parent_station: 'LAKE' },
  { stop_id: 'A10-2', stop_name: 'Lake Merritt', stop_lat: '37.7974', stop_lon: '-122.2652', location_type: '0', parent_station: 'LAKE' }
];
const ROUTE_COLOR = { '1': 'FFFF33', '5': '339933' };       // route_id -> route_color
const TRIPS = [
  { route_id: '1', trip_id: 't1', trip_headsign: 'Antioch', direction_id: '0' },
  { route_id: '5', trip_id: 't5', trip_headsign: 'Daly City', direction_id: '1' }
];
const STATION_LABELS = { LAKE: ['Yl', 'Gn'] };              // abbr -> labels (from stop_times+trips join)

test('buildStops groups platform stop ids under the ETD abbr', () => {
  assert.deepStrictEqual(buildStops(STOPS), { LAKE: ['A10-1', 'A10-2'] });
});
test('buildStations makes one entry per abbr with unioned lines + lat/lon', () => {
  const out = buildStations(STOPS, STATION_LABELS);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 'LAKE');
  assert.strictEqual(out[0].name, 'Lake Merritt');
  assert.deepStrictEqual(out[0].lines, ['Yl', 'Gn']);
  assert.strictEqual(out[0].agency, 'bart');
  assert.ok(Math.abs(out[0].lat - 37.7973) < 0.01);
});
test('buildTripMap maps trip_id to {color label, headsign, direction}', () => {
  assert.deepStrictEqual(buildTripMap(TRIPS, ROUTE_COLOR), {
    t1: { c: 'Yl', h: 'Antioch', d: 0 },
    t5: { c: 'Gn', h: 'Daly City', d: 1 }
  });
});
