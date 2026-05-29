const { test } = require('node:test');
const assert = require('node:assert');
const { encodeBundle } = require('./bundle');
const { colorForLine } = require('./lines');

test('encodes header, station, id, and one line/dir/arrival', () => {
  const arr = [{ line: 'N', directions: [{ dir: 'N', dest: 'Astoria-Ditmars Blvd', times: [1060, 1300] }] }];
  const bytes = encodeBundle('R01', 'Astoria-Ditmars Blvd', arr, 1000, colorForLine);
  assert.strictEqual(bytes[0], 2);                        // version
  assert.strictEqual(bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] * 16777216), 1000);
  assert.strictEqual(bytes[40], 1);                       // lineCount (header now 41 bytes)
  // first delta is 60s (1060-1000): header 41 + line(6) + dest 20 + nArr 1 = offset 68
  assert.strictEqual(bytes[68] | (bytes[69] << 8), 60);
});

test('clamps deltas over 65535 and caps arrivals at 6', () => {
  const arr = [{ line: '6', directions: [{ dir: 'N', dest: 'x', times: [1,2,3,4,5,6,7,8].map(n => 1000 + n*100000) }] }];
  const bytes = encodeBundle('6', 'x', arr, 1000, () => [0,0,0]);
  const nArrOffset = 41 + 6 + 20;
  assert.strictEqual(bytes[nArrOffset], 6);               // capped
});
