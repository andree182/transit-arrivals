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
  assert.strictEqual(out.favs[0].id.length, 39);
  assert.strictEqual(out.favs[0].name.length, 47);
  assert.strictEqual(out.favs[0].label.length, 23);
});

test('the longest real station ids round-trip intact', () => {
  // The old 15-byte cap truncated CTA composites ("40070,40560,40850") and
  // SEPTA/MARTA name-based ids, breaking those favorites forever. The cap now
  // covers the longest id that actually exists (SEPTA, 38 bytes).
  const favs = [
    { id: '40070,40560,40850', name: 'Jackson/Library', label: '', agency: 'cta' },
    { id: 'septa-richmond-st-westmoreland-st-loop', name: 'Richmond-Westmoreland', label: '', agency: 'septa' },
    { id: 'HAMILTON E HOLMES STATION', name: 'H.E. Holmes', label: '', agency: 'marta' },
  ];
  const out = decodeFavList(encodeFavList(0, favs));
  assert.strictEqual(out.favs[0].id, '40070,40560,40850');
  assert.strictEqual(out.favs[1].id, 'septa-richmond-st-westmoreland-st-loop');
  assert.strictEqual(out.favs[2].id, 'HAMILTON E HOLMES STATION');
});

test('a worst-case favsync blob stays within the watch outbox budget', () => {
  // 10 favorites, every field at max: must fit the C side's static buffer and
  // the AppMessage outbox (1408 B) with framing headroom.
  const favs = [];
  for (var i = 0; i < 10; i++) favs.push({ id: 'X'.repeat(60), name: 'N'.repeat(80), label: 'L'.repeat(40), agency: 'trenurbano' });
  const blob = encodeFavList(0, favs);
  assert.ok(blob.length <= 1242, 'worst case is ' + blob.length + ' B, budget 1242');
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
