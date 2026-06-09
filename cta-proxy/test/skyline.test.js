import { expect, test } from 'vitest';
import { transform } from '../src/agencies/skyline.js';
const DATA = { stations: { KUALAKAI: ['k1'] }, names: { k1: 'Kualakai', k2: 'Halawa' }, routes: { '181': { label: 'SK', color: [0, 132, 169] } } };
const NOW = 1000;
test('Skyline model from TheBus trip updates', () => {
  const trips = [{ routeId: '181', tripId: 't', directionId: 0, stops: [{ stopId: 'k1', time: NOW + 360 }, { stopId: 'k2', time: NOW + 720 }] }];
  const { model } = transform(trips, 'KUALAKAI', DATA, NOW);
  expect(model[0].line).toBe('SK');
  expect(model[0].directions[0].dest).toBe('Halawa');
});
