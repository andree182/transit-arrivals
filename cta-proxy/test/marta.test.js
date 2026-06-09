import { expect, test } from 'vitest';
import { transform, ROUTE_MAP } from '../src/agencies/marta.js';
import rows from './fixtures/marta-arrivals.json';
const NOW = 1719853200;

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
