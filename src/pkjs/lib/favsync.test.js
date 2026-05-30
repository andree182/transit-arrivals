const test = require('node:test');
const assert = require('node:assert');
const { encodeFavList, decodeFavList } = require('./favsync');

test('round-trips a list with labels and empty labels', () => {
  const favs = [
    { id: 'L16', name: 'DeKalb Av (L)', label: 'Home' },
    { id: 'R30', name: 'DeKalb Av (BQR)', label: '' },
  ];
  const out = decodeFavList(encodeFavList(0, favs));
  assert.strictEqual(out.nearestPos, 0);
  assert.deepStrictEqual(out.favs, favs);
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
  assert.strictEqual(out.favs[0].id.length, 15);
  assert.strictEqual(out.favs[0].name.length, 47);
  assert.strictEqual(out.favs[0].label.length, 23);
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
  const bytes = Array.prototype.slice.call(encodeFavList(0, [{ id: 'A', name: 'Alpha', label: 'Home' }]));
  const out = decodeFavList(bytes);
  assert.deepStrictEqual(out.favs, [{ id: 'A', name: 'Alpha', label: 'Home' }]);
});
