import { expect, test } from 'vitest';
import { transformAlerts } from '../src/alerts.js';
import routes from './fixtures/routes.json';
import alerts from './fixtures/alerts.json';

test('returns route-level (ServiceType R) alert text filtered to requested labels', () => {
  const out = transformAlerts(routes, alerts, ['Bl']);   // Bl == Blue
  expect(out.alerts.some(a => /Blue Line/.test(a))).toBe(true);
  expect(out.alerts.some(a => /Brown/.test(a))).toBe(false);   // Br not requested
});

test('ignores station-only (ServiceType T) alerts with no requested route', () => {
  const out = transformAlerts(routes, alerts, ['Bl']);
  expect(out.alerts.some(a => /elevator/i.test(a))).toBe(false);   // Western elevator is T-only
});

test('detects a suspension from an alert Impact', () => {
  const out = transformAlerts(routes, alerts, ['Br']);
  expect(out.suspensions.filter(s => s.line === 'Br').length).toBe(1);   // deduped across alert + routes
});

test('detects a suspension from routes.aspx RouteStatus alone', () => {
  const out = transformAlerts(routes, alerts, ['Gr']);   // Green: suspended only via routes.aspx
  expect(out.suspensions).toEqual([{ line: 'Gr', reason: 'Service Suspended' }]);
});

test('no suspension for a route with only a planned reroute', () => {
  const out = transformAlerts(routes, alerts, ['Bl']);
  expect(out.suspensions).toEqual([]);
});
