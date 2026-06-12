import { expect, test, vi } from 'vitest';
import { fetchBuf, fetchSwiftlyFeed } from '../src/shared.js';

test('fetchBuf returns a Uint8Array of the response body', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  global.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }));
  const out = await fetchBuf('https://example.test/feed.pb');
  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([1, 2, 3, 4]);
});

test('fetchBuf throws on non-ok response', async () => {
  global.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
  await expect(fetchBuf('https://example.test/feed.pb')).rejects.toThrow('upstream 503');
});

test('fetchSwiftlyFeed routes through the FEED_CACHE DO stub and returns bytes', async () => {
  let seen = null;
  const env = {
    FEED_CACHE: {
      idFromName(name) { return { name }; },
      get(id) {
        return {
          async fetch(_u, init) {
            seen = JSON.parse(init.body);
            return { ok: true, arrayBuffer: async () => new Uint8Array([5, 6]).buffer };
          }
        };
      }
    }
  };
  const out = await fetchSwiftlyFeed(env, 'https://feed/x', 'secret', 25);
  expect(seen).toEqual({ url: 'https://feed/x', key: 'secret', ttl: 25 });
  expect(Array.from(out)).toEqual([5, 6]);
});

test('fetchSwiftlyFeed throws when the DO returns a non-ok response', async () => {
  const env = { FEED_CACHE: { idFromName: () => ({}), get: () => ({ fetch: async () => ({ ok: false, status: 502 }) }) } };
  await expect(fetchSwiftlyFeed(env, 'u', 'k', 25)).rejects.toThrow('feedcache 502');
});
