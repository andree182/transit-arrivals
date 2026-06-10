const test = require('node:test');
const assert = require('node:assert');
const { extractAlerts, extractSuspensions, clampBytes } = require('./alerts');

const NOW = 1000000;

test('clampBytes trims to a UTF-8 byte budget without splitting a character', () => {
  assert.strictEqual(clampBytes('abc', 10), 'abc');                  // under budget: unchanged
  const dashes = '—'.repeat(10);                                     // em-dash = 3 UTF-8 bytes
  const out = clampBytes(dashes, 10);                                // 10-byte budget: 3 whole dashes
  assert.strictEqual(out, '—'.repeat(3));
  assert.strictEqual(Buffer.byteLength(out, 'utf8'), 9);
  // ASCII + multibyte mix: never exceed the budget in BYTES (not chars).
  const mixed = clampBytes('ab—cd—ef', 7);                           // a b — c d = 2+3+2 = 7
  assert.ok(Buffer.byteLength(mixed, 'utf8') <= 7);
  assert.strictEqual(mixed, 'ab—cd');
});

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

test('matches a raw GTFS route_id against its display code (SI -> SIR, FS -> S)', () => {
  const si = feed([alert(['SI'], 'No SIR service', undefined)]);
  assert.deepStrictEqual(extractAlerts(si, ['SIR'], NOW), ['No SIR service']);
  const fs = feed([alert(['FS'], 'Franklin shuttle delays', undefined)]);
  assert.deepStrictEqual(extractAlerts(fs, ['S'], NOW), ['Franklin shuttle delays']);
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

test('truncates an over-long headline to 220 chars', () => {
  const long = 'x'.repeat(400);
  const out = extractAlerts(feed([alert(['Q'], long, undefined)]), ['Q'], NOW);
  assert.strictEqual(out[0].length, 220);
});

test('appends description_text to the header text', () => {
  const f = feed([{
    alert: {
      informed_entity: [{ route_id: 'Q' }],
      header_text: { translation: [{ language: 'en', text: 'Q suspended' }] },
      description_text: { translation: [{ language: 'en', text: 'Use the R instead' }] },
    },
  }]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['Q suspended — Use the R instead']);
});

test('caps the combined header+description at 220 chars', () => {
  const f = feed([{
    alert: {
      informed_entity: [{ route_id: 'Q' }],
      header_text: { translation: [{ language: 'en', text: 'h'.repeat(150) }] },
      description_text: { translation: [{ language: 'en', text: 'd'.repeat(150) }] },
    },
  }]);
  assert.strictEqual(extractAlerts(f, ['Q'], NOW)[0].length, 220);
});

test('collapses internal whitespace and trims', () => {
  const f = feed([alert(['Q'], '  Q   line\n\n  has   issues  ', undefined)]);
  assert.deepStrictEqual(extractAlerts(f, ['Q'], NOW), ['Q line has issues']);
});

test('returns empty for a missing or malformed feed', () => {
  assert.deepStrictEqual(extractAlerts(null, ['Q'], NOW), []);
  assert.deepStrictEqual(extractAlerts({}, ['Q'], NOW), []);
});

function susAlert(routes, atype, text, period) {
  return {
    alert: {
      active_period: period,
      informed_entity: routes.map(function (r) { return { route_id: r }; }),
      header_text: { translation: [{ language: 'en', text: text }] },
      'transit_realtime.mercury_alert': { alert_type: atype },
    },
  };
}

test('flags a full suspension for a watched line, normalized + reasoned', () => {
  const f = feed([susAlert(['J'], 'Planned - Suspended', 'No J trains in Manhattan', undefined)]);
  assert.deepStrictEqual(extractSuspensions(f, ['J'], NOW),
    [{ code: 'J', reason: 'No J trains in Manhattan' }]);
});

test('flags a No Scheduled Service alert', () => {
  const f = feed([susAlert(['G'], 'No Scheduled Service', 'No G service', undefined)]);
  assert.deepStrictEqual(extractSuspensions(f, ['G'], NOW), [{ code: 'G', reason: 'No G service' }]);
});

test('flags a partial suspension too', () => {
  const f = feed([susAlert(['4'], 'Planned - Part Suspended', 'No 4 in Brooklyn', undefined)]);
  assert.deepStrictEqual(extractSuspensions(f, ['4'], NOW), [{ code: '4', reason: 'No 4 in Brooklyn' }]);
});

test('ignores non-suspension alert types', () => {
  const f = feed([susAlert(['Q'], 'Delays', 'Q delayed', undefined)]);
  assert.deepStrictEqual(extractSuspensions(f, ['Q'], NOW), []);
});

test('excludes a suspension outside its active period', () => {
  const f = feed([susAlert(['J'], 'Planned - Suspended', 'old', [{ start: NOW - 100, end: NOW - 10 }])]);
  assert.deepStrictEqual(extractSuspensions(f, ['J'], NOW), []);
});

test('excludes a suspension for a line not at this station', () => {
  const f = feed([susAlert(['A'], 'Planned - Suspended', 'No A', undefined)]);
  assert.deepStrictEqual(extractSuspensions(f, ['Q'], NOW), []);
});

test('normalizes SI to SIR and FS to S when matching station lines', () => {
  const f = feed([
    susAlert(['SI'], 'Planned - Suspended', 'No SIR', undefined),
    susAlert(['FS'], 'No Scheduled Service', 'No Franklin shuttle', undefined),
  ]);
  assert.deepStrictEqual(extractSuspensions(f, ['SIR', 'S'], NOW),
    [{ code: 'SIR', reason: 'No SIR' }, { code: 'S', reason: 'No Franklin shuttle' }]);
});

test('a full suspension outranks a partial one for the same line', () => {
  const f = feed([
    susAlert(['J'], 'Planned - Part Suspended', 'partial', undefined),
    susAlert(['J'], 'Planned - Suspended', 'full', undefined),
  ]);
  assert.deepStrictEqual(extractSuspensions(f, ['J'], NOW), [{ code: 'J', reason: 'full' }]);
});

test('truncates a suspension reason to 80 chars', () => {
  const f = feed([susAlert(['J'], 'Planned - Suspended', 'y'.repeat(120), undefined)]);
  assert.strictEqual(extractSuspensions(f, ['J'], NOW)[0].reason.length, 80);
});

test('returns empty for a malformed feed', () => {
  assert.deepStrictEqual(extractSuspensions(null, ['J'], NOW), []);
  assert.deepStrictEqual(extractSuspensions({}, ['J'], NOW), []);
});
