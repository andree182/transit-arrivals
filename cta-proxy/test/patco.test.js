import { expect, test } from 'vitest';
import { arrivals, alerts } from '../src/agencies/patco.js';
import DATA from '../src/agencies/patco-schedule.json';

const NOON_TUE = Date.UTC(2026, 5, 9, 18, 0, 0) / 1000;

test('arrivals returns a sched model for a known station', async () => {
  const stationId = Object.keys(DATA.stops)[0];
  const out = await arrivals({}, stationId, NOON_TUE);
  expect(out.epoch).toBe(NOON_TUE);
  if (out.model.length) {
    expect(out.model[0].sched).toBe(true);
    expect(out.model[0].line).toBe('PA');
  }
});
test('alerts are empty (PATCO has no feed)', async () => {
  expect(await alerts({}, ['PA'])).toEqual({ alerts: [], suspensions: [] });
});
test('unknown station -> empty model', async () => {
  const out = await arrivals({}, '__none__', NOON_TUE);
  expect(out.model).toEqual([]);
});
