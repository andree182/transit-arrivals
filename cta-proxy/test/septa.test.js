import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ROUTE_MAP, RR_LABELS, naiveParse, transformRR, transformRT,
  elLines, mergeModels, transformAlerts
} from '../src/agencies/septa.js';
import { extractAlerts } from '../src/gtfsrt.js';

const NOW = 1781028000;  // arbitrary fixed epoch

const alBuf = new Uint8Array(readFileSync(
  fileURLToPath(new URL('./fixtures/septa-alerts.pb', import.meta.url))));

test('ROUTE_MAP maps metro letters with rgb colors', () => {
  expect(ROUTE_MAP.M1.label).toBe('M');
  expect(ROUTE_MAP.T3.label).toBe('T');
  expect(Array.isArray(ROUTE_MAP.B1.color)).toBe(true);
  expect(ROUTE_MAP.B1.color.length).toBe(3);
});

test('naiveParse subtracts two same-zone wall-clocks to a correct delta (DST-safe)', () => {
  const a = naiveParse('2026-06-09 14:25:00.000');
  const b = naiveParse('2026-06-09 14:16:00.000');
  expect(a - b).toBe(9 * 60);                       // 9 minutes, offset cancels
  expect(naiveParse('garbage')).toBeNull();
});

const RR_FIXTURE = {
  'Suburban Station Departures: June 9, 2026, 2:16 pm': [
    { Northbound: [
      { direction: 'N', line: 'West Trenton', destination: 'West Trenton',
        status: 'On Time', depart_time: '2026-06-09 14:25:00.000', sched_time: '2026-06-09 14:24:00.000' },
      { direction: 'N', line: 'West Trenton', destination: 'West Trenton',
        status: '12 min', depart_time: '2026-06-09 14:28:00.000', sched_time: '2026-06-09 14:28:00.000' }
    ] },
    { Southbound: [
      { direction: 'S', line: 'Airport', destination: 'Airport',
        status: 'On Time', depart_time: '2026-06-09 14:20:00.000', sched_time: '2026-06-09 14:20:00.000' }
    ] }
  ]
};

test('transformRR groups by RR line, splits N/S, uses naive delta for time', () => {
  const model = transformRR(RR_FIXTURE, NOW);
  const wt = model.find(l => l.line === 'WT');
  expect(wt.color).toEqual([26, 42, 90]);            // RR blue
  expect(wt.directions.length).toBe(1);              // both trains Northbound
  expect(wt.directions[0].label).toBe('');
  expect(wt.directions[0].dest).toBe('West Trenton');
  // key time = 14:16, first depart = 14:25 -> +9 min; second 14:28 -> +12 min
  expect(wt.directions[0].times).toEqual([NOW + 9 * 60, NOW + 12 * 60]);
  expect(wt.directions[0].exp).toEqual([false, false]);
  const ai = model.find(l => l.line === 'AI');
  expect(ai.directions[0].times).toEqual([NOW + 4 * 60]);   // 14:20 - 14:16 = 4 min
});

test('transformRR clamps past trains to now and handles empty/odd input', () => {
  expect(transformRR(null, NOW)).toEqual([]);
  expect(transformRR({}, NOW)).toEqual([]);
  const past = { 'X Departures: June 9, 2026, 2:30 pm': [
    { Northbound: [{ direction: 'N', line: 'Airport', destination: 'Airport',
      status: 'On Time', depart_time: '2026-06-09 14:25:00.000' }] } ] };
  expect(transformRR(past, NOW)[0].directions[0].times).toEqual([NOW]);  // depart < keytime -> 0
});

test('transformRT filters by rt stopids, labels by route, dest = terminal name', () => {
  // synthetic extractTripUpdates output
  const trips = [
    { routeId: 'M1', tripId: 't1', directionId: 0, stops: [
      { stopId: '1892', time: NOW + 300 },   // station stop (kept)
      { stopId: '1935', time: NOW + 900 } ]  // terminal
    },
    { routeId: 'M1', tripId: 't2', directionId: 1, stops: [
      { stopId: '1935', time: NOW + 120 },
      { stopId: '1892', time: NOW + 600 } ]  // station stop (kept), terminal is 1892
    },
    { routeId: '47', tripId: 'bus', directionId: 0, stops: [
      { stopId: '1892', time: NOW + 60 } ]   // bus route -> not in ROUTE_MAP -> dropped
    },
    { routeId: 'M1', tripId: 't3', directionId: 0, stops: [
      { stopId: '9999', time: NOW + 10 } ]   // does not touch station -> dropped
    }
  ];
  const station = { rt: ['1892'] };
  const stopNames = { '1935': 'Norristown TC', '1892': 'Bridgeport' };
  const model = transformRT(trips, station, stopNames, NOW);
  const m = model.find(l => l.line === 'M');
  expect(m.color).toEqual([124, 60, 168]);
  expect(m.directions.length).toBe(2);                  // dir 0 and dir 1
  const d0 = m.directions.find(d => d.dest === 'Norristown TC');
  expect(d0.times).toEqual([NOW + 300]);
  const d1 = m.directions.find(d => d.dest === 'Bridgeport');
  expect(d1.times).toEqual([NOW + 600]);
  expect(model.find(l => l.line === undefined)).toBeUndefined();   // bus excluded
});

test('transformRT returns [] for empty inputs', () => {
  expect(transformRT([], { rt: ['1'] }, {}, NOW)).toEqual([]);
  expect(transformRT(null, { rt: [] }, {}, NOW)).toEqual([]);
});

test('elLines emits notice lines with empty directions', () => {
  const out = elLines(['L', 'B']);
  expect(out.length).toBe(2);
  const l = out.find(x => x.line === 'L');
  expect(l.color).toEqual([0, 124, 196]);
  expect(l.directions).toEqual([]);
  expect(l.notice).toBe("No live arrivals - SEPTA doesn't publish them");
  expect(elLines([])).toEqual([]);
});

test('mergeModels concatenates and dedupes by label (first wins)', () => {
  const a = [{ line: 'M', color: [1, 1, 1], directions: [{ label: '', dest: 'x', times: [1], exp: [false] }] }];
  const b = [{ line: 'M', color: [2, 2, 2], directions: [] },
             { line: 'WT', color: [26, 42, 90], directions: [{ label: '', dest: 'y', times: [2], exp: [false] }] }];
  const out = mergeModels(a, b);
  expect(out.length).toBe(2);                          // M (from a) + WT
  expect(out.find(l => l.line === 'M').color).toEqual([1, 1, 1]);  // first wins
});

test('resolveModel merges rr + rt + el for a multi-mode hub', async () => {
  const entry = { rr: 'Suburban Station', rt: ['1892'], el: ['L'], routes: ['L1', 'M1'] };
  const stopNames = { '1935': 'Norristown TC' };
  const fetchers = {
    rr: async () => RR_FIXTURE,
    rt: async () => ([{ routeId: 'M1', tripId: 't', directionId: 0,
      stops: [{ stopId: '1892', time: NOW + 300 }, { stopId: '1935', time: NOW + 900 }] }]),
  };
  const { resolveModel } = await import('../src/agencies/septa.js');
  const model = await resolveModel(entry, fetchers, stopNames, NOW);
  expect(model.find(l => l.line === 'WT')).toBeTruthy();   // RR
  expect(model.find(l => l.line === 'M')).toBeTruthy();     // RT
  const el = model.find(l => l.line === 'L');              // El notice
  expect(el.directions).toEqual([]);
  expect(el.notice).toBe("No live arrivals - SEPTA doesn't publish them");
});

test('arrivals returns empty model for unknown slug', async () => {
  const { arrivals } = await import('../src/agencies/septa.js');
  const out = await arrivals({}, 'septa-nonexistent', NOW);
  expect(out).toEqual({ epoch: NOW, model: [] });
});

test('transformAlerts maps gtfs ids -> labels and filters by requested labels', () => {
  const out = transformAlerts(extractAlerts(alBuf), ['T', 'M']);
  expect(Array.isArray(out.alerts)).toBe(true);
  expect(out.alerts.length).toBeGreaterThan(0);     // T/M alerts present in live capture
  // suspensions only for NO_SERVICE (effect 1) or suspend/no-service header
  for (const s of out.suspensions) {
    expect(['T', 'M']).toContain(s.line);
    expect(Array.isArray(s.color)).toBe(true);
  }
});

test('transformAlerts excludes alerts touching only unrequested labels', () => {
  // synthetic: alert on L only, request M
  const synthetic = [{ routeIds: ['L1'], stopIds: [], header: 'El delays', effect: 4 }];
  const out = transformAlerts(synthetic, ['M']);
  expect(out.alerts.length).toBe(0);
  expect(out.suspensions.length).toBe(0);
});

test('transformAlerts marks NO_SERVICE (effect 1) as a suspension', () => {
  const synthetic = [{ routeIds: ['B1'], stopIds: [], header: 'Broad St shutdown', effect: 1 }];
  const out = transformAlerts(synthetic, ['B']);
  expect(out.alerts).toContain('Broad St shutdown');
  expect(out.suspensions).toEqual([{ line: 'B', color: [243, 135, 38], reason: 'Broad St shutdown' }]);
});
