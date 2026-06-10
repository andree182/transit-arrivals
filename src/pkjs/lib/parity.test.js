// Cross-layer agency parity: the phone registry (agencies.js), the station DB
// tags (stations.js), the config-page chips (config.js AGENCY_META), and the
// Worker router (cta-proxy/src/index.js) are maintained by hand in two separate
// packages. A half-wired agency (the old lametro stub) slips through unless the
// four layers are asserted against each other.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const agencies = require('./agencies');
const stations = require('./stations');
const config = require('./config');

const REG = Object.keys(agencies._registry);

test('every station DB agency tag has a registry entry', () => {
  const tags = {};
  stations._db.forEach(function (s) { tags[s.agency] = true; });
  Object.keys(tags).forEach(function (a) {
    assert.ok(REG.indexOf(a) >= 0, 'station DB tag "' + a + '" missing from the agency registry');
  });
});

test('config AGENCY_META lists exactly the registry agencies (no dead chips)', () => {
  const html = config.buildConfigHtml(0, [], []);
  const m = html.match(/AGENCY_META=\{(.+?)\};/);
  assert.ok(m, 'AGENCY_META block found in the config page');
  const keys = [];
  m[1].replace(/(\w+):\{/g, function (_, k) { keys.push(k); return _; });
  assert.deepStrictEqual(keys.sort(), REG.slice().sort());
});

test('every proxied registry agency has a Worker route', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'cta-proxy', 'src', 'index.js'), 'utf8');
  const m = src.match(/const AGENCIES = \{([^}]*)\}/);
  assert.ok(m, 'AGENCIES map found in the Worker router');
  const workerKeys = m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  REG.forEach(function (a) {
    if (agencies.get(a).transport !== 'proxied') return;   // mta is fetched directly
    assert.ok(workerKeys.indexOf(a) >= 0, 'proxied agency "' + a + '" has no Worker route');
  });
  workerKeys.forEach(function (a) {
    assert.ok(REG.indexOf(a) >= 0, 'Worker route "' + a + '" has no phone registry entry');
  });
});
