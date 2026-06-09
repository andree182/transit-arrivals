import { expect, test } from 'vitest';
import { transform, arrivals } from '../src/agencies/miami.js';
const DATA = { stations: { ALL: ['a'] }, names: { a: 'Dadeland', b: 'Palmetto' }, routes: { OR: { label: 'MR', color: [255, 128, 64] } } };
const NOW = 1000;
test('transform builds Metrorail model from trip updates', () => {
  const trips = [{ routeId: 'OR', tripId: 't', directionId: 0, stops: [{ stopId: 'a', time: NOW + 240 }, { stopId: 'b', time: NOW + 700 }] }];
  const { model } = transform(trips, 'ALL', DATA, NOW);
  expect(model[0].line).toBe('MR');
  expect(model[0].directions[0].dest).toBe('Palmetto');
});
test('arrivals returns empty model when no key', async () => {
  const out = await arrivals({}, 'ALL', NOW);   // env has no MIAMI_KEY
  expect(out).toEqual({ epoch: NOW, model: [] });
});
