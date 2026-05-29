const { test } = require('node:test');
const assert = require('node:assert');
const { extractStopTimes } = require('./gtfsrt');
const { build } = require('./fixtures/make-fixture');

test('extractStopTimes pulls route_id, stop_id, arrival time', () => {
  const rows = extractStopTimes(build());
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { route: 'N', stop: 'R01N', time: 1780000060 });
  assert.strictEqual(rows[1].time, 1780000300);
});
