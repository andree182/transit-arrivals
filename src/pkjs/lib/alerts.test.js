const test = require('node:test');
const assert = require('node:assert');
const { extractAlerts } = require('./alerts');

const NOW = 1000000;

function feed(entities) { return { entity: entities }; }
function alert(routes, text, period) {
  return {
    alert: {
      active_period: period,
      informed_entity: routes.map(function (r) { return { route_id: r }; }),
      header_text: { translation: [{ language: 'en', text: text }] },
    },
  };
}

test('includes an active alert whose route matches a watched line', () => {
  const f = feed([alert(['Q', 'B'], 'Q trains delayed', [{ start: NOW - 10, end: NOW + 10 }])]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['Q trains delayed']);
});

test('excludes an alert whose routes do not match', () => {
  const f = feed([alert(['A'], 'A trains delayed', [{ start: NOW - 10, end: NOW + 10 }])]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), []);
});

test('excludes an alert whose active period has ended', () => {
  const f = feed([alert(['Q'], 'old news', [{ start: NOW - 100, end: NOW - 10 }])]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), []);
});

test('treats an alert with no active_period as currently active', () => {
  const f = feed([alert(['Q'], 'always on', undefined)]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['always on']);
});

test('honors an open-ended active period (no end)', () => {
  const f = feed([alert(['Q'], 'ongoing', [{ start: NOW - 10 }])]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['ongoing']);
});

test('skips malformed entities without throwing', () => {
  const f = feed([
    {},
    { alert: {} },
    { alert: { informed_entity: [{ route_id: 'Q' }] } }, // no header_text
    alert(['Q'], 'good one', undefined),
  ]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['good one']);
});

test('prefers the plain en translation over en-html', () => {
  const f = feed([{
    alert: {
      informed_entity: [{ route_id: 'Q' }],
      header_text: { translation: [
        { language: 'en-html', text: '<b>html</b>' },
        { language: 'en', text: 'plain text' },
      ] },
    },
  }]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['plain text']);
});

test('dedupes identical headlines and caps to three', () => {
  const f = feed([
    alert(['Q'], 'dup', undefined),
    alert(['Q'], 'dup', undefined),
    alert(['Q'], 'one', undefined),
    alert(['Q'], 'two', undefined),
    alert(['Q'], 'three', undefined),
    alert(['Q'], 'four', undefined),
  ]);
  const out = extractAlerts(f, ['Q'], NOW);
  assert.strictEqual(out.length, 3);
  assert.deepStrictEqual(out, ['dup', 'one', 'two']);
});

test('truncates an over-long headline to 100 chars', () => {
  const long = 'x'.repeat(200);
  const out = extractAlerts(feed([alert(['Q'], long, undefined)]), ['Q'], NOW);
  assert.strictEqual(out[0].length, 100);
});

test('collapses internal whitespace and trims', () => {
  const f = feed([alert(['Q'], '  Q   line\n\n  has   issues  ', undefined)]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['Q line has issues']);
});

test('returns empty for a missing or malformed feed', () => {
  assert.deepStrictEqual(extractAlerts(null, ['Q'], NOW), []);
  assert.deepStrictEqual(extractAlerts({}, ['Q'], NOW), []);
});
