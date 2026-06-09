import { expect, test } from 'vitest';
import { transform, transformAlerts, ROUTE_MAP } from '../src/agencies/wmata.js';
import arr from './fixtures/wmata-arrivals.json';
import inc from './fixtures/wmata-incidents.json';
const NOW = 1719853200;

test('maps Trains to the resolved model, split by Group', () => {
  const { model, epoch } = transform(arr, NOW);
  expect(epoch).toBe(NOW);
  const red = model.find(l => l.line === 'Rd');
  expect(red.color).toEqual([186, 12, 47]);
  expect(red.directions.length).toBe(2);                 // Group 1 + 2
  const g1 = red.directions.find(d => d.dest === 'Glenmont');
  expect(g1.label).toBe(''); expect(g1.exp).toEqual([false, false]);
  expect(g1.times).toEqual([NOW + 180, NOW + 480]);      // 3 and 8 minutes
});
test('BRD/ARR -> now; --- dropped', () => {
  const { model } = transform(arr, NOW);
  const red = model.find(l => l.line === 'Rd');
  const g2 = red.directions.find(d => d.dest === 'Shady Grove');
  expect(g2.times).toEqual([NOW]);                       // BRD -> now
  const sv = model.find(l => l.line === 'Sv');
  expect(sv).toBeUndefined();                            // only train was '---' -> dropped -> route gone
});
test('alerts filter by line; suspensions carry color', () => {
  const out = transformAlerts(inc, ['Rd', 'Bl']);
  expect(out.alerts.some(a => /Red Line/.test(a))).toBe(true);
  const s = out.suspensions.find(s => s.line === 'Bl');
  expect(s && s.color).toEqual([0, 156, 222]);           // Blue suspended
});
test('alert affecting only unrequested lines is excluded', () => {
  const out = transformAlerts(inc, ['Rd']);
  expect(out.alerts.some(a => /single tracking/.test(a))).toBe(true);   // RD requested
  expect(out.suspensions.length).toBe(0);                // BL/OR suspension not requested
});
