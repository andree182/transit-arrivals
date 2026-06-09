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
