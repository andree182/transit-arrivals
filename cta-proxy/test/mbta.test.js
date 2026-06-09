import { expect, test } from 'vitest';
import { transform, transformAlerts, ROUTE_MAP } from '../src/agencies/mbta.js';

const NOW = 1749481200; // 2025-06-09T15:00:00Z, well before the fixture times

// Inline JSON:API fixture exercising: Green-branch collapse to one Gn line with
// correct per-branch dest from direction_destinations; arrival_time ?? departure_time
// fallback; CANCELLED dropped; direction split; color mapping; Mattapan its own line.
const PRED = {
  data: [
    // Green-B inbound (direction 0) — arrival present
    { type: 'prediction',
      attributes: { arrival_time: '2025-06-09T15:05:00-04:00', departure_time: null, direction_id: 0, schedule_relationship: null },
      relationships: { route: { data: { id: 'Green-B' } } } },
    // Green-C inbound (direction 0) — arrival present, later
    { type: 'prediction',
      attributes: { arrival_time: '2025-06-09T15:08:00-04:00', departure_time: null, direction_id: 0, schedule_relationship: null },
      relationships: { route: { data: { id: 'Green-C' } } } },
    // Green-D outbound (direction 1) — terminal: arrival null, departure present
    { type: 'prediction',
      attributes: { arrival_time: null, departure_time: '2025-06-09T15:10:00-04:00', direction_id: 1, schedule_relationship: null },
      relationships: { route: { data: { id: 'Green-D' } } } },
    // Red inbound — CANCELLED, must be dropped
    { type: 'prediction',
      attributes: { arrival_time: '2025-06-09T15:06:00-04:00', departure_time: null, direction_id: 0, schedule_relationship: 'CANCELLED' },
      relationships: { route: { data: { id: 'Red' } } } },
    // Red inbound — valid
    { type: 'prediction',
      attributes: { arrival_time: '2025-06-09T15:07:00-04:00', departure_time: null, direction_id: 0, schedule_relationship: null },
      relationships: { route: { data: { id: 'Red' } } } },
    // Mattapan outbound — its own line
    { type: 'prediction',
      attributes: { arrival_time: '2025-06-09T15:12:00-04:00', departure_time: null, direction_id: 1, schedule_relationship: null },
      relationships: { route: { data: { id: 'Mattapan' } } } }
  ],
  included: [
    { type: 'route', id: 'Green-B', attributes: { color: '00843D', direction_destinations: ['Government Center', 'Boston College'] } },
    { type: 'route', id: 'Green-C', attributes: { color: '00843D', direction_destinations: ['Government Center', 'Cleveland Circle'] } },
    { type: 'route', id: 'Green-D', attributes: { color: '00843D', direction_destinations: ['Government Center', 'Riverside'] } },
    { type: 'route', id: 'Red', attributes: { color: 'DA291C', direction_destinations: ['Ashmont/Braintree', 'Alewife'] } },
    { type: 'route', id: 'Mattapan', attributes: { color: 'DA291C', direction_destinations: ['Mattapan', 'Ashmont'] } }
  ]
};

test('collapses Green branches into one Gn line, keeps per-branch dest', () => {
  const { model, epoch } = transform(PRED, NOW);
  expect(epoch).toBe(NOW);
  const gn = model.find(l => l.line === 'Gn');
  expect(gn).toBeTruthy();
  expect(gn.color).toEqual([0, 132, 61]);
  // direction 0 (inbound) holds Green-B + Green-C times, sorted asc
  const inbound = gn.directions.find(d => d.dest === 'Government Center');
  expect(inbound).toBeTruthy();
  expect(inbound.label).toBe('');
  expect(inbound.times).toEqual([
    Math.floor(Date.parse('2025-06-09T15:05:00-04:00') / 1000),
    Math.floor(Date.parse('2025-06-09T15:08:00-04:00') / 1000)
  ]);
  expect(inbound.exp).toEqual([false, false]);
  // direction 1 (outbound) dest comes from Green-D's own direction_destinations[1]
  const outbound = gn.directions.find(d => d.dest === 'Riverside');
  expect(outbound).toBeTruthy();
  // arrival_time null -> falls back to departure_time
  expect(outbound.times).toEqual([Math.floor(Date.parse('2025-06-09T15:10:00-04:00') / 1000)]);
});

test('drops CANCELLED predictions', () => {
  const { model } = transform(PRED, NOW);
  const rd = model.find(l => l.line === 'Rd');
  expect(rd.color).toEqual([218, 41, 28]);
  // only the one non-cancelled Red prediction survives; direction_id 0 -> 'Ashmont/Braintree'
  const dir = rd.directions.find(d => d.dest === 'Ashmont/Braintree');
  expect(dir.times).toEqual([Math.floor(Date.parse('2025-06-09T15:07:00-04:00') / 1000)]);
  // the 15:06 CANCELLED train is gone
  expect(dir.times.length).toBe(1);
});

test('Mattapan is its own line, red', () => {
  const { model } = transform(PRED, NOW);
  const m = model.find(l => l.line === 'M');
  expect(m).toBeTruthy();
  expect(m.color).toEqual([218, 41, 28]);
  expect(m.directions[0].dest).toBe('Ashmont'); // direction_destinations[1]
});

test('ROUTE_MAP has the five rail bases with correct labels', () => {
  expect(ROUTE_MAP.Red.label).toBe('Rd');
  expect(ROUTE_MAP.Green.label).toBe('Gn');
  expect(ROUTE_MAP.Mattapan.label).toBe('M');
  expect(ROUTE_MAP.Silver).toBeUndefined(); // buses excluded
});

// Task 2: transformAlerts tests

const ALERTS = {
  data: [
    // SHUTTLE on Green-D -> suspension on Gn, requested
    { type: 'alert',
      attributes: {
        short_header: 'Green Line D shuttle buses between Riverside and Fenway',
        effect: 'SHUTTLE',
        informed_entity: [{ route: 'Green-D', route_type: 0, stop: 'place-pktrm' }]
      } },
    // INFO alert on Red -> general alert, requested
    { type: 'alert',
      attributes: {
        short_header: 'Red Line trains running with delays',
        effect: 'DELAY',
        informed_entity: [{ route: 'Red', route_type: 1, stop: 'place-pktrm' }]
      } },
    // Alert on Blue -> NOT requested, excluded
    { type: 'alert',
      attributes: {
        short_header: 'Blue Line elevator outage',
        effect: 'ELEVATOR_CLOSURE',
        informed_entity: [{ route: 'Blue', route_type: 1, stop: 'place-state' }]
      } }
  ]
};

test('surfaces short_header for requested routes, maps Green-* -> Gn', () => {
  const out = transformAlerts(ALERTS, ['Rd', 'Gn']);
  expect(out.alerts).toContain('Green Line D shuttle buses between Riverside and Fenway');
  expect(out.alerts).toContain('Red Line trains running with delays');
});

test('synthesizes a suspension on SHUTTLE with the line color', () => {
  const out = transformAlerts(ALERTS, ['Gn']);
  const s = out.suspensions.find(s => s.line === 'Gn');
  expect(s).toBeTruthy();
  expect(s.color).toEqual([0, 132, 61]);
  expect(s.reason).toMatch(/shuttle/i);
});

test('excludes alerts for unrequested lines', () => {
  const out = transformAlerts(ALERTS, ['Rd', 'Gn']);
  expect(out.alerts.some(a => /Blue Line/.test(a))).toBe(false);
  expect(out.suspensions.some(s => s.line === 'Bl')).toBe(false);
});

// Task 3: arrivals/alerts wrappers test

test('arrivals/alerts are exported async functions', () => {
  // imported lazily so the file still parses if not yet defined
  return import('../src/agencies/mbta.js').then(m => {
    expect(typeof m.arrivals).toBe('function');
    expect(typeof m.alerts).toBe('function');
  });
});
