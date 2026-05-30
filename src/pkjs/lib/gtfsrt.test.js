const { test } = require('node:test');
const assert = require('node:assert');
const { extractStopTimes } = require('./gtfsrt');
const { build, buildTrip, buildPathTrip } = require('./fixtures/make-fixture');

test('extractStopTimes pulls route_id, stop_id, arrival time', () => {
  const rows = extractStopTimes(build());
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].route, 'N');
  assert.strictEqual(rows[0].stop, 'R01N');
  assert.strictEqual(rows[0].time, 1780000060);
  assert.strictEqual(rows[1].time, 1780000300);
});

test('every row carries the trip terminal (last stop, station id) as dest', () => {
  const rows = extractStopTimes(buildTrip('A', [['A30S', 1000], ['A45S', 2000], ['A65S', 3000]]));
  assert.strictEqual(rows.length, 3);
  rows.forEach((r) => assert.strictEqual(r.dest, 'A65')); // A65S terminal -> station A65
});

test('captures direction_id when present (PATH dummy trip)', () => {
  const rows = extractStopTimes(buildPathTrip('862', 1, '26733', 1780000060));
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].route, '862');
  assert.strictEqual(rows[0].stop, '26733');
  assert.strictEqual(rows[0].dir, 1);
});

test('single-stop trips report null dest (no fake terminal)', () => {
  const rows = extractStopTimes(buildPathTrip('862', 0, '26729', 1780000300));
  assert.strictEqual(rows[0].dest, null);
});

test('subway rows leave dir undefined (no direction_id in NYCT feed)', () => {
  const rows = extractStopTimes(build());
  assert.strictEqual(rows[0].dir, undefined);
});
