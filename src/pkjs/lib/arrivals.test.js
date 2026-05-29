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

test('drops arrivals already in the past (time < now)', () => {
  const out = buildArrivals([{ route: 'N', stop: 'R01N', time: 500 }], 'R01', 900);
  assert.strictEqual(out.length, 0);
});
