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

test('escapes a label that tries to break out of the script island', () => {
  const evil = '</script><img src=x onerror=alert(1)>';
  const html = buildConfigHtml(0, [{ id: 'A', name: 'N', label: evil }], DB);
  // The raw "</script>" must not appear inside the JSON island (it is escaped),
  // so the extractor's first-</script> match still captures the whole island...
  const state = extractJson(html, 'init-state');
  assert.strictEqual(state.favs[0].label, evil);   // ...and the label survives intact
  assert.ok(html.indexOf('<\\/script><img') >= 0, 'breakout sequence is escaped');
});

test('uses neutral multi-agency branding (not MTA-specific)', () => {
  const html = buildConfigHtml(0, [], DB);
  assert.match(html, /<header>Transit Favorites<\/header>/);
  assert.ok(html.indexOf('>MTA Favorites<') < 0, 'no MTA-specific header text');
});

test('embeds an agency->city/color map and a badge renderer', () => {
  const db = [
    { id: 'R16', name: 'Times Sq', lines: ['Q'], agency: 'mta' },
    { id: '40380', name: 'Clark/Lake', lines: ['Bl'], agency: 'cta' },
  ];
  const html = buildConfigHtml(0, [], db);
  assert.match(html, /AGENCY_META=/);
  assert.match(html, /CHI/); assert.match(html, /NYC/);
  assert.match(html, /function badgeEl\(/);
});

test('renders city filter chips derived from the DB', () => {
  const db = [
    { id: 'R16', name: 'A', lines: ['Q'], agency: 'mta' },
    { id: '40380', name: 'B', lines: ['Bl'], agency: 'cta' },
  ];
  const html = buildConfigHtml(0, [], db);
  assert.match(html, /id="chips"/);
  assert.match(html, /data-city/);
  assert.match(html, /function applyCity\(/);
  assert.match(html, /\.cb\{/);   // badge CSS present
});

test('produces a complete HTML document', () => {
  const html = buildConfigHtml(255, [], DB);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<\/html>\s*$/);
});
