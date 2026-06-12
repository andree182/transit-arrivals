import { expect, test } from 'vitest';
import { transform, transformAlerts, arrivals } from '../src/agencies/lametro.js';
const DATA = { stations: { UNION: ['u1'] }, names: { u1: 'Union Station', u2: '7th St/Metro Center' },
               routes: { '801': { label: 'A', color: [0, 114, 188] } } };
const NOW = 1000;
test('transform builds a model from trip updates', () => {
  const trips = [{ routeId: '801', tripId: 't', directionId: 0, stops: [{ stopId: 'u1', time: NOW + 240 }, { stopId: 'u2', time: NOW + 600 }] }];
  const { model } = transform(trips, 'UNION', DATA, NOW);
  expect(model[0].line).toBe('A');
  expect(model[0].directions[0].dest).toBe('7th St/Metro Center');
});
test('alerts filter to requested labels using the route map', () => {
  const rows = [{ routeIds: ['801'], stopIds: [], header: 'A Line: no service', effect: 1 }];
  const { suspensions } = transformAlerts(rows, ['A'], DATA.routes);
  expect(suspensions[0].line).toBe('A');
});
test('arrivals returns empty model when no key', async () => {
  const out = await arrivals({}, 'UNION', NOW);
  expect(out).toEqual({ epoch: NOW, model: [] });
});
