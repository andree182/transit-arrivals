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

// Two same-named standalone platforms ~17m apart on a parent-less LRT route.
const lrtGtfs = {
  stops: [
    { stop_id: 'a1', stop_name: 'ASHBY STATION', stop_lat: '41.468429', stop_lon: '-81.572468', location_type: '0', parent_station: '' },
    { stop_id: 'a2', stop_name: 'ASHBY STATION', stop_lat: '41.468585', stop_lon: '-81.572731', location_type: '0', parent_station: '' },
    { stop_id: 'far', stop_name: 'ASHBY STATION', stop_lat: '41.60', stop_lon: '-81.70', location_type: '0', parent_station: '' }
  ],
  routes: [{ route_id: 'BL', route_short_name: '67', route_long_name: 'Blue Line', route_type: '0', route_color: '15BEF0' }],
  trips: [{ route_id: 'BL', trip_id: 't', direction_id: '0' }],
  stopTimes: [
    { trip_id: 't', stop_id: 'a1', stop_sequence: '1' },
    { trip_id: 't', stop_id: 'a2', stop_sequence: '2' },
    { trip_id: 't', stop_id: 'far', stop_sequence: '3' }
  ]
};
const lrtCfg = { id: 'gcrta', agency: 'gcrta', railTypes: new Set([0, 1, 2]), labelFor: () => 'Bl' };

test('mergeByNameMeters collapses co-located same-name platforms but not distant ones', () => {
  const merged = buildRailArtifacts(lrtGtfs, { ...lrtCfg, mergeByNameMeters: 300 });
  // a1+a2 merge into one; "far" (same name, ~15km away) stays separate -> 2 stations
  assert.strictEqual(merged.stations.length, 2);
  const both = merged.stations.find(s => merged.data.stations[s.id].length === 2);
  assert.deepStrictEqual(merged.data.stations[both.id], ['a1', 'a2']);
  // Without the option, all three remain distinct.
  const unmerged = buildRailArtifacts(lrtGtfs, lrtCfg);
  assert.strictEqual(unmerged.stations.length, 3);
});

test('titleCase is Unicode-aware: keeps accents/apostrophes intact', () => {
  const { titleCase } = require('./gtfs-rail.js');
  assert.strictEqual(titleCase('ESTACIÓN BAYAMÓN'), 'Estación Bayamón');
  assert.strictEqual(titleCase('SAGRADO CORAZÓN'), 'Sagrado Corazón');
  assert.strictEqual(titleCase("HO'AE'AE"), "Ho'ae'ae");
  assert.strictEqual(titleCase('PEARL HARBOR-HICKAM'), 'Pearl Harbor-Hickam');
  assert.strictEqual(titleCase('TRI-C CAMPUS DISTRICT (E. 34TH)'), 'Tri-C Campus District (E. 34th)');
  assert.strictEqual(titleCase('BISCAYNE BD@E FLAGLER ST'), 'Biscayne Bd@E Flagler St');
  assert.strictEqual(titleCase('34TH STREET'), '34th Street');
});

test('titleCase normalizes SHOUTY names in station list and dest names', () => {
  const { stations, data } = buildRailArtifacts(lrtGtfs, { ...lrtCfg, mergeByNameMeters: 300, titleCase: true });
  assert.ok(stations.every(s => s.name === 'Ashby Station'));
  assert.ok(Object.values(data.names).every(n => n === 'Ashby Station'));
});

test('excludeNameRe drops non-passenger yard/depot entries and their stopIds', () => {
  const yardGtfs = {
    stops: [
      { stop_id: 'st1', stop_name: 'Real Station', stop_lat: '41.5', stop_lon: '-81.7', location_type: '0', parent_station: '' },
      { stop_id: 'yd1', stop_name: 'MTA Light Rail Division', stop_lat: '41.6', stop_lon: '-81.8', location_type: '0', parent_station: '' }
    ],
    routes: [{ route_id: 'L', route_short_name: 'LR', route_long_name: 'Light Rail', route_type: '0', route_color: '007499' }],
    trips: [{ route_id: 'L', trip_id: 't', direction_id: '0' }],
    stopTimes: [{ trip_id: 't', stop_id: 'st1', stop_sequence: '1' }, { trip_id: 't', stop_id: 'yd1', stop_sequence: '2' }]
  };
  const cfg = { id: 'b', agency: 'b', railTypes: new Set([0]), labelFor: () => 'LR', excludeNameRe: /\b(division|yard|depot)\b/i };
  const { stations, data } = buildRailArtifacts(yardGtfs, cfg);
  assert.deepStrictEqual(stations.map(s => s.id), ['st1']);
  assert.strictEqual(data.stations.yd1, undefined);
});
