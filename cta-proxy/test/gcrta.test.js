import { expect, test } from 'vitest';
import { transform, transformAlerts } from '../src/agencies/gcrta.js';

const ROUTES = { '1': { label: 'Rd', color: [228, 0, 43] } };
const NAMES = { a: 'Tower City', b: 'Airport' };
const STATIONS = { TC: ['a'] };
const NOW = 1000;

test('transform builds the model for a station id', () => {
  const trips = [{ routeId: '1', tripId: 't', directionId: 0, stops: [{ stopId: 'a', time: NOW + 180 }, { stopId: 'b', time: NOW + 600 }] }];
  const { epoch, model } = transform(trips, 'TC', { stations: STATIONS, names: NAMES, routes: ROUTES }, NOW);
  expect(epoch).toBe(NOW);
  expect(model[0].line).toBe('Rd');
  expect(model[0].directions[0].dest).toBe('Airport');
  expect(model[0].directions[0].times).toEqual([NOW + 180]);
});
test('unknown station -> empty model', () => {
  const out = transform([], 'NOPE', { stations: STATIONS, names: NAMES, routes: ROUTES }, NOW);
  expect(out.model).toEqual([]);
});
test('transformAlerts filters to requested labels', () => {
  const rows = [{ routeIds: ['1'], stopIds: [], header: 'Red Line: no service', effect: 1 }];
  const { suspensions } = transformAlerts(rows, ['Rd'], ROUTES);
  expect(suspensions[0].line).toBe('Rd');
});
