import { expect, test } from 'vitest';
import { FeedCacheCore } from '../src/feedcache.js';

function makeFetch(seq) {
  // seq: array of {ok, status, body:Uint8Array} | Error; each call shifts one.
  let i = 0;
  return async () => {
    const r = seq[Math.min(i++, seq.length - 1)];
    if (r instanceof Error) throw r;
    return { ok: r.ok, status: r.status, arrayBuffer: async () => r.body.buffer };
  };
}
const bytes = (n) => new Uint8Array([n]);

test('fresh hit returns cached bytes without re-fetching', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, arrayBuffer: async () => bytes(1).buffer }; };
  let t = 0;
  const c = new FeedCacheCore(fetchImpl, () => t);
  const a = await c.get('u', 'k', 25);
  t = 10000;                       // 10s < 25s ttl
  const b = await c.get('u', 'k', 25);
  expect(calls).toBe(1);
  expect(Array.from(b.bytes)).toEqual([1]);
  expect(b.stale).toBe(false);
});

test('stale window triggers a refresh', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, arrayBuffer: async () => bytes(calls).buffer }; };
  let t = 0;
  const c = new FeedCacheCore(fetchImpl, () => t);
  await c.get('u', 'k', 25);
  t = 26000;                       // > 25s ttl
  const b = await c.get('u', 'k', 25);
  expect(calls).toBe(2);
  expect(Array.from(b.bytes)).toEqual([2]);
});

test('429 serves last-good bytes flagged stale', async () => {
  const c = new FeedCacheCore(makeFetch([
    { ok: true, status: 200, body: bytes(7) },
    { ok: false, status: 429, body: bytes(0) },
  ]), (() => { let t = 0; return () => (t += 26000); })());
  const first = await c.get('u', 'k', 25);
  const second = await c.get('u', 'k', 25);   // clock advanced 26s -> stale -> refresh -> 429
  expect(Array.from(first.bytes)).toEqual([7]);
  expect(Array.from(second.bytes)).toEqual([7]);
  expect(second.stale).toBe(true);
});

test('error with no prior good copy propagates', async () => {
  const c = new FeedCacheCore(makeFetch([new Error('boom')]), () => 0);
  await expect(c.get('u', 'k', 25)).rejects.toThrow('boom');
});

test('concurrent callers coalesce to one fetch', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((res) => { release = res; });
  const fetchImpl = async () => { calls++; await gate; return { ok: true, status: 200, arrayBuffer: async () => bytes(9).buffer }; };
  const c = new FeedCacheCore(fetchImpl, () => 0);
  const p1 = c.get('u', 'k', 25);
  const p2 = c.get('u', 'k', 25);
  release();
  const [a, b] = await Promise.all([p1, p2]);
  expect(calls).toBe(1);
  expect(Array.from(a.bytes)).toEqual([9]);
  expect(Array.from(b.bytes)).toEqual([9]);
});
