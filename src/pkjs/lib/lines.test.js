const { test } = require('node:test');
const assert = require('node:assert');
const { feedForLine, colorForLine, feedUrls } = require('./lines');

test('lines map to their GTFS-RT feed group', () => {
  assert.strictEqual(feedForLine('A'), 'ace');
  assert.strictEqual(feedForLine('N'), 'nqrw');
  assert.strictEqual(feedForLine('6'), '123456');
  assert.strictEqual(feedForLine('L'), 'l');
});

test('feedUrls dedupes a station spanning multiple groups', () => {
  const urls = feedUrls(['N', 'L', 'Q']); // nqrw + l
  assert.strictEqual(urls.length, 2);
});

test('colorForLine returns an [r,g,b] triple', () => {
  const c = colorForLine('N'); // yellow
  assert.deepStrictEqual(c, [252, 204, 10]);
});
