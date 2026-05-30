const { test } = require('node:test');
const assert = require('node:assert');
const { buildArrivals, _displayRoute } = require('./arrivals');

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

test('express folds into the base line, tagged express, time-sorted with locals', () => {
  const now = 900;
  const rows = [
    { route: '6',  stop: '601N', time: now + 300, dest: null },
    { route: '6X', stop: '601N', time: now + 120, dest: null },
    { route: '6',  stop: '601N', time: now + 600, dest: null }
  ];
  const out = buildArrivals(rows, '601', now);
  assert.strictEqual(out.length, 1);                          // one merged "6" bullet
  assert.strictEqual(out[0].line, '6');
  const n = out[0].directions.find(d => d.dir === 'N');
  assert.deepStrictEqual(n.times, [now + 120, now + 300, now + 600]); // both services, sorted
  assert.deepStrictEqual(n.exp, [true, false, false]);        // soonest train is the express
});

test('a lone express train labels via its base line terminal', () => {
  const out = buildArrivals([{ route: '6X', stop: '601N', time: 1000 }], '601', 900);
  assert.strictEqual(out[0].line, '6');
  assert.strictEqual(out[0].directions[0].dest, 'Pelham Bay Park'); // TERMINALS['6N']
  assert.deepStrictEqual(out[0].directions[0].exp, [true]);
});

test('local-only arrivals carry an all-false express flag', () => {
  const out = buildArrivals([{ route: '6', stop: '601N', time: 1000 }], '601', 900);
  assert.deepStrictEqual(out[0].directions[0].exp, [false]);
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

test('PATH: groups by direction_id when stop has no N/S suffix', () => {
  const now = 1000;
  const rows = [
    { route: '862', dir: 1, stop: '26733', time: now + 120, dest: null },
    { route: '862', dir: 0, stop: '26733', time: now + 300, dest: null }
  ];
  const out = buildArrivals(rows, '26733', now);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].line, 'NW');                  // 862 -> NW
  const dirs = out[0].directions;
  assert.strictEqual(dirs.length, 2);
  const n = dirs.find((d) => d.dir === 'N');              // dir 1 -> N -> WTC
  const s = dirs.find((d) => d.dir === 'S');              // dir 0 -> S -> Newark
  assert.strictEqual(n.dest, 'World Trade Ctr');
  assert.strictEqual(s.dest, 'Newark');
});

test('PATH route_ids map to 2-char display labels', () => {
  assert.strictEqual(_displayRoute('862'), 'NW');
  assert.strictEqual(_displayRoute('859'), 'H3');
  assert.strictEqual(_displayRoute('77285'), 'W3');
  assert.strictEqual(_displayRoute('Q'), 'Q');            // subway unchanged
});

test('a merged complex matches subway by parent and PATH by bare id together', () => {
  const now = 1000;
  const rows = [
    { route: 'F', stop: 'D19N', time: now + 60, dest: 'D14' },           // subway side
    { route: '862', dir: 1, stop: '26722', time: now + 120, dest: null } // PATH side
  ];
  const out = buildArrivals(rows, ['132', 'D19', 'L02', '26722'], now);  // 14 St merged ids
  const lines = out.map((o) => o.line).sort();
  assert.deepStrictEqual(lines, ['F', 'NW']);             // both systems surface at one station
});
