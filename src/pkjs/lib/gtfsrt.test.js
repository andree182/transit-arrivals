const { test } = require('node:test');
const assert = require('node:assert');
const { extractStopTimes } = require('./gtfsrt');
const { build, buildTrip } = require('./fixtures/make-fixture');

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
