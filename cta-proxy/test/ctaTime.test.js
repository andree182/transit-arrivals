import { expect, test } from 'vitest';
import { ctaToEpoch } from '../src/ctaTime.js';

test('parses the CTA JSON ISO timestamp (CDT summer)', () => {
  // 2024-07-01T12:00:00 Chicago (CDT, UTC-5) = 1719853200
  expect(ctaToEpoch('2024-07-01T12:00:00')).toBe(1719853200);
});
test('parses the compact XML-style form too', () => {
  expect(ctaToEpoch('20240701 12:00:00')).toBe(1719853200);
});
test('parses a CST winter timestamp', () => {
  // 2024-01-01T12:00:00 Chicago (CST, UTC-6) = 1704132000
  expect(ctaToEpoch('2024-01-01T12:00:00')).toBe(1704132000);
});

// DST spring-forward: 2024-03-10 02:00 CST -> 03:00 CDT. A naive single-pass
// offset is an hour off in the 03:00-04:00 window; the refinement pass fixes it.
test('handles the spring-forward morning (CDT, after the 3am jump)', () => {
  // 2024-03-10T03:30:00 Chicago is CDT (UTC-5) -> 08:30 UTC
  expect(ctaToEpoch('2024-03-10T03:30:00')).toBe(Date.UTC(2024, 2, 10, 8, 30, 0) / 1000);
});
test('handles the pre-transition hour (CST, before the 2am jump)', () => {
  // 2024-03-10T01:30:00 Chicago is CST (UTC-6) -> 07:30 UTC
  expect(ctaToEpoch('2024-03-10T01:30:00')).toBe(Date.UTC(2024, 2, 10, 7, 30, 0) / 1000);
});
// Fall-back sanity: 2024-11-03 a 13:00 stamp is unambiguous CST.
test('handles a fall-back-day afternoon (CST)', () => {
  expect(ctaToEpoch('2024-11-03T13:00:00')).toBe(Date.UTC(2024, 10, 3, 19, 0, 0) / 1000);
});
