import { expect, test } from 'vitest';
import { transformETD, transformRT, transformAlerts, ROUTE_MAP } from '../src/agencies/bart.js';

const NOW = 1781030000;

const ETD = { root: { station: [ {
  name: 'Montgomery St.', abbr: 'MONT',
  etd: [
    { destination: 'Antioch', abbreviation: 'ANTC', estimate: [
      { minutes: '7',  platform: '2', direction: 'North', length: '9', color: 'YELLOW', hexcolor: '#ffff33', cancelflag: '0' },
      { minutes: '27', platform: '2', direction: 'North', length: '9', color: 'YELLOW', hexcolor: '#ffff33', cancelflag: '0' } ] },
    { destination: 'Daly City', abbreviation: 'DALY', estimate: [
      { minutes: 'Leaving', platform: '1', direction: 'South', length: '8', color: 'GREEN', hexcolor: '#339933', cancelflag: '0' } ] },
    { destination: 'SFO', abbreviation: 'SFIA', estimate: [
      { minutes: '4', platform: '1', direction: 'South', length: '8', color: 'YELLOW', hexcolor: '#ffff33', cancelflag: '1' } ] }  // cancelled -> dropped
  ] } ] } };

test('transformETD groups by line color, splits direction, Leaving->now, drops cancelled', () => {
  const { epoch, model } = transformETD(ETD, NOW);
  expect(epoch).toBe(NOW);
  const yl = model.find(l => l.line === 'Yl');
  expect(yl.color).toEqual([255, 255, 51]);
  const north = yl.directions.find(d => d.dest === 'Antioch');
  expect(north.label).toBe('');
  expect(north.exp).toEqual([false, false]);
  expect(north.times).toEqual([NOW + 7 * 60, NOW + 27 * 60]);
  // the cancelled SFO/Yellow-South estimate was dropped, so Yellow has only the North bucket
  expect(yl.directions.length).toBe(1);
  const gn = model.find(l => l.line === 'Gn');
  expect(gn.directions[0].times).toEqual([NOW]);            // "Leaving" -> now
  expect(gn.directions[0].dest).toBe('Daly City');
});

test('transformRT colors/directions trips via the trip map, filtered to station stops', () => {
  // extractTripUpdates output shape: [{ tripId, stops:[{stopId,time}] }]
  const trips = [
    { tripId: 't-yellow-n', stops: [{ stopId: 'A70-1', time: NOW + 300 }, { stopId: 'A80-1', time: NOW + 600 }] },
    { tripId: 't-green-s',  stops: [{ stopId: 'A70-2', time: NOW + 120 }] },
    { tripId: 't-unknown',  stops: [{ stopId: 'A70-1', time: NOW + 90 }] }   // not in map -> skipped (stale)
  ];
  const tripMap = {
    't-yellow-n': { c: 'Yl', h: 'Antioch', d: 0 },
    't-green-s':  { c: 'Gn', h: 'Daly City', d: 1 }
  };
  const stopIds = new Set(['A70-1', 'A70-2']);   // MONT platforms
  const { model } = transformRT(trips, stopIds, tripMap, NOW);
  const yl = model.find(l => l.line === 'Yl');
  expect(yl.directions[0].dest).toBe('Antioch');
  expect(yl.directions[0].times).toEqual([NOW + 300]);     // only the MONT stop time
  const gn = model.find(l => l.line === 'Gn');
  expect(gn.directions[0].times).toEqual([NOW + 120]);
  expect(model.some(l => l.directions.some(d => d.times.includes(NOW + 90)))).toBe(false); // unknown trip dropped
});

const BSA = { root: { bsa: [
  { '@id': '1', type: 'EMERGENCY', sms_text: { '#cdata-section': 'No delays reported.' } },
  { '@id': '2', type: 'DELAY', sms_text: { '#cdata-section': 'Major delay: Antioch line service suspended near Bay Fair.' } }
] } };

test('transformAlerts uses sms_text, drops the no-delays sentinel, flags suspension', () => {
  const out = transformAlerts(BSA);
  expect(out.alerts.some(a => /Bay Fair/.test(a))).toBe(true);
  expect(out.alerts.some(a => /No delays/.test(a))).toBe(false);
  const s = out.suspensions.find(s => s.line === 'BART');
  expect(s && s.color).toEqual([176, 190, 199]);
});
