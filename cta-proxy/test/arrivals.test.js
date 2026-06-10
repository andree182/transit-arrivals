import { expect, test } from 'vitest';
import { transform as transformArrivals } from '../src/agencies/cta.js';
import fixture from './fixtures/ttarrivals-clark-lake.json';

const NOW = 1719853200;   // arbitrary response-time anchor; deltas come from arrT - prdt

test('groups by route and splits by trDr into directions', () => {
  const { model } = transformArrivals(fixture.ctatt, NOW);
  const blue = model.find(l => l.line === 'Bl');
  expect(blue.color).toEqual([0, 161, 222]);
  expect(blue.directions.length).toBe(2);                 // trDr 1 (O'Hare) and 5 (Forest Park)
  const ohare = blue.directions.find(d => d.dest === "O'Hare");
  expect(ohare.label).toBe('');
  expect(ohare.exp).toEqual([false, false]);
});

test('arrival time is now + (arrT - prdt) per Appendix D, not arrT - now', () => {
  const { model } = transformArrivals(fixture.ctatt, NOW);
  const ohare = model.find(l => l.line === 'Bl').directions.find(d => d.dest === "O'Hare");
  expect(ohare.times[0]).toBe(NOW + 180);   // 12:03 - 12:00 = 180s
  expect(ohare.times[1]).toBe(NOW + 600);   // 12:10 - 12:00 = 600s
});

test('isApp (Approaching/Due) yields an immediate arrival', () => {
  const { model } = transformArrivals(fixture.ctatt, NOW);
  const fp = model.find(l => l.line === 'Bl').directions.find(d => d.dest === 'Forest Park');
  expect(fp.times[0]).toBe(NOW);            // isApp=1 -> Due/now
});

test('times within a direction are ascending', () => {
  const { model } = transformArrivals(fixture.ctatt, NOW);
  const ohare = model.find(l => l.line === 'Bl').directions.find(d => d.dest === "O'Hare");
  expect(ohare.times[0]).toBeLessThan(ohare.times[1]);
});

test('emits epoch equal to the response-time anchor', () => {
  expect(transformArrivals(fixture.ctatt, NOW).epoch).toBe(NOW);
});

// Pebble color is 2 bits/channel (GColorFromRGB truncates each channel >> 6).
// CTA Red's GTFS value [198,12,48] truncated to (3,0,0) = the same bright #FF0000
// family as Orange's (3,1,0) #FF5500 — near-identical on a 24px disc. The sent
// colors must land at least two quantized steps apart so the bullet (the primary
// line identifier) stays unambiguous.
test('Red and Orange quantize to clearly distinct Pebble palette entries', async () => {
  const { ROUTE_MAP } = await import('../src/agencies/cta.js');
  const q = (c) => c.map((x) => x >> 6);
  const r = q(ROUTE_MAP.Red.color), o = q(ROUTE_MAP.Org.color);
  const dist = r.reduce((s, v, i) => s + Math.abs(v - o[i]), 0);
  expect(dist).toBeGreaterThanOrEqual(2);
});
