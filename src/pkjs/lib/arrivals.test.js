const { test } = require('node:test');
const assert = require('node:assert');
const { buildArrivals } = require('./arrivals');

const rows = [
  { route: 'N', stop: 'R01N', time: 1000 },
  { route: 'N', stop: 'R01N', time: 1300 },
  { route: 'N', stop: 'R01S', time: 1120 },
  { route: 'N', stop: 'OTHER', time: 1200 }
];

test('groups by line then direction, sorted ascending, station-filtered', () => {
  const out = buildArrivals(rows, 'R01', 900);
  assert.strictEqual(out.length, 1);                 // one line: N
  assert.strictEqual(out[0].line, 'N');
  const dirs = out[0].directions;
  assert.strictEqual(dirs.length, 2);                // N and S
  const north = dirs.find(d => d.dir === 'N');
  assert.deepStrictEqual(north.times, [1000, 1300]); // sorted, OTHER excluded
  assert.ok(north.dest.length > 0);                  // a destination label
});

test('a station complex matches arrivals across all its member stops', () => {
  const cx = [
    { route: '6', stop: '635N', time: 1000 }, // 456 platform
    { route: 'L', stop: 'L03N', time: 1100 }, // L platform
    { route: 'Q', stop: 'R20N', time: 1200 }, // NQRW platform
    { route: '1', stop: '127N', time: 1300 }  // a different complex, excluded
  ];
  const out = buildArrivals(cx, ['635', 'L03', 'R20'], 900);
  const linesSeen = out.map(o => o.line).sort();
  assert.deepStrictEqual(linesSeen, ['6', 'L', 'Q']); // all three platforms, not the foreign '1'
});

test('drops arrivals already in the past (time < now)', () => {
  const out = buildArrivals([{ route: 'N', stop: 'R01N', time: 500 }], 'R01', 900);
  assert.strictEqual(out.length, 0);
});

test('normalizes the Franklin shuttle to the S bullet, keeping its headsign', () => {
  const out = buildArrivals([{ route: 'FS', stop: 'S01N', time: 1000 }], 'S01', 900);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].line, 'S');                         // gray "S" bullet, not "FS"
  assert.strictEqual(out[0].directions[0].dest, 'Franklin Av'); // raw id keeps the headsign
});

test('normalizes the SI feed route to the SIR roundel', () => {
  const out = buildArrivals([{ route: 'SI', stop: 'S31N', time: 1000 }], 'S31', 900);
  assert.strictEqual(out[0].line, 'SIR');
  assert.strictEqual(out[0].directions[0].dest, 'St George');
});

test('headsign follows the soonest train\'s real terminal', () => {
  const rows = [
    { route: 'A', stop: 'A30S', time: 2000, dest: 'H11' }, // later: Far Rockaway (the static default)
    { route: 'A', stop: 'A30S', time: 1000, dest: 'A65' }  // sooner: Lefferts
  ];
  const out = buildArrivals(rows, 'A30', 900);
  assert.strictEqual(out[0].directions[0].dest, 'Ozone Park-Lefferts Blvd'); // A65, the next train, not the static default
});

test('falls back to the static terminal when the trip carries no dest', () => {
  const out = buildArrivals([{ route: 'A', stop: 'A30S', time: 1000 }], 'A30', 900);
  assert.strictEqual(out[0].directions[0].dest, 'Far Rockaway-Mott Av'); // TERMINALS['AS']
});
