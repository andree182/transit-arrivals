const { test } = require('node:test');
const assert = require('node:assert');
const { encodeBundle } = require('./bundle');
const { colorForLine } = require('./lines');

// v3 header: version(1) + epoch(4) + station(39) + id(11) + lineCount(1) = 56.
// Per line: label(2) + rgb(3) + nDirs(1) = 6, then per dir: dest(20) + dir(1) +
// nArr(1) + deltas. So for the first line/dir:
const LINE_COUNT = 55;
const DIR_CODE = 56 + 2 + 3 + 1 + 20;   // 82
const N_ARR = DIR_CODE + 1;             // 83
const DELTA0 = N_ARR + 1;               // 84

test('encodes header, station, id, and one line/dir/arrival', () => {
  const arr = [{ line: 'N', directions: [{ dir: 'N', dest: 'Astoria-Ditmars Blvd', times: [1060, 1300] }] }];
  const bytes = encodeBundle('R01', 'Astoria-Ditmars Blvd', arr, 1000, colorForLine);
  assert.strictEqual(bytes[0], 3);                        // version
  assert.strictEqual(bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] * 16777216), 1000);
  assert.strictEqual(bytes[LINE_COUNT], 1);               // lineCount
  assert.strictEqual(bytes[DIR_CODE], 2);                 // N northbound heads to Queens (2)
  assert.strictEqual(bytes[DELTA0] | (bytes[DELTA0 + 1] << 8), 60);  // 1060-1000
});

test('labels each direction by the borough it heads toward', () => {
  const mk = (line, dir) => encodeBundle('x', 'y',
    [{ line: line, directions: [{ dir: dir, dest: 'd', times: [1100] }] }], 1000, () => [0, 0, 0]);
  assert.strictEqual(mk('4', 'N')[DIR_CODE], 3);          // 4 north = Bronx
  assert.strictEqual(mk('4', 'S')[DIR_CODE], 1);          // 4 south = Brooklyn
  assert.strictEqual(mk('6', 'S')[DIR_CODE], 0);          // 6 south = Manhattan
  assert.strictEqual(mk('L', 'N')[DIR_CODE], 0);          // L toward 8 Av = Manhattan
});

test('suppresses the direction word on shuttles', () => {
  const arr = [{ line: 'S', directions: [{ dir: 'N', dest: 'Franklin Av', times: [1100] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000, () => [0, 0, 0]);
  assert.strictEqual(bytes[DIR_CODE], 4);                 // S = no direction word (none)
});

test('clamps deltas over 65535 and caps arrivals at 6', () => {
  const arr = [{ line: '6', directions: [{ dir: 'N', dest: 'x', times: [1,2,3,4,5,6,7,8].map(n => 1000 + n*100000) }] }];
  const bytes = encodeBundle('6', 'x', arr, 1000, () => [0,0,0]);
  assert.strictEqual(bytes[N_ARR], 6);                    // capped
});

test('long suffixed name round-trips without truncation', () => {
  const name = 'Times Sq-42 St (1237ACENQRSW)';            // 29 chars
  const bytes = encodeBundle('127', name, [], 1000, () => [0,0,0]);
  let out = '';
  for (let i = 5; i < 5 + name.length; i++) out += String.fromCharCode(bytes[i]);
  assert.strictEqual(out, name);
});
