import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transform, transformAlerts, ROUTE_MAP } from '../src/agencies/marta.js';
import { extractAlerts } from '../src/gtfsrt.js';
import rows from './fixtures/marta-arrivals.json';
const NOW = 1719853200;

const alBuf = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/marta-alerts.pb', import.meta.url)))
);

test('filters by station, groups by line, splits by direction', () => {
  const { model, epoch } = transform(rows, 'FIVE POINTS STATION', NOW);
  expect(epoch).toBe(NOW);
  expect(model.length).toBe(1);                          // only BLUE at Five Points
  const blue = model[0];
  expect(blue.line).toBe('Bl'); expect(blue.color).toEqual([0, 102, 179]);
  expect(blue.directions.length).toBe(2);                // E + W
  const e = blue.directions.find(d => d.dest === 'Indian Creek');
  expect(e.times).toEqual([NOW + 120]); expect(e.label).toBe(''); expect(e.exp).toEqual([false]);
});
test('Boarding/Arriving -> now', () => {
  const { model } = transform(rows, 'FIVE POINTS STATION', NOW);
  const w = model[0].directions.find(d => d.dest === 'Hamilton E Holmes');
  expect(w.times).toEqual([NOW]);                        // Boarding -> now (ignores WAITING_SECONDS)
});
test('station match is case-insensitive', () => {
  const { model } = transform(rows, 'five points station', NOW);
  expect(model.length).toBe(1);
});
test('unknown station -> empty model', () => {
  expect(transform(rows, 'NOWHERE', NOW).model).toEqual([]);
});

test('transformAlerts surfaces a requested line and excludes others', () => {
  const rows = extractAlerts(alBuf);                 // [{routeIds:['26987'|'26986'], header, effect}]
  const { alerts, suspensions } = transformAlerts(rows, ['Rd', 'Gn']);
  // Red (26987) and Green (26986) are both requested -> both headers surface
  expect(alerts).toContain('Red Line single-tracking near Lindbergh');
  expect(alerts).toContain('Green Line: no service Vine City to Bankhead');
  // Green is NO_SERVICE (effect 1) -> a suspension carrying the Green color
  const susp = suspensions.find(s => s.line === 'Gn');
  expect(susp).toBeTruthy();
  expect(susp.color).toEqual([0, 169, 79]);
  expect(susp.reason).toBe('Green Line: no service Vine City to Bankhead');
  // Red is effect 8 (DETOUR) and header has no suspend/no-service text -> NOT a suspension
  expect(suspensions.find(s => s.line === 'Rd')).toBeUndefined();
});

test('transformAlerts excludes alerts for lines not requested', () => {
  const rows = extractAlerts(alBuf);
  const { alerts, suspensions } = transformAlerts(rows, ['Gd']);  // Gold requested; fixture has none
  expect(alerts).toEqual([]);
  expect(suspensions).toEqual([]);
});

test('transformAlerts maps both numeric ids and name strings, and detects text-based suspension', () => {
  const rows = [
    { routeIds: ['BLUE'], stopIds: [], header: 'Blue Line service suspended downtown', effect: 0 },
    { routeIds: ['26984'], stopIds: [], header: 'Blue Line minor delays', effect: 4 }
  ];
  const { alerts, suspensions } = transformAlerts(rows, ['Bl']);
  expect(alerts).toEqual([
    'Blue Line service suspended downtown',
    'Blue Line minor delays'
  ]);
  // First is a suspension by text match (/suspend/i) even though effect=0; second is not.
  expect(suspensions).toEqual([
    { line: 'Bl', color: [0, 102, 179], reason: 'Blue Line service suspended downtown' }
  ]);
});
