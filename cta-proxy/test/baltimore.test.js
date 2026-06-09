import { expect, test } from 'vitest';
import { transform, transformAlerts } from '../src/agencies/baltimore.js';
const DATA = { stations: { OWINGS: ['m1'] }, names: { m1: 'Owings Mills', m2: 'Johns Hopkins' },
               routes: { '11682': { label: 'M', color: [0, 128, 0] }, '11693': { label: 'LR', color: [0, 116, 153] } } };
const NOW = 1000;
test('merged trips from both feeds build one model', () => {
  const trips = [{ routeId: '11682', tripId: 'm', directionId: 0, stops: [{ stopId: 'm1', time: NOW + 300 }, { stopId: 'm2', time: NOW + 800 }] }];
  const { model } = transform(trips, 'OWINGS', DATA, NOW);
  expect(model[0].line).toBe('M');
  expect(model[0].directions[0].dest).toBe('Johns Hopkins');
});
test('alerts filter to requested labels using the route map', () => {
  const rows = [{ routeIds: ['11693'], stopIds: [], header: 'Light Rail: no service', effect: 1 }];
  const { suspensions } = transformAlerts(rows, ['LR'], DATA.routes);
  expect(suspensions[0].line).toBe('LR');
});
