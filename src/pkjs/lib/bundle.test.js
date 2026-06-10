const { test } = require('node:test');
const assert = require('node:assert');
const { encodeBundle } = require('./bundle');

// v8 header: version(1) + epoch(4) + station(39) + id(39) + lineCount(1) = 84.
// (v8 widened id 11 -> 39 so the longest real station id — SEPTA's
// "septa-richmond-st-westmoreland-st-loop", 38 bytes — and 4-mapid CTA
// complexes like Jackson/Library fit without truncation.)
// Per line: label(2) + rgb(3) + nDirs(1) + sched(1) = 7, then per dir: dest(20) +
// dirLabel(10) + nArr(1) + deltas(2*nArr) + expMask(1).
// So for the first line/first dir:
const HEADER     = 84;
const LINE_COUNT = HEADER - 1;                       // 83
const DIR_LABEL  = HEADER + 2 + 3 + 1 + 1 + 20;      // 111  (10-byte null-padded label string; +1 for sched byte)
const N_ARR      = DIR_LABEL + 10;                   // 121
const DELTA0     = N_ARR + 1;                        // 122

test('encodes header, station, id, and one line/dir/arrival', () => {
  const arr = [{ line: 'N', color: [252, 204, 10], directions: [{ label: 'QUEENS', dest: 'Astoria-Ditmars Blvd', times: [1060, 1300], exp: [false, false] }] }];
  const bytes = encodeBundle('R01', 'Astoria-Ditmars Blvd', arr, 1000);
  assert.strictEqual(bytes[0], 8);                        // version
  assert.strictEqual(bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] * 16777216), 1000);
  assert.strictEqual(bytes[LINE_COUNT], 1);               // lineCount
  assert.strictEqual(bytes[DELTA0] | (bytes[DELTA0 + 1] << 8), 60);  // 1060-1000
});

test('version byte is 8', () => {
  const bytes = encodeBundle('x', 'y', [], 1000);
  assert.strictEqual(bytes[0], 8);
});

test('v8: the longest real ids round-trip without truncation', () => {
  // Jackson/Library is "40070,40560,40850" (17 bytes); the v7 11-byte field
  // truncated it and broke favorites + the worker's mapid validation.
  const ids = ['40070,40560,40850', 'septa-richmond-st-westmoreland-st-loop'];
  ids.forEach((id) => {
    const bytes = encodeBundle(id, 'X', [], 1000);
    let out = '';
    for (let i = 44; i < 44 + id.length; i++) out += String.fromCharCode(bytes[i]);  // id field at 5+39
    assert.strictEqual(out, id);
    for (let i = 44 + id.length; i < 44 + 39; i++) assert.strictEqual(bytes[i], 0, `pad byte ${i}`);
    assert.strictEqual(bytes[LINE_COUNT], 0);   // lineCount lands right after the 39-byte field
  });
});

test('rgb comes from ln.color, not a colorFn', () => {
  const arr = [{ line: 'Q', color: [252, 204, 10], directions: [{ label: 'MANHATTAN', dest: 'Coney Island', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  // RGB is at offset: header(84) + label(2) = 86
  assert.strictEqual(bytes[86], 252);
  assert.strictEqual(bytes[87], 204);
  assert.strictEqual(bytes[88], 10);
});

test('missing ln.color defaults to white [255,255,255]', () => {
  const arr = [{ line: 'Q', directions: [{ label: 'MANHATTAN', dest: 'Coney Island', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
  assert.strictEqual(bytes[86], 255);
  assert.strictEqual(bytes[87], 255);
  assert.strictEqual(bytes[88], 255);
});

test('encodes 10-byte dirLabel string into the direction header', () => {
  // "MANHATTAN" is 9 chars, so byte 9 should be 0 (null-padded)
  const arr = [{ line: 'Q', color: [0, 0, 0], directions: [{ label: 'MANHATTAN', dest: 'Coney Island', times: [1100], exp: [false] }] }];
  const bytes = encodeBundle('x', 'y', arr, 1000);
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
  const nDirsAt = HEADER + 2 + 3;             // header(84) + label(2) + rgb(3) = 89
  assert.strictEqual(bytes[nDirsAt], 0);      // nDirs == 0
  assert.strictEqual(bytes[nDirsAt + 1], 0);  // sched == 0 (no schedules for suspended line)
  const nLenAt = nDirsAt + 2;                 // nDirs + sched + notice-len
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

test('encodeBundle carries notice for a directions:[] line (El/BSL path)', () => {
  const epoch = 1781028000;
  const lines = [{ line: 'L', color: [0, 124, 196], directions: [],
                   notice: "No live arrivals - SEPTA doesn't publish them" }];
  const buf = encodeBundle('septa-8th-market', '8th & Market', lines, epoch);
  // Decode just enough to find the line block: skip version(1)+epoch(4)+name(39)+id(23)+count(1)
  let p = 1 + 4 + 39 + 39 + 1;
  // line label (2) + color (3) + dirCount (1)
  const label = String.fromCharCode(buf[p], buf[p + 1]).replace(/\0/g, '');
  assert.strictEqual(label, 'L');
  p += 2 + 3;
  assert.strictEqual(buf[p], 0);            // directions length 0
  p += 1;
  p += 1;                                   // skip sched byte
  const n = buf[p]; p += 1;                 // notice length
  assert.ok(n > 0, 'notice length must be > 0');
  const bytes = Array.from(buf.slice(p, p + n));
  const decoded = Buffer.from(bytes).toString('latin1');
  assert.strictEqual(decoded, "No live arrivals - SEPTA doesn't publish them", 'notice round-trips exactly');
});

test('notice/reason encodes as UTF-8 (non-ASCII alert text does not garble)', () => {
  // A live suspension reason with an em-dash (U+2014) and accented char must
  // survive as UTF-8 — the byte-length prefix counts BYTES, and the watch reads
  // the buffer as UTF-8. (Latin-1 truncation would emit a lone 0x14 / 0xE9.)
  const epoch = 1781028000;
  const reason = 'Delays — Café stop closed';
  const lines = [{ line: 'Rd', color: [1, 2, 3], directions: [], notice: reason }];
  const buf = encodeBundle('x', 'X', lines, epoch);
  let p = 1 + 4 + 39 + 39 + 1 + 2 + 3;        // → dirCount
  assert.strictEqual(buf[p], 0); p += 1;       // directions length 0
  p += 1;                                      // skip sched byte
  const n = buf[p]; p += 1;                    // notice BYTE length
  const bytes = Buffer.from(Array.from(buf.slice(p, p + n)));
  assert.strictEqual(n, Buffer.byteLength(reason, 'utf8'), 'length prefix is the UTF-8 byte count');
  assert.strictEqual(bytes.toString('utf8'), reason, 'round-trips as UTF-8');
  assert.ok(bytes.includes(0xE2) && bytes.includes(0x94), 'em-dash present as UTF-8 (E2 80 94), not truncated to 0x14');
});

test('each line carries a sched flag byte (v7+)', () => {
  const buf = encodeBundle('s1', 'Station', [
    { line: 'PA', color: [1, 2, 3], sched: true,
      directions: [{ dest: 'Philadelphia', label: '', times: [100], exp: [false] }] }
  ], 0);
  assert.strictEqual(buf[0], 8);            // version
  // header = 84 bytes; line starts at 84: label(2)+rgb(3)=5 -> [89]=nDirs, [90]=sched
  assert.strictEqual(buf[HEADER + 5], 1);   // nDirs == 1
  assert.strictEqual(buf[HEADER + 6], 1);   // sched == 1
});

test('sched defaults to 0 for normal lines', () => {
  const buf = encodeBundle('s1', 'Station', [
    { line: '1', color: [1, 2, 3], directions: [{ dest: 'X', label: '', times: [100], exp: [false] }] }
  ], 0);
  assert.strictEqual(buf[HEADER + 6], 0);   // sched == 0
});
