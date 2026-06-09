// tools/build-mbta-stations.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildStations } = require('./build-mbta-stations');

// perRouteStopArrays: [{ route:'Red'|'Green-B'|…, stops:[{id,attributes:{name,latitude,longitude}}] }]
test('unions a shared-trunk station across routes into one multi-line entry', () => {
  const out = buildStations([
    { route: 'Red', stops: [
      { id: 'place-pktrm', attributes: { name: 'Park Street', latitude: 42.3564, longitude: -71.0624 } },
      { id: 'place-alfcl', attributes: { name: 'Alewife', latitude: 42.3954, longitude: -71.1426 } }
    ] },
    { route: 'Green-B', stops: [
      { id: 'place-pktrm', attributes: { name: 'Park Street', latitude: 42.3564, longitude: -71.0624 } }
    ] },
    { route: 'Green-D', stops: [
      { id: 'place-pktrm', attributes: { name: 'Park Street', latitude: 42.3564, longitude: -71.0624 } }
    ] }
  ]);
  const park = out.find(s => s.id === 'place-pktrm');
  assert.ok(park, 'Park Street present once');
  assert.strictEqual(park.name, 'Park Street');
  assert.deepStrictEqual(park.lines, ['Rd', 'Gn']);   // unioned, in ORDER, Green-* collapsed once
  assert.strictEqual(park.agency, 'mbta');
  // single-line station stays single
  const ale = out.find(s => s.id === 'place-alfcl');
  assert.deepStrictEqual(ale.lines, ['Rd']);
  // exactly one Park Street entry (no duplication across Green branches)
  assert.strictEqual(out.filter(s => s.id === 'place-pktrm').length, 1);
});

test('Mattapan keeps its own M label; bad coords dropped', () => {
  const out = buildStations([
    { route: 'Mattapan', stops: [
      { id: 'place-matt', attributes: { name: 'Mattapan', latitude: 42.2675, longitude: -71.0920 } }
    ] },
    { route: 'Red', stops: [
      { id: 'place-bad', attributes: { name: 'Bad', latitude: null, longitude: null } }
    ] }
  ]);
  const matt = out.find(s => s.id === 'place-matt');
  assert.deepStrictEqual(matt.lines, ['M']);
  assert.strictEqual(out.find(s => s.id === 'place-bad'), undefined); // bad coords dropped
});
