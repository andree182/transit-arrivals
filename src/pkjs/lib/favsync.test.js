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

test('accepts a plain number array (AppMessage payload form)', () => {
  const bytes = Array.prototype.slice.call(encodeFavList(0, [{ id: 'A', name: 'Alpha', label: 'Home' }]));
  const out = decodeFavList(bytes);
  assert.deepStrictEqual(out.favs, [{ id: 'A', name: 'Alpha', label: 'Home' }]);
});
