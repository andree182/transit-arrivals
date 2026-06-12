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

test('nearestStation returns null far outside the service area (honest, no fake NYC board)', () => {
  // A rider in an uncovered city must get the "no covered station" card, not a live
  // Times Sq board with zero explanation. (LA is now covered by LA Metro Rail.)
  assert.strictEqual(nearestStation(51.5074, -0.1278), null);     // London
  assert.strictEqual(nearestStation(39.7392, -104.9903), null);   // Denver
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
  stations._db.forEach((s) => { assert.ok(s.agency, 'missing agency on ' + s.id); });
});

test('getStation returns an mta-tagged station', () => {
  const st = stations.getStation('R16');
  assert.ok(st);
  assert.strictEqual(st.agency, 'mta');
});

test('CTA stations are present and tagged', () => {
  const clark = stations.getStation('40380');
  assert.ok(clark);
  assert.strictEqual(clark.agency, 'cta');
  assert.ok(clark.lines.indexOf('Bl') >= 0);
});

test('nearest station near the Loop is a CTA station', () => {
  const st = stations.nearestStation(41.8857, -87.6309);   // Clark/Lake
  assert.strictEqual(st.agency, 'cta');
});

test('nearest station in midtown Manhattan is an MTA station', () => {
  const st = stations.nearestStation(40.7549, -73.9870);    // Times Sq area
  assert.strictEqual(st.agency, 'mta');
});

test('nearest station in DC is a WMATA station', () => {
  const st = stations.nearestStation(38.8983, -77.0281);   // Metro Center
  assert.strictEqual(st.agency, 'wmata');
});

test('nearest station in Atlanta is a MARTA station', () => {
  const st = stations.nearestStation(33.7540, -84.3917);   // Five Points
  assert.strictEqual(st.agency, 'marta');
});

test('a downtown San Francisco coordinate resolves to a BART station', () => {
  const s = stations.nearestStation(37.7793, -122.4193);   // near Civic Center
  assert.strictEqual(s.agency, 'bart');
});

test('nearest station in downtown Boston is an MBTA station', () => {
  const st = stations.nearestStation(42.3564, -71.0624);   // Park Street area
  assert.strictEqual(st.agency, 'mbta');
});

test('an MBTA station is present, findable, and line-tagged', () => {
  const park = stations.getStation('place-pktrm');
  assert.ok(park, 'Park Street present');
  assert.strictEqual(park.agency, 'mbta');
  assert.ok(park.lines.indexOf('Rd') >= 0 && park.lines.indexOf('Gn') >= 0, 'Red + Green at Park St');
});

test('nearest station to Center City Philadelphia is a SEPTA station', () => {
  // City Hall area: 39.9526, -75.1652
  const s = stations.nearestStation(39.9526, -75.1652);
  assert.strictEqual(s.agency, 'septa');
});

test('nearest station to downtown Cleveland is a GCRTA stop', () => {
  // Tower City-Public Sq Stn: 41.4975, -81.6940
  const s = nearestStation(41.4975, -81.6940);
  assert.strictEqual(s.agency, 'gcrta');
});

// Miami / Baltimore / Honolulu are built in but NOT YET LIVE (no Swiftly key), so
// they're filtered out of the search DB — none of their stations should appear, and
// nothing should resolve to those agencies. Flip them on (stations.js NOT_YET_LIVE)
// once the keys are configured, then restore the nearest-station assertions below.
test('not-yet-live agencies are hidden from the station DB', () => {
  const present = {};
  stations._db.forEach(function (s) { present[s.agency] = true; });
  assert.ok(!present.skyline, 'skyline should be hidden (no Swiftly key)');
  // Live agencies stay searchable.
  assert.ok(present.gcrta && present.patco && present.trenurbano);
  assert.ok(present.miami && present.baltimore, 'miami + baltimore are now live');
  // A point in downtown Miami now resolves to a live miami station.
  const miamiHit = nearestStation(25.7759, -80.1961);
  assert.ok(miamiHit && miamiHit.agency === 'miami', 'downtown Miami resolves to a miami station');
});

test('a favorite id truncated by the old caps still resolves by unique prefix', () => {
  // Favorites saved under the old 15- and 23-byte id caps persist a truncated
  // id forever (e.g. "septa-holmesbur"). Rescue them: an exact miss at a legacy
  // cap length falls back to a UNIQUE prefix match instead of "Bad station".
  const full = 'septa-holmesburg-junction';
  assert.strictEqual(getStation(full.slice(0, 15), 'septa').id, full);
  assert.strictEqual(getStation(full.slice(0, 23), 'septa').id, full);
  assert.strictEqual(getStation('HAMILTON E HOLMES STATI'.slice(0, 23), 'marta').id, 'HAMILTON E HOLMES STATION');
  // An ambiguous prefix (matches many stations) must NOT guess.
  assert.strictEqual(getStation('septa-', 'septa'), null);
});

test('nearest station to a PATCO stop is a patco station', () => {
  // Collingswood PATCO: 39.91359, -75.06456
  const s = nearestStation(39.91359, -75.06456);
  assert.strictEqual(s.agency, 'patco');
});

test('nearest station to a Tren Urbano stop is a trenurbano station', () => {
  // Estación Bayamón: 18.40035, -66.15375
  const s = nearestStation(18.40035, -66.15375);
  assert.strictEqual(s.agency, 'trenurbano');
});

test('getStation resolves colliding ids by agency (MTA vs WMATA A02)', () => {
  // "A02" exists in both MTA and WMATA; id-only returns the concat-first (MTA).
  assert.strictEqual(getStation('A02').agency, 'mta');
  assert.strictEqual(getStation('A02', 'wmata').agency, 'wmata');
  assert.strictEqual(getStation('A02', 'mta').agency, 'mta');
});

test('multi-point complex is nearest from each entrance, not a fat circle', () => {
  // 14 St/6 Av (id 132): 1/2/3 at 7 Av, F/M/L + PATH at 6 Av (a block apart).
  assert.strictEqual(nearestStation(40.73783, -74.00020).id, '132');  // 7 Av entrance
  assert.strictEqual(nearestStation(40.73735, -73.99684).id, '132');  // 6 Av FML/PATH entrance
  // Both ends resolve to the same complex, which carries all its lines.
  assert.ok(nearestStation(40.73735, -73.99684).lines.indexOf('F') >= 0);
  assert.ok(nearestStation(40.73735, -73.99684).lines.indexOf('L') >= 0);
});

test('miami and baltimore are live (present in the search DB)', () => {
  const agencies = new Set(stations._db.map((s) => s.agency));
  assert.ok(agencies.has('miami'), 'miami should be live');
  assert.ok(agencies.has('baltimore'), 'baltimore should be live');
  assert.ok(!agencies.has('skyline'), 'skyline stays hidden (no key)');
});

test('lametro is registered and live in the search DB', () => {
  const agencies = new Set(stations._db.map((s) => s.agency));
  assert.ok(agencies.has('lametro'), 'lametro should be live');
  // Downtown LA (near Union Station) resolves to an LA Metro station.
  const la = nearestStation(34.0560, -118.2340);
  assert.ok(la && la.agency === 'lametro', 'downtown LA resolves to a lametro station');
});

test('merged complexes carry their member platform names as alt search names', () => {
  // 14 St/6 Av complex: the L platform is "6 Av" in the GTFS; a rider searching
  // "6th Ave" must find it even though the merged entry is named "14 St".
  const sixth = getStation('132', 'mta');
  assert.ok(sixth.alt && sixth.alt.indexOf('6 Av') >= 0, '132 carries "6 Av" alt');
  // 14 St on 8th Av: the L platform there is "8 Av".
  const eighth = getStation('A31', 'mta');
  assert.ok(eighth.alt && eighth.alt.indexOf('8 Av') >= 0, 'A31 carries "8 Av" alt');
  // Alt names never duplicate the entry's own name (normalized): D19 is also
  // called "14 St" and must not appear as an alt of 132.
  assert.ok(sixth.alt.indexOf('14 St') < 0, 'own name not repeated as alt');
});
