const test = require('node:test');
const assert = require('node:assert');
const { buildConfigHtml } = require('./config');

const DB = [
  { id: 'L16', name: 'DeKalb Av', lines: ['L'] },
  { id: 'R30', name: 'DeKalb Av', lines: ['B', 'Q', 'R'] },
  { id: '635', name: '14 St-Union Sq', lines: ['4', '5', '6'] },
];

function extractJson(html, varName) {
  const re = new RegExp('id="' + varName + '"[^>]*>([\\s\\S]*?)<\\/script>');
  const m = html.match(re);
  assert.ok(m, 'embedded ' + varName + ' script found');
  return JSON.parse(m[1]);
}

test('embeds the full station DB', () => {
  const html = buildConfigHtml(0, [], DB);
  const db = extractJson(html, 'station-db');
  assert.strictEqual(db.length, 3);
  assert.strictEqual(db[0].id, 'L16');
});

test('embeds current favorites with labels and nearestPos', () => {
  const favs = [{ id: 'L16', name: 'DeKalb Av (L)', label: 'Home' }];
  const html = buildConfigHtml(2, favs, DB);
  const state = extractJson(html, 'init-state');
  assert.strictEqual(state.nearestPos, 2);
  assert.deepStrictEqual(state.favs, favs);
});

test('produces a complete HTML document', () => {
  const html = buildConfigHtml(255, [], DB);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<\/html>\s*$/);
});
