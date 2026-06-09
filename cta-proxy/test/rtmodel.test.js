import { expect, test } from 'vitest';
import { buildModelFromTripUpdates, buildAlerts } from '../src/rtmodel.js';

const ROUTES = { '1': { label: 'Rd', color: [228, 0, 43] }, '2': { label: 'Bl', color: [0, 102, 179] } };
const NAMES = { s1: 'Downtown', s2: 'Airport', s3: 'Eastgate' };
const NOW = 1000;

test('groups by route label, splits by direction, dest = last stop of trip', () => {
  const trips = [
    { routeId: '1', tripId: 't1', directionId: 0, stops: [{ stopId: 's1', time: NOW + 120 }, { stopId: 's2', time: NOW + 600 }] },
    { routeId: '1', tripId: 't2', directionId: 1, stops: [{ stopId: 's2', time: NOW + 300 }, { stopId: 's1', time: NOW + 900 }] }
  ];
  const model = buildModelFromTripUpdates(trips, new Set(['s1']), ROUTES, NAMES, NOW);
  expect(model.length).toBe(1);
  expect(model[0].line).toBe('Rd');
  expect(model[0].color).toEqual([228, 0, 43]);
  expect(model[0].directions.length).toBe(2);
  const d0 = model[0].directions.find(d => d.dest === 'Airport');
  expect(d0.times).toEqual([NOW + 120]);
  expect(d0.exp).toEqual([false]);
});

test('drops past arrivals and unknown routes; caps to 6 sorted times', () => {
  const stops = [];
  for (let i = 6; i >= 0; i--) stops.push({ routeId: '1', tripId: 't' + i, directionId: 0, stops: [{ stopId: 's1', time: NOW + i * 60 }, { stopId: 's2', time: NOW + 999 }] });
  stops.push({ routeId: '1', tripId: 'past', directionId: 0, stops: [{ stopId: 's1', time: NOW - 60 }, { stopId: 's2', time: NOW }] });
  stops.push({ routeId: '9', tripId: 'bus', directionId: 0, stops: [{ stopId: 's1', time: NOW + 30 }] });
  const model = buildModelFromTripUpdates(stops, new Set(['s1']), ROUTES, NAMES, NOW);
  const d = model[0].directions[0];
  expect(d.times.length).toBe(6);
  expect(d.times[0]).toBe(NOW + 0 * 60);
  expect(d.times.every((t, i) => i === 0 || t > d.times[i - 1])).toBe(true);
});

test('buildAlerts surfaces requested labels and flags suspensions', () => {
  const rows = [
    { routeIds: ['1'], stopIds: [], header: 'Red Line single-tracking', effect: 8 },
    { routeIds: ['2'], stopIds: [], header: 'Blue Line: no service downtown', effect: 1 }
  ];
  const { alerts, suspensions } = buildAlerts(rows, ROUTES, ['Rd', 'Bl']);
  expect(alerts).toContain('Red Line single-tracking');
  expect(alerts).toContain('Blue Line: no service downtown');
  const s = suspensions.find(x => x.line === 'Bl');
  expect(s.color).toEqual([0, 102, 179]);
  expect(suspensions.find(x => x.line === 'Rd')).toBeUndefined();
});

test('buildAlerts excludes non-requested labels', () => {
  const rows = [{ routeIds: ['1'], stopIds: [], header: 'Red alert', effect: 0 }];
  expect(buildAlerts(rows, ROUTES, ['Bl'])).toEqual({ alerts: [], suspensions: [] });
});
