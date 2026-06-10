import { expect, test } from 'vitest';
import { arrivals, alerts } from '../src/agencies/trenurbano.js';
import DATA from '../src/agencies/trenurbano-schedule.json';
const NOON = Date.UTC(2026, 5, 9, 16, 0, 0) / 1000;   // 12:00 AST
test('alerts are empty (no feed)', async () => {
  expect(await alerts({}, ['TU'])).toEqual({ alerts: [], suspensions: [] });
});
test('unknown station -> empty model', async () => {
  expect((await arrivals({}, '__none__', NOON)).model).toEqual([]);
});
test('known station returns epoch and (if service runs) a sched line', async () => {
  const stationId = Object.keys(DATA.stops)[0];
  const out = await arrivals({}, stationId, NOON);
  expect(out.epoch).toBe(NOON);
  if (out.model.length) { expect(out.model[0].sched).toBe(true); expect(out.model[0].line).toBe('TU'); }
});
