import { expect, test } from 'vitest';
import worker from '../src/index.js';
import * as workerNs from '../src/index.js';

test('worker module re-exports the FeedCache durable object class', () => {
  expect(typeof workerNs.FeedCache).toBe('function');
});

test('router dispatches /septa/arrivals (unknown slug -> empty model, 200)', async () => {
  const req = new Request('https://x/septa/arrivals?station=septa-nonexistent');
  const res = await worker.fetch(req, {}, { waitUntil() {} });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.model)).toBe(true);
});
