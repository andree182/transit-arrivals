import { expect, test } from 'vitest';
import { localParts, activeServices, nextDepartures } from '../src/schedule.js';

const NY = 'America/New_York';
const NOON_TUE = Date.UTC(2026, 5, 9, 18, 0, 0) / 1000;   // 2026-06-09 14:00 America/New_York

test('localParts derives agency-local date, weekday (0=Sun), sec-of-day, start-of-day', () => {
  const p = localParts(NOON_TUE, NY);
  expect(p.dateInt).toBe(20260609);
  expect(p.weekday).toBe(2);
  expect(p.secOfDay).toBe(14 * 3600);
  expect(p.startOfDayEpoch).toBe(NOON_TUE - 14 * 3600);
});

test('activeServices honors day-of-week, date range, and calendar_dates exceptions', () => {
  const cal = { WK: { days: [0,1,1,1,1,1,0], start: 20260101, end: 20261231 },
                SA: { days: [0,0,0,0,0,0,1], start: 20260101, end: 20261231 } };
  const exc = { WK: { 20260609: 2 }, SA: { 20260609: 1 } };
  expect([...activeServices(cal, {}, 20260609, 2)]).toEqual(['WK']);
  expect([...activeServices(cal, exc, 20260609, 2)].sort()).toEqual(['SA']);
});

test('nextDepartures returns a sched-flagged model with epoch times, per direction', () => {
  const data = {
    tz: NY, line: 'PA', color: [188, 0, 53], dirDest: { '0': 'Philadelphia', '1': 'Lindenwold' },
    calendar: { WK: { days: [0,1,1,1,1,1,0], start: 20260101, end: 20261231 } },
    exceptions: {},
    stops: { L: { '0': { WK: [14*3600 - 60, 14*3600 + 300, 14*3600 + 900] }, '1': { WK: [14*3600 + 600] } } }
  };
  const { epoch, model } = nextDepartures(data, 'L', NOON_TUE, 6);
  expect(epoch).toBe(NOON_TUE);
  expect(model.length).toBe(1);
  expect(model[0].line).toBe('PA');
  expect(model[0].sched).toBe(true);
  const d0 = model[0].directions.find(d => d.dest === 'Philadelphia');
  expect(d0.times).toEqual([NOON_TUE + 300, NOON_TUE + 900]);
  expect(d0.exp).toEqual([false, false]);
});

test('nextDepartures rolls into tomorrow when today is exhausted', () => {
  const data = {
    tz: NY, line: 'PA', color: [188, 0, 53], dirDest: { '0': 'Philadelphia' },
    calendar: { WK: { days: [0,1,1,1,1,1,0], start: 20260101, end: 20261231 } },
    exceptions: {},
    stops: { L: { '0': { WK: [5 * 3600] } } }
  };
  const { model } = nextDepartures(data, 'L', NOON_TUE, 6);
  const startTomorrow = (NOON_TUE - 14 * 3600) + 86400;
  expect(model[0].directions[0].times).toEqual([startTomorrow + 5 * 3600]);
});

test('unknown station -> empty model', () => {
  const data = { tz: NY, line: 'PA', color: [0,0,0], dirDest: {}, calendar: {}, exceptions: {}, stops: {} };
  expect(nextDepartures(data, 'NOPE', NOON_TUE).model).toEqual([]);
});
