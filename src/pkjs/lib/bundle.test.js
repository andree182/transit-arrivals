const { test } = require('node:test');
const assert = require('node:assert');
const { encodeBundle } = require('./bundle');

// v6 header: version(1) + epoch(4) + station(39) + id(11) + lineCount(1) = 56.
// Per line: label(2) + rgb(3) + nDirs(1) = 6, then per dir: dest(20) +
// dirLabel(10) + nArr(1) + deltas(2*nArr) + expMask(1).
// So for the first line/first dir:
const LINE_COUNT = 55;
const DIR_LABEL  = 56 + 2 + 3 + 1 + 20;  // 82  (10-byte null-padded label string)
const N_ARR      = DIR_LABEL + 10;        // 92
const DELTA0     = N_ARR + 1;             // 93

test('encodes header, station, id, and one line/dir/arrival', () => {
  const arr = [{ line: 'N', color: [252, 204, 10], directions: [{ label: 'QUEENS', dest: 'Astoria-Ditmars Blvd', times: [1060, 1300], exp: [false, false] }] }];
  const bytes = encodeBundle('R01', 'Astoria-Ditmars Blvd', arr, 1000);
  assert.strictEqual(bytes[0], 6);                        // version
  assert.strictEqual(bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] * 16777216), 1000);
  assert.strictEqual(bytes[LINE_COUNT], 1);               // lineCount
  assert.strictEqual(bytes[DELTA0] | (bytes[DELTA0 + 1] << 8), 60);  // 1060-1000
});

test('version byte is 6', () => {
  const bytes = encodeBundle('x', 'y', [], 1000);
  assert.strictEqual(bytes[0], 6);
});

test('rgb comes from ln.color, not a colorFn', () => {
  const arr = [{ line: 'Q', color: [252, 204, 10], directions: [{ label: 'MANHATTAN', dest: 'Coney Island', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  // RGB is at offset: header(56) + label(2) = 58
  assert.strictEqual(bytes[58], 252);
  assert.strictEqual(bytes[59], 204);
  assert.strictEqual(bytes[60], 10);
});

test('missing ln.color defaults to white [255,255,255]', () => {
  const arr = [{ line: 'Q', directions: [{ label: 'MANHATTAN', dest: 'Coney Island', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  assert.strictEqual(bytes[58], 255);
  assert.strictEqual(bytes[59], 255);
  assert.strictEqual(bytes[60], 255);
});

test('encodes 10-byte dirLabel string into the direction header', () => {
  // "MANHATTAN" is 9 chars, so byte 9 should be 0 (null-padded)
  const arr = [{ line: 'Q', color: [0, 0, 0], directions: [{ label: 'MANHATTAN', dest: 'Coney Island', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  // dirLabel field starts at DIR_LABEL (82)
  const label = 'MANHATTAN';
  for (let i = 0; i < label.length; i++) {
    assert.strictEqual(bytes[DIR_LABEL + i], label.charCodeAt(i), `char ${i}`);
  }
  // remaining bytes up to 10 must be zero
  for (let i = label.length; i < 10; i++) {
    assert.strictEqual(bytes[DIR_LABEL + i], 0, `pad byte ${i}`);
  }
});

test('empty direction label encodes as 10 zero bytes', () => {
  const arr = [{ line: 'S', color: [0, 0, 0], directions: [{ label: '', dest: 'Franklin Av', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(bytes[DIR_LABEL + i], 0, `byte ${i}`);
  }
});

test('missing direction label encodes as 10 zero bytes', () => {
  const arr = [{ line: 'S', color: [0, 0, 0], directions: [{ dest: 'Franklin Av', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(bytes[DIR_LABEL + i], 0, `byte ${i}`);
  }
});

test('clamps deltas over 65535 and caps arrivals at 6', () => {
  const arr = [{ line: '6', color: [0, 0, 0], directions: [{ label: 'BRONX', dest: 'x', times: [1,2,3,4,5,6,7,8].map(n => 1000 + n*100000), exp: [] }] }];
  const bytes = encodeBundle('6', 'x', arr, 1000);
  assert.strictEqual(bytes[N_ARR], 6);                    // capped at 6
});

test('long suffixed name round-trips without truncation', () => {
  const name = 'Times Sq-42 St (1237ACENQRSW)';            // 29 chars
  const bytes = encodeBundle('127', name, [], 1000);
  let out = '';
  for (let i = 5; i < 5 + name.length; i++) out += String.fromCharCode(bytes[i]);
  assert.strictEqual(out, name);
});

test('encodes a per-arrival express bitmask after the deltas', () => {
  const arr = [{ line: '6', color: [0, 0, 0], directions: [{ label: 'BRONX', dest: 'd', times: [1100, 1200, 1300], exp: [false, true, false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  assert.strictEqual(bytes[N_ARR], 3);                    // three arrivals
  const EXP_MASK = DELTA0 + 3 * 2;                        // deltas occupy 2 bytes each
  assert.strictEqual(bytes[EXP_MASK], 0b010);            // only arrival index 1 is express
});

test('omitting the exp array yields an all-local (zero) mask', () => {
  const arr = [{ line: '6', color: [0, 0, 0], directions: [{ label: 'BRONX', dest: 'd', times: [1100, 1200] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  const EXP_MASK = DELTA0 + 2 * 2;
  assert.strictEqual(bytes[EXP_MASK], 0);
});

test('encodes a synthetic suspended line as nDirs=0 + notice', () => {
  const arr = [{ line: 'J', color: [1, 2, 3], directions: [], notice: 'No J trains' }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  const nDirsAt = 56 + 2 + 3;                 // header(56) + label(2) + rgb(3) = 61
  assert.strictEqual(bytes[nDirsAt], 0);      // nDirs == 0
  const nLenAt = nDirsAt + 1;                 // 62
  assert.strictEqual(bytes[nLenAt], 'No J trains'.length);
  let s = '';
  for (let i = nLenAt + 1; i < nLenAt + 1 + 'No J trains'.length; i++) s += String.fromCharCode(bytes[i]);
  assert.strictEqual(s, 'No J trains');
});

test('multi-direction line encodes second direction at correct offset', () => {
  // After first dir: dest(20)+dirLabel(10)+n(1)+deltas(2*1)+expMask(1) = 34 bytes
  const arr = [{ line: 'N', color: [10, 20, 30], directions: [
    { label: 'QUEENS',     dest: 'Astoria',     times: [1100], exp: [false] },
    { label: 'BROOKLYN',   dest: 'Coney Island', times: [1200], exp: [true]  }
  ]}];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  // Second dir label offset: DIR_LABEL + (20+10+1+2+1) = DIR_LABEL + 34
  const DIR_LABEL_2 = DIR_LABEL + 34;
  const label2 = 'BROOKLYN';
  for (let i = 0; i < label2.length; i++) {
    assert.strictEqual(bytes[DIR_LABEL_2 + i], label2.charCodeAt(i), `char ${i}`);
  }
  for (let i = label2.length; i < 10; i++) {
    assert.strictEqual(bytes[DIR_LABEL_2 + i], 0, `pad ${i}`);
  }
  // Second dir arrival count
  const N_ARR_2 = DIR_LABEL_2 + 10;
  assert.strictEqual(bytes[N_ARR_2], 1);
  // Second dir expMask: [true] => bit 0 set = 1
  const EXP_2 = N_ARR_2 + 1 + 2;
  assert.strictEqual(bytes[EXP_2], 1);
});

test('encodes a non-ASCII station name (middle dot) as valid UTF-8', () => {
  // "Jackson/Library · CTA" — the "·" (U+00B7) must encode as 0xC2 0xB7, not a
  // lone 0xB7 (invalid UTF-8 that makes the watch drop the whole footer).
  const bytes = encodeBundle('40070', 'Jackson/Library · CTA', [
    { line: 'Rd', color: [1, 2, 3], directions: [{ label: '', dest: 'X', times: [1000], exp: [false] }] }
  ], 1000);
  // station field is 39 bytes at offset 5 (version 1 + epoch 4). "Jackson/Library " = 16 bytes.
  assert.strictEqual(bytes[5 + 16], 0xc2);   // middle-dot lead byte
  assert.strictEqual(bytes[5 + 17], 0xb7);   // middle-dot continuation byte
});
