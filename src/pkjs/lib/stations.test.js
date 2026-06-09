const { test } = require('node:test');
const assert = require('node:assert');
const stations = require('./stations');
const { nearestStation, getStation, displayName } = stations;

test('nearestStation returns the closest by haversine', () => {
  // Times Sq-42 (40.7559,-73.9871) vs Astoria-Ditmars (40.7752,-73.9120)
  const near = nearestStation(40.7560, -73.9870);
  assert.strictEqual(near.name, 'Times Sq-42 St');
});

test('getStation looks up by id', () => {
  assert.strictEqual(getStation('R01').name, 'Astoria-Ditmars Blvd');
});

test('displayName appends parenthesized line letters', () => {
  assert.strictEqual(displayName(getStation('L16')), 'DeKalb Av (L)');
});

test('displayName joins multiple lines without separators', () => {
  const st = { name: '14 St-Union Sq', lines: ['4','5','6','L','N','Q','R','W'] };
  assert.strictEqual(displayName(st), '14 St-Union Sq (456LNQRW)');
});

test('displayName omits parens when no lines', () => {
  assert.strictEqual(displayName({ name: 'Nowhere', lines: [] }), 'Nowhere');
});

test('a standalone PATH station is in the DB, findable, and tagged', () => {
  const hoboken = getStation('26730');
  assert.ok(hoboken, 'Hoboken PATH station present');
  assert.strictEqual(hoboken.name, 'Hoboken');
  assert.deepStrictEqual(hoboken.lines, ['JH', 'H3', 'HW']);
  assert.strictEqual(hoboken.sys, 'path');
});

test('nearestStation can return a standalone PATH station when closest', () => {
  const s = nearestStation(40.72699, -74.03383);   // over Newport PATH
  assert.strictEqual(s.id, '26732');
});

test('nearestStation defaults to Times Sq when far outside the service area', () => {
  const la = nearestStation(34.0522, -118.2437);   // Los Angeles
  assert.strictEqual(la.name, 'Times Sq-42 St');
  const london = nearestStation(51.5074, -0.1278); // London, too
  assert.strictEqual(london.id, 'R16');
});

test('nearestStation still returns a real nearby station inside the area', () => {
  // ~30 km out on Long Island is still within the service radius, not Times Sq.
  const li = nearestStation(40.7900, -73.6000);
  assert.notStrictEqual(li.id, 'R16');
});

test('displayName tags a pure PATH station but not a merged subway one', () => {
  assert.strictEqual(displayName(getStation('26733')), 'Newark · PATH');
  const u14 = getStation('132');                    // 14 St, merged with PATH
  assert.ok(displayName(u14).indexOf('· PATH') < 0);
});

test('a co-located PATH platform merges into the subway entry', () => {
  const u14 = getStation('132');                    // 14 St [1/2/3/F/M/L]
  assert.deepStrictEqual(u14.pathIds, ['26722']);
  ['JH', 'W3', 'H3', 'JS'].forEach((l) =>
    assert.ok(u14.lines.indexOf(l) >= 0, 'has PATH label ' + l));
  assert.ok(u14.lines.indexOf('1') >= 0, 'still has subway lines');
});

test('World Trade Center PATH attaches to BOTH subway complexes', () => {
  assert.deepStrictEqual(getStation('138').pathIds, ['26734']); // WTC Cortlandt [1]
  assert.deepStrictEqual(getStation('228').pathIds, ['26734']); // Park Place [2/3/A/C/E/R/W]
});

test('a merged PATH platform is not also a standalone pin', () => {
  const all = require('./stations.data.json');
  assert.strictEqual(all.filter((s) => s.id === '26722').length, 0);
});

test('every directory entry is tagged with an agency', () => {
  stations._db.forEach((s) => { assert.strictEqual(s.agency, 'mta'); });
});

test('getStation returns an mta-tagged station', () => {
  const st = stations.getStation('R16');
  assert.ok(st);
  assert.strictEqual(st.agency, 'mta');
});
