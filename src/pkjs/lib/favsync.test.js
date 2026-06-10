const test = require('node:test');
const assert = require('node:assert');
const { encodeFavList, decodeFavList } = require('./favsync');

test('round-trips a list with labels, empty labels, and agency', () => {
  const favs = [
    { id: 'L16', name: 'DeKalb Av (L)', label: 'Home', agency: 'mta' },
    { id: 'R30', name: 'DeKalb Av (BQR)', label: '', agency: 'mta' },
  ];
  const out = decodeFavList(encodeFavList(0, favs));
  assert.strictEqual(out.nearestPos, 0);
  assert.deepStrictEqual(out.favs, favs);
});

test('round-trips agency so (agency,id) lookups survive (A02 wmata vs mta)', () => {
  const favs = [{ id: 'A02', name: 'Farragut North', label: '', agency: 'wmata' }];
  assert.strictEqual(decodeFavList(encodeFavList(0, favs)).favs[0].agency, 'wmata');
});

test('a legacy 3-field blob decodes with agency = "" (graceful)', () => {
  // Hand-build a pre-agency blob: [nearestPos, count, id(len+bytes), name(...), label(...)]
  const s = a => [a.length].concat(Array.prototype.map.call(a, c => c.charCodeAt(0)));
  const blob = [0, 1].concat(s('A')).concat(s('Alpha')).concat(s(''));
  const out = decodeFavList(blob);
  assert.deepStrictEqual(out.favs[0], { id: 'A', name: 'Alpha', label: '', agency: '' });
});

test('carries nearestPos 255 (off) and the empty list', () => {
  const out = decodeFavList(encodeFavList(255, []));
  assert.strictEqual(out.nearestPos, 255);
  assert.deepStrictEqual(out.favs, []);
});

test('preserves a mid-list nearestPos', () => {
  const favs = [
    { id: 'A', name: 'Alpha', label: '' },
    { id: 'B', name: 'Bravo', label: '' },
  ];
  assert.strictEqual(decodeFavList(encodeFavList(1, favs)).nearestPos, 1);
});

test('clamps over-long fields to the C buffer sizes', () => {
  const longId = 'X'.repeat(40);
  const longName = 'N'.repeat(80);
  const longLabel = 'L'.repeat(40);
  const out = decodeFavList(encodeFavList(0, [{ id: longId, name: longName, label: longLabel }]));
  assert.strictEqual(out.favs[0].id.length, 23);
  assert.strictEqual(out.favs[0].name.length, 47);
  assert.strictEqual(out.favs[0].label.length, 23);
});

test('a composite CTA id (4 mapids worst case = 23 bytes) round-trips intact', () => {
  // Jackson/Library is "40070,40560,40850" (17 bytes); the old 15-byte cap
  // truncated it to "40070,40560,408", breaking the favorite forever.
  const favs = [{ id: '40070,40560,40850', name: 'Jackson/Library', label: '', agency: 'cta' }];
  assert.strictEqual(decodeFavList(encodeFavList(0, favs)).favs[0].id, '40070,40560,40850');
  const worst = '40000,40001,40002,40003';   // 23 bytes: the regex-allowed maximum
  const out = decodeFavList(encodeFavList(0, [{ id: worst, name: 'X', label: '', agency: 'cta' }]));
  assert.strictEqual(out.favs[0].id, worst);
});

test('never splits a multibyte character at the field-length cap', () => {
  // Label cap is 23 bytes. 11 × 2-byte 'é' = 22 bytes; a 12th would need 24,
  // so it must be dropped whole rather than truncated to a lone lead byte.
  const label = 'é'.repeat(12);
  const out = decodeFavList(encodeFavList(0, [{ id: 'A', name: 'N', label: label }]));
  assert.strictEqual(out.favs[0].label, 'é'.repeat(11));
});

test('decodes truncated trailing bytes without reading past the field', () => {
  // A 3-byte char (€) right at the cap is dropped whole; the field stays valid.
  const out = decodeFavList(encodeFavList(0, [{ id: 'A', name: 'N', label: '€'.repeat(8) }]));
  // 7 × 3 = 21 bytes fit (≤23); the 8th would need 24, so 7 survive.
  assert.strictEqual(out.favs[0].label, '€'.repeat(7));
});

test('accepts a plain number array (AppMessage payload form)', () => {
  const bytes = Array.prototype.slice.call(encodeFavList(0, [{ id: 'A', name: 'Alpha', label: 'Home', agency: 'cta' }]));
  const out = decodeFavList(bytes);
  assert.deepStrictEqual(out.favs, [{ id: 'A', name: 'Alpha', label: 'Home', agency: 'cta' }]);
});
