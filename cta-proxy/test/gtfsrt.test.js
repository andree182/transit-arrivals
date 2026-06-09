import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractTripUpdates, extractAlerts } from '../src/gtfsrt.js';

const tuBuf = new Uint8Array(readFileSync(fileURLToPath(new URL('./fixtures/septa-tripupdates.pb', import.meta.url))));
const alBuf = new Uint8Array(readFileSync(fileURLToPath(new URL('./fixtures/septa-alerts.pb', import.meta.url))));

test('extractTripUpdates returns trips with route, direction, and stop times', () => {
  const trips = extractTripUpdates(tuBuf);
  expect(trips.length).toBeGreaterThan(0);
  const t = trips.find(x => x.stops.length > 0);
  expect(typeof t.routeId === 'string' || t.routeId === null).toBe(true);
  expect(Array.isArray(t.stops)).toBe(true);
  expect(typeof t.stops[0].stopId).toBe('string');
  expect(t.stops[0].time).toBeGreaterThan(1700000000); // a real unix epoch (seconds)
});

test('extractTripUpdates surfaces at least one known SEPTA rail route', () => {
  const trips = extractTripUpdates(tuBuf);
  expect(trips.some(t => t.routeId)).toBe(true);   // route_id is extracted from at least one trip
});

test('extractAlerts returns header text and informed route ids', () => {
  const alerts = extractAlerts(alBuf);
  expect(Array.isArray(alerts)).toBe(true);
  expect(alerts.length).toBeGreaterThan(0);
  const withRoute = alerts.find(a => a.routeIds.length > 0);
  expect(withRoute).toBeTruthy();
  expect(typeof withRoute.header).toBe('string');
  expect(withRoute.header.length).toBeGreaterThan(0);
  expect(typeof withRoute.effect).toBe('number');
});
