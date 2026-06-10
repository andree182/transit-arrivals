const { test } = require('node:test');
const assert = require('node:assert');
const { feedForLine, colorForLine, feedUrls, feedGroups } = require('./lines');

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

test('an S station pulls both the base feed and the ace feed', () => {
  const urls = feedUrls(['S']); // 42 St shuttle (base) + Franklin/Rockaway (ace)
  assert.strictEqual(urls.length, 2);
  assert.ok(urls.some(u => /gtfs-ace$/.test(u)));
  assert.ok(urls.some(u => /nyct%2Fgtfs$/.test(u)));
});

test('colorForLine returns an [r,g,b] triple', () => {
  const c = colorForLine('N'); // yellow
  assert.deepStrictEqual(c, [252, 204, 10]);
});

test('PATH labels resolve to the single PATH feed url', () => {
  const urls = feedUrls(['NW', 'NH']);
  assert.strictEqual(urls.length, 1);
  assert.strictEqual(urls[0], 'https://path.transitdata.nyc/gtfsrt');
});

test('PATH labels carry their service colors', () => {
  assert.deepStrictEqual(colorForLine('NW'), [217, 58, 48]);   // red
  assert.deepStrictEqual(colorForLine('HW'), [101, 193, 0]);   // green
  assert.deepStrictEqual(colorForLine('JS'), [255, 153, 0]);   // orange
  assert.deepStrictEqual(colorForLine('NH'), [140, 60, 150]);  // purple
});

test('a PATH+subway mixed line list yields both feeds', () => {
  const urls = feedUrls(['NW', 'Q']); // path + nqrw
  assert.strictEqual(urls.length, 2);
});

test('feedGroups maps each feed to the lines it owns (for NO-DATA on failure)', () => {
  var groups = feedGroups(['1', '2', '3', 'F', 'M', 'L']);
  var byUrl = {};
  groups.forEach(function (g) { byUrl[g.url] = g.lines.slice().sort(); });
  // base feed owns 1/2/3; bdfm owns F/M; l owns L — three distinct feeds.
  var all = groups.map(function (g) { return g.lines.slice().sort().join(''); }).sort();
  assert.deepStrictEqual(all, ['123', 'FM', 'L']);
  assert.strictEqual(groups.length, 3);
});
