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
  const routes = new Set(trips.map(t => t.routeId));
  // M1 (NHSL) or a trolley route should be present in a live capture
  expect([...routes].some(r => /^(M1|T[1-5]|G1|D[12])$/.test(r || ''))).toBe(true);
});
