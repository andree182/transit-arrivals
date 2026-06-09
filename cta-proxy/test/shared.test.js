import { expect, test, vi } from 'vitest';
import { fetchBuf } from '../src/shared.js';

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
