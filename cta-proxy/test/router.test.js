import { expect, test, beforeEach, vi } from 'vitest';
import worker from '../src/index.js';

const ctx = { waitUntil() {} };
beforeEach(() => {
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
});
function call(path, env = { CTA_KEY: 'x' }) {
  return worker.fetch(new Request('https://w.dev' + path), env, ctx);
}

test('/health returns ok', async () => {
  const r = await call('/health'); expect(await r.text()).toBe('ok');
});
test('accepts legacy ?mapid= for cta arrivals (backwards compat)', async () => {
  // stub fetch so the cta resolver gets a well-formed empty CTA payload
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ctatt: { errCd: '0', eta: [] } }), { status: 200 }));
  const r = await call('/cta/arrivals?mapid=40380');
  const body = await r.json();
  expect(body).toHaveProperty('model');           // not {error:'missing station'}
  expect(body.error).toBeUndefined();
});
test('accepts ?station= for cta arrivals', async () => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ctatt: { errCd: '0', eta: [] } }), { status: 200 }));
  const r = await call('/cta/arrivals?station=40380');
  const body = await r.json();
  expect(body.error).toBeUndefined();
});
test('missing station -> error', async () => {
  const r = await call('/cta/arrivals');
  expect((await r.json()).error).toMatch(/missing station/);
});
test('unknown agency -> error', async () => {
  const r = await call('/foo/arrivals?station=1');
  expect((await r.json()).error).toMatch(/unknown agency/);
});
test('upstream failure degrades to empty model (not 500)', async () => {
  globalThis.fetch = vi.fn(async () => { throw new Error('network'); });
  const r = await call('/cta/arrivals?station=40380');
  expect(r.status).toBe(200);
  expect((await r.json())).toEqual(expect.objectContaining({ model: [] }));
});
test('accepts comma-joined mapid complex (Jackson/Library) as station param', async () => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ctatt: { errCd: '0', eta: [] } }), { status: 200 }));
  const r = await call('/cta/arrivals?station=40070%2C40560%2C40850');
  const body = await r.json();
  expect(body.error).toBeUndefined();
  expect(body).toHaveProperty('model');
});
test('accepts comma-joined mapid complex via ?mapid= (Washington/Lake)', async () => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ctatt: { errCd: '0', eta: [] } }), { status: 200 }));
  const r = await call('/cta/arrivals?mapid=40370%2C41660');
  const body = await r.json();
  expect(body.error).toBeUndefined();
  expect(body).toHaveProperty('model');
});
test('gcrta is a registered agency (unknown station -> empty model, not error)', async () => {
  globalThis.fetch = vi.fn(async () => { throw new Error('no live call'); });
  const r = await call('/gcrta/arrivals?station=__none__');
  const body = await r.json();
  expect(r.status).toBe(200);
  expect(body.error).toBeUndefined();
  expect(body.model).toEqual([]);
});
test('miami is a registered agency (unknown station -> empty model)', async () => {
  globalThis.fetch = vi.fn(async () => { throw new Error('no live call'); });
  const r = await call('/miami/arrivals?station=__none__');
  const body = await r.json();
  expect(r.status).toBe(200);
  expect(body.error).toBeUndefined();
  expect(body.model).toEqual([]);
});
test('baltimore is a registered agency (unknown station -> empty model)', async () => {
  globalThis.fetch = vi.fn(async () => { throw new Error('no live call'); });
  const r = await call('/baltimore/arrivals?station=__none__');
  const body = await r.json();
  expect(r.status).toBe(200);
  expect(body.error).toBeUndefined();
  expect(body.model).toEqual([]);
});
test('skyline is a registered agency (unknown station -> empty model)', async () => {
  globalThis.fetch = vi.fn(async () => { throw new Error('no live call'); });
  const r = await call('/skyline/arrivals?station=__none__');
  const body = await r.json();
  expect(r.status).toBe(200);
  expect(body.error).toBeUndefined();
  expect(body.model).toEqual([]);
});
