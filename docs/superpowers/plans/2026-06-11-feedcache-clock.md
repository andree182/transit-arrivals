# FeedCache DO, Swiftly Go-Live, LA Metro, and Board Clock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound Swiftly API usage with a globally-coalescing FeedCache Durable Object, take Miami and Baltimore (Metro only) live, add an LA Metro Rail agency, and put an adaptive current-time clock with a 12/24 setting on the arrivals board.

**Architecture:** The Worker gains a `FeedCache` Durable Object — one global instance per Swiftly feed URL — that fetches each upstream feed at most once per TTL window and coalesces concurrent callers, turning a per-colo cache into a hard global request ceiling against the shared 180-req/15-min key. Swiftly agency modules route their fetches through it. The watch app composes a footer clock in `hero.c` (own line when the station name fits one line, inline after the wrapped name otherwise) driven by the existing per-second tick, with an Auto/12h/24h row in the settings menu persisted on the watch.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite-backed namespace), vitest (worker tests), Node `node:test` (tools/pkjs tests), Pebble C SDK (hero.c, main.c), GTFS build tooling (`tools/lib/gtfs-rail.js`).

**Spec:** `docs/superpowers/specs/2026-06-11-feedcache-clock-design.md`

**Repo test commands (memorize):**
- Worker (cta-proxy): `cd cta-proxy && npx vitest run <path>` — vitest.
- tools/ and src/pkjs/lib/: `node --test <file>` — node:test/node:assert, NOT vitest.
- Each Swiftly agency returns an empty board (not an error) when its key/data is missing; tests rely on that.

---

## Part 1: FeedCache Durable Object

### Task 1.1: Pure cache core with injected fetch + clock

**Files:**
- Create: `cta-proxy/src/feedcache.js`
- Test: `cta-proxy/test/feedcache.test.js`

- [ ] **Step 1: Write the failing test**

```js
// cta-proxy/test/feedcache.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cta-proxy && npx vitest run test/feedcache.test.js`
Expected: FAIL — cannot find `FeedCacheCore` export.

- [ ] **Step 3: Write the minimal implementation**

```js
// cta-proxy/src/feedcache.js

// Pure cache core: one instance per feed URL. No Cloudflare types so it unit-tests
// with an injected fetch + millisecond clock. Holds the last good feed bytes,
// refreshes when the TTL lapses, coalesces concurrent refreshes onto one promise,
// and serves last-good bytes (flagged stale) when an upstream refresh fails.
export class FeedCacheCore {
  constructor(fetchImpl, nowMs) {
    this._fetch = fetchImpl;
    this._now = nowMs;
    this._bytes = null;
    this._fetchedAt = 0;
    this._inflight = null;
  }
  async get(url, key, ttlSecs) {
    if (this._bytes && (this._now() - this._fetchedAt) < ttlSecs * 1000) {
      return { bytes: this._bytes, stale: false };
    }
    if (this._inflight) return this._inflight;
    this._inflight = this._refresh(url, key);
    try { return await this._inflight; }
    finally { this._inflight = null; }
  }
  async _refresh(url, key) {
    try {
      const r = await this._fetch(url, { headers: { Authorization: key }, cf: { cacheTtl: 0 } });
      if (!r.ok) throw new Error('upstream ' + r.status);
      const buf = new Uint8Array(await r.arrayBuffer());
      this._bytes = buf;
      this._fetchedAt = this._now();
      return { bytes: buf, stale: false };
    } catch (e) {
      if (this._bytes) return { bytes: this._bytes, stale: true };
      throw e;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cta-proxy && npx vitest run test/feedcache.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add cta-proxy/src/feedcache.js cta-proxy/test/feedcache.test.js
git commit -m "feat(worker): FeedCacheCore — coalescing, stale-on-error feed cache"
```

### Task 1.2: Durable Object wrapper + fetchSwiftlyFeed helper

**Files:**
- Modify: `cta-proxy/src/feedcache.js` (add `FeedCache` DO class)
- Modify: `cta-proxy/src/shared.js` (add `fetchSwiftlyFeed`)
- Test: `cta-proxy/test/shared.test.js` (append a helper test)

- [ ] **Step 1: Write the failing test**

Append to `cta-proxy/test/shared.test.js`:

```js
import { fetchSwiftlyFeed } from '../src/shared.js';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cta-proxy && npx vitest run test/shared.test.js`
Expected: FAIL — no `fetchSwiftlyFeed` export.

- [ ] **Step 3: Add the helper to `shared.js`**

Append to `cta-proxy/src/shared.js`:

```js
// Fetch a Swiftly feed through its global FeedCache Durable Object. One DO instance
// per feed URL (idFromName) caches + coalesces upstream requests so the shared
// Swiftly key's rate limit is bounded regardless of how many stations/colos are hot.
export async function fetchSwiftlyFeed(env, url, key, ttl) {
  const stub = env.FEED_CACHE.get(env.FEED_CACHE.idFromName(url));
  const r = await stub.fetch('https://feedcache/', {
    method: 'POST',
    body: JSON.stringify({ url, key, ttl })
  });
  if (!r.ok) throw new Error('feedcache ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
```

- [ ] **Step 4: Add the DO class to `feedcache.js`**

Append to `cta-proxy/src/feedcache.js`:

```js
// Durable Object wrapper: a single global instance per feed URL. State lives in
// instance memory (re-fetch on eviction is harmless). The class is registered in
// wrangler.toml as a SQLite-backed namespace (free-plan compatible) and re-exported
// from index.js so the runtime can find it.
export class FeedCache {
  constructor(state, env) {
    this.core = new FeedCacheCore((u, init) => fetch(u, init), () => Date.now());
  }
  async fetch(request) {
    let url, key, ttl;
    try { ({ url, key, ttl } = await request.json()); }
    catch (e) { return new Response('bad request', { status: 400 }); }
    try {
      const { bytes, stale } = await this.core.get(url, key, ttl);
      if (stale) console.log(JSON.stringify({ msg: 'feedcache stale', url }));
      return new Response(bytes, { headers: { 'x-feedcache': stale ? 'stale' : 'fresh' } });
    } catch (e) {
      console.log(JSON.stringify({ msg: 'feedcache miss', url, err: String(e) }));
      return new Response('upstream error', { status: 502 });
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cta-proxy && npx vitest run test/shared.test.js test/feedcache.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cta-proxy/src/feedcache.js cta-proxy/src/shared.js cta-proxy/test/shared.test.js
git commit -m "feat(worker): FeedCache DO + fetchSwiftlyFeed helper"
```

### Task 1.3: Register the DO binding and migration; export from index.js

**Files:**
- Modify: `cta-proxy/wrangler.toml`
- Modify: `cta-proxy/src/index.js:1` (re-export the DO class)
- Test: `cta-proxy/test/index.test.js` (assert the export exists)

- [ ] **Step 1: Write the failing test**

Append to `cta-proxy/test/index.test.js`:

```js
import * as worker from '../src/index.js';
test('worker module re-exports the FeedCache durable object class', () => {
  expect(typeof worker.FeedCache).toBe('function');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cta-proxy && npx vitest run test/index.test.js`
Expected: FAIL — `worker.FeedCache` is undefined.

- [ ] **Step 3: Re-export the DO from `index.js`**

Add after the existing imports at the top of `cta-proxy/src/index.js` (line 1 block):

```js
export { FeedCache } from './feedcache.js';
```

- [ ] **Step 4: Add the binding + migration to `wrangler.toml`**

Append to `cta-proxy/wrangler.toml` (after the `[observability]` block):

```toml
[[durable_objects.bindings]]
name = "FEED_CACHE"
class_name = "FeedCache"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["FeedCache"]
```

Also add a comment line to the secrets block documenting the LA Metro key (used in Part 3):

```toml
#   wrangler secret put LAMETRO_KEY           # Swiftly LA Metro Rail trip updates + alerts (empty board if unset)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd cta-proxy && npx vitest run test/index.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cta-proxy/wrangler.toml cta-proxy/src/index.js cta-proxy/test/index.test.js
git commit -m "feat(worker): register FeedCache DO binding + migration"
```

### Task 1.4: Route Swiftly agency modules through FeedCache

**Files:**
- Modify: `cta-proxy/src/agencies/miami.js`
- Modify: `cta-proxy/src/agencies/baltimore.js`
- Modify: `cta-proxy/src/agencies/skyline.js`
- Test: existing `cta-proxy/test/miami.test.js`, `baltimore.test.js`, `skyline.test.js` must still pass (they call `transform`/`arrivals` with no key → empty board, never hitting the DO).

- [ ] **Step 1: Confirm the existing agency tests pass before changes**

Run: `cd cta-proxy && npx vitest run test/miami.test.js test/baltimore.test.js test/skyline.test.js`
Expected: PASS (baseline).

- [ ] **Step 2: Switch `miami.js` to `fetchSwiftlyFeed`**

In `cta-proxy/src/agencies/miami.js`:
- Change the import line 1 from `import { fetchBuf, nowSecs } from '../shared.js';` to `import { fetchSwiftlyFeed, nowSecs } from '../shared.js';`
- Add a TTL constant under the `TRIP_URL` line: `const FEED_TTL = 25;`
- Change line 18 from:
  ```js
  const trips = extractTripUpdates(await fetchBuf(TRIP_URL, { headers: { Authorization: env.MIAMI_KEY } }));
  ```
  to:
  ```js
  const trips = extractTripUpdates(await fetchSwiftlyFeed(env, TRIP_URL, env.MIAMI_KEY, FEED_TTL));
  ```

- [ ] **Step 3: Switch `baltimore.js` to `fetchSwiftlyFeed`**

In `cta-proxy/src/agencies/baltimore.js`:
- Change the import on line 1 from `import { fetchBuf, nowSecs } from '../shared.js';` to `import { fetchBuf, fetchSwiftlyFeed, nowSecs } from '../shared.js';` (keep `fetchBuf` — the keyless alerts feed still uses it).
- Add `const FEED_TTL = 25;` under the `ALERT_URL` line.
- Replace the `fetchTrips` helper body (lines 23-27) so the Swiftly fetch goes through the cache:
  ```js
  async function fetchTrips(env, url, key) {
    if (!key) return [];
    try { return extractTripUpdates(await fetchSwiftlyFeed(env, url, key, FEED_TTL)); }
    catch (e) { console.log(JSON.stringify({ msg: 'baltimore feed fail', url, err: String(e) })); return []; }
  }
  ```
- Update the two `fetchTrips(...)` calls in `arrivals` (lines 33-34) to pass `env`:
  ```js
  fetchTrips(env, METRO_URL, env.BALTIMORE_METRO_KEY),
  fetchTrips(env, LR_URL, env.BALTIMORE_LR_KEY)
  ```

- [ ] **Step 4: Switch `skyline.js` to `fetchSwiftlyFeed`**

In `cta-proxy/src/agencies/skyline.js`:
- Change line 1 import from `import { fetchBuf, nowSecs } from '../shared.js';` to `import { fetchSwiftlyFeed, nowSecs } from '../shared.js';`
- Add `const FEED_TTL = 25;` under the `TRIP_URL` line.
- Change line 18 from:
  ```js
  const trips = extractTripUpdates(await fetchBuf(TRIP_URL, { headers: { Authorization: env.HONOLULU_KEY } }));
  ```
  to:
  ```js
  const trips = extractTripUpdates(await fetchSwiftlyFeed(env, TRIP_URL, env.HONOLULU_KEY, FEED_TTL));
  ```

- [ ] **Step 5: Run the agency tests to verify they still pass**

Run: `cd cta-proxy && npx vitest run test/miami.test.js test/baltimore.test.js test/skyline.test.js`
Expected: PASS (no-key paths unchanged; DO path is only reached with a key set).

- [ ] **Step 6: Run the full worker suite**

Run: `cd cta-proxy && npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
git add cta-proxy/src/agencies/miami.js cta-proxy/src/agencies/baltimore.js cta-proxy/src/agencies/skyline.js
git commit -m "feat(worker): route Swiftly agencies through FeedCache DO"
```

---

## Part 2: Miami + Baltimore go-live

### Task 2.1: Regenerate Baltimore data as Metro-only

**Files:**
- Modify: `tools/build-baltimore-stations.js`
- Modify: `tools/build-baltimore-stations.test.js`
- Regenerated artifacts: `src/pkjs/lib/baltimore.stations.json`, `cta-proxy/src/agencies/baltimore-data.json`

Light RailLink is not on our Swiftly key (separate entity), so its boards would be permanently empty. Build Baltimore with Metro SubwayLink stations only; keep the two-feed merge code in `baltimore.js` for a future MDOT-granted LR key.

- [ ] **Step 1: Write/adjust the failing test**

In `tools/build-baltimore-stations.test.js`, find the `labelFor` test block and ensure it asserts Light Rail is now excluded. Add this test (append near the existing `labelFor` assertions):

```js
const assert = require('node:assert');
const { test } = require('node:test');
const { labelFor } = require('./build-baltimore-stations.js');

test('labelFor maps Metro to M and excludes Light Rail', () => {
  assert.strictEqual(labelFor({ route_long_name: 'Owings Mills - Johns Hopkins', route_short_name: 'METRO SUBWAYLINK' }), 'M');
  assert.strictEqual(labelFor({ route_long_name: 'BWI - Hunt Valley', route_short_name: 'LIGHT RAILLINK' }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/build-baltimore-stations.test.js`
Expected: FAIL — current `labelFor` returns `'LR'` for Light Rail, not `null`.

- [ ] **Step 3: Update the builder to Metro-only**

In `tools/build-baltimore-stations.js`:
- Change `labelFor` (lines 11-16) so Light Rail returns `null`:
  ```js
  function labelFor(route) {
    const combined = String(route.route_long_name || '') + ' ' + String(route.route_short_name || '');
    if (/subway|metro/i.test(combined)) return 'M';
    return null;   // Light RailLink is a separate Swiftly entity (no key) — excluded
  }
  ```
- In `main()`, stop merging the LR feed. Change:
  ```js
  const gtfs = mergeGtfs(readDir(metroDir), readDir(lrDir));
  ```
  to:
  ```js
  const gtfs = readDir(metroDir);   // Metro SubwayLink only (LR not on our key)
  ```
- Remove the now-unused `lrDir` line and the `mergeGtfs` helper if nothing else references it. (Leave a one-line comment noting LR can be re-merged when a key lands.)
- The `colorFor` can drop the LR branch but leaving it is harmless; simplify to `colorFor: () => [0, 128, 0],`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/build-baltimore-stations.test.js`
Expected: PASS.

- [ ] **Step 5: Regenerate the Baltimore artifacts**

Obtain the MDOT MTA Metro SubwayLink GTFS (the MDOT developer feed; the same source used originally). Then:

```bash
METRO_DIR=/tmp/balt-metro node tools/build-baltimore-stations.js
```

Expected stdout: `baltimore: <N> stations, 1 routes` (one route: Metro `M`; N is the SubwayLink station count, ~14).

Verify no Light Rail names remain:

```bash
node -e "const d=require('./src/pkjs/lib/baltimore.stations.json'); console.log(d.length, d.map(s=>s.lines).flat().filter((v,i,a)=>a.indexOf(v)===i))"
```

Expected: prints the station count and `[ 'M' ]` only.

- [ ] **Step 6: Commit**

```bash
git add tools/build-baltimore-stations.js tools/build-baltimore-stations.test.js src/pkjs/lib/baltimore.stations.json cta-proxy/src/agencies/baltimore-data.json
git commit -m "feat(baltimore): Metro SubwayLink only (Light Rail not on Swiftly key)"
```

### Task 2.2: Unhide Miami and Baltimore in the phone search DB

**Files:**
- Modify: `src/pkjs/lib/stations.js:30`
- Test: `src/pkjs/lib/stations.test.js` (assert both agencies now appear)

- [ ] **Step 1: Write the failing test**

Append to `src/pkjs/lib/stations.test.js`:

```js
test('miami and baltimore are live (present in the search DB)', () => {
  const agencies = new Set(stations._db.map((s) => s.agency));
  assert.ok(agencies.has('miami'), 'miami should be live');
  assert.ok(agencies.has('baltimore'), 'baltimore should be live');
  assert.ok(!agencies.has('skyline'), 'skyline stays hidden (no key)');
});
```

(`stations.js` already exports the assembled DB as `_db` in its `module.exports` — the test reads `stations._db` directly, no export change needed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/pkjs/lib/stations.test.js`
Expected: FAIL — `miami`/`baltimore` filtered out by `NOT_YET_LIVE`.

- [ ] **Step 3: Drop Miami and Baltimore from NOT_YET_LIVE**

In `src/pkjs/lib/stations.js` line 30, change:

```js
var NOT_YET_LIVE = { miami: true, baltimore: true, skyline: true };
```

to:

```js
var NOT_YET_LIVE = { skyline: true };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/pkjs/lib/stations.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pkjs/lib/stations.js src/pkjs/lib/stations.test.js
git commit -m "feat: take Miami and Baltimore live (drop from NOT_YET_LIVE)"
```

### Task 2.3: Set secrets and deploy (manual checkpoint)

This task is operational — it changes no source. The implementer must surface it to the user, who holds the Swiftly key.

- [ ] **Step 1: Set the Swiftly key into both secrets** (user runs)

```bash
cd cta-proxy
echo "<SWIFTLY_KEY>" | npx wrangler secret put MIAMI_KEY
echo "<SWIFTLY_KEY>" | npx wrangler secret put BALTIMORE_METRO_KEY
```

Leave `BALTIMORE_LR_KEY` unset.

- [ ] **Step 2: Deploy the worker**

```bash
cd cta-proxy && npx wrangler deploy
```

Expected: deploy succeeds and the output lists the `FeedCache` durable object and the `v1` migration applied.

- [ ] **Step 3: Smoke-test live boards**

```bash
curl -s "https://cta-proxy.david-torcivia.workers.dev/miami/arrivals?station=<a-miami-station-id>" | head -c 400
curl -s "https://cta-proxy.david-torcivia.workers.dev/baltimore/arrivals?station=<a-metro-station-id>" | head -c 400
```

Expected: non-empty `model` arrays during service hours. Pick station IDs from the regenerated `*-data.json` `stations` keys.

---

## Part 3: LA Metro Rail agency

LA Metro Rail lines A, B, C, D, E, K. The J Line is bus rapid transit — excluded under the no-bus rule. Colors come from GTFS `route_color` (Metro publishes correct hex), so the builder omits `colorFor`.

### Task 3.1: LA Metro station builder

**Files:**
- Create: `tools/build-lametro-stations.js`
- Test: `tools/build-lametro-stations.test.js`
- Generated: `src/pkjs/lib/lametro.stations.json`, `cta-proxy/src/agencies/lametro-data.json`

- [ ] **Step 1: Write the failing test**

```js
// tools/build-lametro-stations.test.js
'use strict';
const assert = require('node:assert');
const { test } = require('node:test');
const { labelFor } = require('./build-lametro-stations.js');

test('labelFor extracts the single rail letter and rejects the J bus line', () => {
  assert.strictEqual(labelFor({ route_short_name: 'A Line', route_long_name: 'Metro A Line' }), 'A');
  assert.strictEqual(labelFor({ route_short_name: 'E Line', route_long_name: 'Metro E Line' }), 'E');
  assert.strictEqual(labelFor({ route_short_name: 'K Line', route_long_name: 'Metro K Line' }), 'K');
  assert.strictEqual(labelFor({ route_short_name: 'J Line', route_long_name: 'Metro J Line (Silver)' }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/build-lametro-stations.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the builder**

```js
// tools/build-lametro-stations.js
'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildRailArtifacts } = require('./lib/gtfs-rail.js');

// LA Metro rail lines are single letters A/B/C/D/E/K. The J Line is bus rapid
// transit (route_type 3) and also fails the letter set, so it is excluded twice
// over. Label = the leading letter of the short name.
const RAIL_LETTERS = new Set(['A', 'B', 'C', 'D', 'E', 'K']);
function labelFor(route) {
  const sn = String(route.route_short_name || route.route_long_name || '').trim();
  const m = /^([A-Z])\b/.exec(sn.toUpperCase());
  if (!m) return null;
  return RAIL_LETTERS.has(m[1]) ? m[1] : null;
}

function main() {
  const dir = process.env.GTFS_DIR || '/tmp/lametro-rail-gtfs';
  const gtfs = readDir(dir);
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'lametro', agency: 'lametro',
    railTypes: new Set([0, 1, 2]),   // light rail (0) + heavy rail (1)
    labelFor,
    // colors from GTFS route_color (Metro publishes canonical hex)
    titleCase: true,
    mergeByNameMeters: 150,          // collapse co-located directional platforms
    excludeNameRe: /\b(yard|shop|division|layup)\b/i
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/lametro.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/lametro-data.json'), JSON.stringify(data));
  console.log('lametro: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/build-lametro-stations.test.js`
Expected: PASS.

- [ ] **Step 5: Generate the artifacts**

Download the LA Metro **rail** GTFS (Metro publishes a rail-only static GTFS; confirm the current URL on metro.net developer resources). Unzip to `/tmp/lametro-rail-gtfs`, then:

```bash
GTFS_DIR=/tmp/lametro-rail-gtfs node tools/build-lametro-stations.js
```

Expected stdout: `lametro: <N> stations, 6 routes` (6 = A,B,C,D,E,K). Verify the route set:

```bash
node -e "const d=require('./cta-proxy/src/agencies/lametro-data.json'); console.log(Object.values(d.routes).map(r=>r.label).sort())"
```

Expected: `[ 'A', 'B', 'C', 'D', 'E', 'K' ]` (no `J`).

- [ ] **Step 6: Commit**

```bash
git add tools/build-lametro-stations.js tools/build-lametro-stations.test.js src/pkjs/lib/lametro.stations.json cta-proxy/src/agencies/lametro-data.json
git commit -m "feat(lametro): rail station builder (A/B/C/D/E/K, J excluded)"
```

### Task 3.2: LA Metro worker agency module

**Files:**
- Create: `cta-proxy/src/agencies/lametro.js`
- Modify: `cta-proxy/src/index.js` (register in AGENCIES + import)
- Test: `cta-proxy/test/lametro.test.js`

- [ ] **Step 1: Write the failing test**

```js
// cta-proxy/test/lametro.test.js
import { expect, test } from 'vitest';
import { transform, transformAlerts, arrivals } from '../src/agencies/lametro.js';
const DATA = { stations: { UNION: ['u1'] }, names: { u1: 'Union Station', u2: '7th St/Metro Center' },
               routes: { '801': { label: 'A', color: [0, 114, 188] } } };
const NOW = 1000;
test('transform builds a model from trip updates', () => {
  const trips = [{ routeId: '801', tripId: 't', directionId: 0, stops: [{ stopId: 'u1', time: NOW + 240 }, { stopId: 'u2', time: NOW + 600 }] }];
  const { model } = transform(trips, 'UNION', DATA, NOW);
  expect(model[0].line).toBe('A');
  expect(model[0].directions[0].dest).toBe('7th St/Metro Center');
});
test('alerts filter to requested labels using the route map', () => {
  const rows = [{ routeIds: ['801'], stopIds: [], header: 'A Line: no service', effect: 1 }];
  const { suspensions } = transformAlerts(rows, ['A'], DATA.routes);
  expect(suspensions[0].line).toBe('A');
});
test('arrivals returns empty model when no key', async () => {
  const out = await arrivals({}, 'UNION', NOW);
  expect(out).toEqual({ epoch: NOW, model: [] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cta-proxy && npx vitest run test/lametro.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the agency module**

```js
// cta-proxy/src/agencies/lametro.js
import { fetchSwiftlyFeed, nowSecs } from '../shared.js';
import { extractTripUpdates, extractAlerts } from '../gtfsrt.js';
import { buildModelFromTripUpdates, buildAlerts } from '../rtmodel.js';
import DATA from './lametro-data.json';

// LA Metro Rail via Swiftly. Same shared key as Miami/Baltimore (env.LAMETRO_KEY),
// routed through the FeedCache DO so the rate limit stays bounded.
const TRIP_URL  = 'https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-trip-updates';
const ALERT_URL = 'https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-alerts';
const TRIP_TTL = 25, ALERT_TTL = 60;

export function transform(trips, station, data, now) {
  const stopIds = data.stations[station];
  if (!stopIds || !stopIds.length) return { epoch: now, model: [] };
  return { epoch: now, model: buildModelFromTripUpdates(trips, new Set(stopIds), data.routes, data.names, now) };
}
export function transformAlerts(rows, wantLabels, routes) {
  return buildAlerts(rows, routes, wantLabels);
}

export async function arrivals(env, station, now) {
  const t = now ?? nowSecs();
  if (!env.LAMETRO_KEY || !DATA.stations[station]) return { epoch: t, model: [] };
  const trips = extractTripUpdates(await fetchSwiftlyFeed(env, TRIP_URL, env.LAMETRO_KEY, TRIP_TTL));
  return transform(trips, station, DATA, t);
}
export async function alerts(env, routes) {
  if (!env.LAMETRO_KEY) return { alerts: [], suspensions: [] };
  const rows = extractAlerts(await fetchSwiftlyFeed(env, ALERT_URL, env.LAMETRO_KEY, ALERT_TTL));
  return transformAlerts(rows, routes, DATA.routes);
}
```

- [ ] **Step 4: Register in `index.js`**

In `cta-proxy/src/index.js`:
- Add the import after the `trenurbano` import (line 13): `import * as lametro from './agencies/lametro.js';`
- Add `lametro` to the `AGENCIES` object (line 15): `const AGENCIES = { cta, wmata, marta, bart, mbta, septa, gcrta, miami, baltimore, skyline, patco, trenurbano, lametro };`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cta-proxy && npx vitest run test/lametro.test.js test/index.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cta-proxy/src/agencies/lametro.js cta-proxy/src/index.js cta-proxy/test/lametro.test.js
git commit -m "feat(lametro): worker agency module (trip updates + alerts via FeedCache)"
```

### Task 3.3: Register LA Metro on the phone side

**Files:**
- Modify: `src/pkjs/lib/stations.js` (require + tag + concat the LA DB)
- Modify: `src/pkjs/lib/agencies.js:157` area (REGISTRY entry)
- Modify: `src/pkjs/lib/config.js:48` (AGENCY_META entry)
- Test: `src/pkjs/lib/stations.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/pkjs/lib/stations.test.js`:

```js
test('lametro is registered and live in the search DB', () => {
  const agencies = new Set(stations._db.map((s) => s.agency));
  assert.ok(agencies.has('lametro'), 'lametro should be live');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/pkjs/lib/stations.test.js`
Expected: FAIL — no `lametro` rows.

- [ ] **Step 3: Wire the LA DB into `stations.js`**

In `src/pkjs/lib/stations.js`:
- Add the require after the `TRENURBANO_DB` line (line 13): `var LAMETRO_DB = require('./lametro.stations.json');`
- Add to the `DB` concat chain (line 33), before `.filter(...)`: `.concat(tag(LAMETRO_DB, 'lametro'))`

- [ ] **Step 4: Register in `agencies.js`**

In `src/pkjs/lib/agencies.js`, add to the `REGISTRY` object after the `trenurbano` entry (line 157):

```js
  lametro: proxied.makeProxiedAgency({ id: 'lametro', name: 'Metro' }),
```

- [ ] **Step 5: Add config chip metadata**

In `src/pkjs/lib/config.js` line 48, add to the `AGENCY_META` object literal (before the closing `}`):

```js
,lametro:{city:"LA",c:"#0072BC"}
```

(Insert it inside the existing single-quoted literal string exactly as the other entries are formatted — comma-separated, no spaces.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test src/pkjs/lib/stations.test.js`
Expected: PASS.

- [ ] **Step 7: Run the full pkjs/tools suites**

Run: `node --test src/pkjs/lib/*.test.js tools/*.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pkjs/lib/stations.js src/pkjs/lib/agencies.js src/pkjs/lib/config.js src/pkjs/lib/stations.test.js
git commit -m "feat(lametro): register LA Metro on the phone (search DB, registry, config chip)"
```

### Task 3.4: Set LA Metro secret and deploy (manual checkpoint)

- [ ] **Step 1: Set the secret** (user runs)

```bash
cd cta-proxy && echo "<SWIFTLY_KEY>" | npx wrangler secret put LAMETRO_KEY
```

- [ ] **Step 2: Deploy**

```bash
cd cta-proxy && npx wrangler deploy
```

- [ ] **Step 3: Smoke-test**

```bash
curl -s "https://cta-proxy.david-torcivia.workers.dev/lametro/arrivals?station=<a-lametro-station-id>" | head -c 400
```

Expected: non-empty `model` during service hours.

---

## Part 4: Board clock + 12/24 setting

### Task 4.1: Clock string formatter (watch)

**Files:**
- Modify: `src/c/hero.h` (declare `hero_clock_string`, the clock-mode enum)
- Modify: `src/c/hero.c` (implement)

There is no existing C test harness in this repo (C is verified in the emulator), so this task is verified by compile + emulator screenshots later. Keep the function pure and tiny.

- [ ] **Step 1: Declare the API in `hero.h`**

Add to `src/c/hero.h` (near the other declarations):

```c
// Clock display mode, persisted on the watch. AUTO follows clock_is_24h_style().
typedef enum { CLOCK_AUTO = 0, CLOCK_12H = 1, CLOCK_24H = 2 } ClockMode;

// Write the current local time into out per mode. 12h drops the leading zero
// ("7:42"); 24h is zero-padded ("19:42"). out must hold >= 6 bytes.
void hero_clock_string(char *out, size_t n, ClockMode mode);
```

- [ ] **Step 2: Implement in `hero.c`**

Add near the top of `src/c/hero.c` (after the includes):

```c
#include <time.h>

void hero_clock_string(char *out, size_t n, ClockMode mode) {
  if (n == 0) return;
  time_t t = time(NULL);
  struct tm *lt = localtime(&t);
  bool h24 = (mode == CLOCK_24H) || (mode == CLOCK_AUTO && clock_is_24h_style());
  if (h24) {
    strftime(out, n, "%H:%M", lt);          // 19:42
  } else {
    int h = lt->tm_hour % 12; if (h == 0) h = 12;
    snprintf(out, n, "%d:%02d", h, lt->tm_min);   // 7:42, no leading zero
  }
}
```

- [ ] **Step 3: Verify it compiles** (deferred to the build in Task 4.4 — note the dependency here so the reviewer expects no standalone build yet).

- [ ] **Step 4: Commit**

```bash
git add src/c/hero.h src/c/hero.c
git commit -m "feat(watch): hero_clock_string 12/24 formatter"
```

### Task 4.2: Adaptive footer with clock (watch)

**Files:**
- Modify: `src/c/hero.h` (add a clock-mode parameter to the hero draw entry points)
- Modify: `src/c/hero.c` (`hero_draw`, `hero_draw_suspended` footer)
- Modify: `src/c/main.c:1176` and `1168` (pass the persisted clock mode through)

Behavior (from spec): the footer name is measured against one line of GOTHIC_14 in its box.
- One-line name: name keeps its line; the clock draws on its own centered line at the very bottom — GOTHIC_14_BOLD on rect, GOTHIC_18_BOLD on round.
- Two-line name: compose `name " · " HH:MM` and draw it in the name box; if it would exceed two lines, trim the name with a trailing ellipsis until `name + " · " + time` fits two lines, so the time always survives.

- [ ] **Step 1: Add a shared footer helper in `hero.c`**

Add this static helper above `hero_draw` (it owns the one-line/two-line decision and the draw, so both `hero_draw` and `hero_draw_suspended` call it):

```c
// Draw the station footer with the current-time clock. When the stripped name fits
// one line of GOTHIC_14 in its box, the clock gets its own bold line below it;
// otherwise the time is appended inline as "name · HH:MM", trimming the name with an
// ellipsis if needed so the time is never pushed off. clk holds the preformatted
// "HH:MM" (empty string -> no clock, e.g. clock disabled).
static void hero_draw_footer(GContext *ctx, GRect bounds, const char *station, const char *clk) {
  static char stn[40];
  hero_station_strip(station, stn, sizeof stn);
  GFont sf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  int st_inset = PBL_IF_ROUND_ELSE(34, 4);
  float SY = bounds.size.h / REF_H;
  int st_top = (int)(PBL_IF_ROUND_ELSE(132, 138) * SY);
  int boxw = bounds.size.w - 2 * st_inset;

  // One line of GOTHIC_14 measured on a known single-line string.
  GSize oneLine = graphics_text_layout_get_content_size("Wg", sf,
                    GRect(0, 0, 400, 60), GTextOverflowModeFill, GTextAlignmentLeft);
  GSize nameSz = graphics_text_layout_get_content_size(stn, sf,
                    GRect(0, 0, boxw, 60), GTextOverflowModeWordWrap, GTextAlignmentCenter);
  bool twoLine = nameSz.h > oneLine.h + 2;

  graphics_context_set_text_color(ctx, GColorWhite);
  if (!clk || !clk[0]) {                              // clock disabled: original footer
    graphics_draw_text(ctx, stn, sf, GRect(st_inset, st_top, boxw, 34),
                       GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
    return;
  }

  if (!twoLine) {
    // Name on its own line, clock bold on the line below.
    graphics_draw_text(ctx, stn, sf, GRect(st_inset, st_top, boxw, oneLine.h + 2),
                       GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
    GFont cf = fonts_get_system_font(PBL_IF_ROUND_ELSE(FONT_KEY_GOTHIC_18_BOLD, FONT_KEY_GOTHIC_14_BOLD));
    graphics_context_set_text_color(ctx, GColorLightGray);
    int clk_top = st_top + oneLine.h + 1;
    graphics_draw_text(ctx, clk, cf, GRect(st_inset, clk_top, boxw, 22),
                       GTextOverflowModeFill, GTextAlignmentCenter, NULL);
    return;
  }

  // Two-line name: append " · HH:MM"; trim the name until name+sep+time fits 2 lines.
  static char comp[56];
  int trim = (int)strlen(stn);
  for (;;) {
    if (trim <= 1) { snprintf(comp, sizeof comp, "%s", clk); break; }
    if ((int)strlen(stn) == trim) snprintf(comp, sizeof comp, "%s · %s", stn, clk);
    else snprintf(comp, sizeof comp, "%.*s… · %s", trim, stn, clk);
    GSize cs = graphics_text_layout_get_content_size(comp, sf,
                 GRect(0, 0, boxw, 60), GTextOverflowModeWordWrap, GTextAlignmentCenter);
    if (cs.h <= 2 * oneLine.h + 2) break;
    trim--;                                            // drop a char and re-measure
  }
  graphics_draw_text(ctx, comp, sf, GRect(st_inset, st_top, boxw, 2 * oneLine.h + 4),
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}
```

- [ ] **Step 2: Change `hero_draw` and `hero_draw_suspended` signatures to take the clock mode**

In `src/c/hero.h`, change the declarations:
- `void hero_draw(GContext *ctx, GRect bounds, const Bundle *b, uint8_t line, uint8_t dir, time_t now);`
  → `void hero_draw(GContext *ctx, GRect bounds, const Bundle *b, uint8_t line, uint8_t dir, time_t now, ClockMode clock);`

In `src/c/hero.c`:
- Update `hero_draw`'s signature to match.
- Replace the footer draw block at the end of `hero_draw` (the `GFont sf = ...; ... hero_station_strip(...); graphics_draw_text(..., stn, ...)` block, ~lines 331-338) with:
  ```c
  char clk[8] = "";
  if (clock != CLOCK_DISABLED_SENTINEL) hero_clock_string(clk, sizeof clk, clock);
  hero_draw_footer(ctx, bounds, b->station, clk);
  ```
  (No disabled sentinel is needed — the setting is Auto/12h/24h only and the clock is always shown. Simplify to: `char clk[8]; hero_clock_string(clk, sizeof clk, clock); hero_draw_footer(ctx, bounds, b->station, clk);`)
- In `hero_draw_suspended`, it is invoked from `hero_draw` (line 158: `hero_draw_suspended(ctx, bounds, b, L); return;`). Pass the clock through: change `hero_draw_suspended`'s signature to accept `ClockMode clock` and replace its footer block (lines 138-143, the `hero_station_strip` + `graphics_draw_text` footer) with the same two lines:
  ```c
  char clk[8]; hero_clock_string(clk, sizeof clk, clock);
  hero_draw_footer(ctx, bounds, b->station, clk);
  ```
  and update the call on line 158 to `hero_draw_suspended(ctx, bounds, b, L, clock);`.

- [ ] **Step 3: Thread the persisted clock mode through `main.c`**

In `src/c/main.c`:
- Add a persist key with the other defines (after `PERSIST_VIEWMEM2 20`, line 19):
  ```c
  #define PERSIST_CLOCK 30          // ClockMode: 0 auto, 1 12h, 2 24h
  ```
- Add a module-level state variable near the other `static` UI state (e.g., by `s_sel`): `static uint8_t s_clock_mode = CLOCK_AUTO;`
- Load it in `init`/startup where other persists are read: `s_clock_mode = persist_exists(PERSIST_CLOCK) ? (uint8_t)persist_read_int(PERSIST_CLOCK) : CLOCK_AUTO;`
- Update the `hero_draw` call at line 1176: `hero_draw(ctx, b, &s_bundle, s_line, s_dir, time(NULL), (ClockMode)s_clock_mode);`

- [ ] **Step 4: Build to verify it compiles** (deferred to Task 4.4 full build; note the dependency).

- [ ] **Step 5: Commit**

```bash
git add src/c/hero.h src/c/hero.c src/c/main.c
git commit -m "feat(watch): adaptive footer clock (own line / inline after wrapped name)"
```

### Task 4.3: Auto/12h/24h settings row (watch)

**Files:**
- Modify: `src/c/main.c` (SettingsRow enum, rows builder, draw, select, persist)

- [ ] **Step 1: Add `ROW_CLOCK` to the settings enum and rows builder**

In `src/c/main.c`:
- Change the enum (line 178) to add `ROW_CLOCK`:
  ```c
  typedef enum { ROW_ADD, ROW_MANAGE, ROW_ALERTS, ROW_REFRESH, ROW_CLOCK } SettingsRow;
  ```
- In `settings_rows` (lines 179-186), append `ROW_CLOCK` before the final `return`, and widen the `order` array. Update `settings_row`'s local array size from `[4]` to `[5]`:
  ```c
  static uint8_t settings_rows(SettingsRow *order) {
    uint8_t n = 0;
    order[n++] = ROW_ADD;
    if (favorites_count() > 0) order[n++] = ROW_MANAGE;
    if (has_alerts())          order[n++] = ROW_ALERTS;
    order[n++] = ROW_REFRESH;
    order[n++] = ROW_CLOCK;
    return n;
  }
  static SettingsRow settings_row(uint16_t r) {
    SettingsRow order[5];
    uint8_t n = settings_rows(order);
    if (r >= n) r = n - 1;
    return order[r];
  }
  ```

- [ ] **Step 2: Draw the row**

In `menu_draw_row`'s switch (after the `ROW_REFRESH` case, line 310-312), add:

```c
    case ROW_CLOCK: {
      const char *v = s_clock_mode == CLOCK_12H ? "12-hour"
                    : s_clock_mode == CLOCK_24H ? "24-hour" : "Auto";
      menu_cell_basic_draw(ctx, cell, "Clock", v, NULL);
      break;
    }
```

- [ ] **Step 3: Handle selection (cycle Auto → 12h → 24h)**

In `menu_select`'s switch (after the `ROW_REFRESH` case, line 334-337), add:

```c
    case ROW_CLOCK:
      s_clock_mode = (s_clock_mode + 1) % 3;     // Auto -> 12h -> 24h -> Auto
      persist_write_int(PERSIST_CLOCK, s_clock_mode);
      menu_layer_reload_data(m);
      break;
```

- [ ] **Step 4: Build to verify it compiles** (Task 4.4).

- [ ] **Step 5: Commit**

```bash
git add src/c/main.c
git commit -m "feat(watch): Clock settings row (Auto/12h/24h)"
```

### Task 4.4: Build, emulator-verify, screenshots

**Files:** none (verification task). Requires the Pebble SDK venv (see the native-c memory: the SDK venv symlink gotcha can block `pebble build`).

- [ ] **Step 1: Clean build (messageKeys unchanged, but be safe after C signature changes)**

```bash
pebble build
```

Expected: build succeeds for all six platforms (basalt, chalk, diorite, emery, flint, gabbro) with no warnings from `hero.c`/`main.c`.

- [ ] **Step 2: Emulator-verify the clock on rect (basalt)**

```bash
pebble install --emulator basalt
```

Check: a one-line station name shows the bold clock on its own bottom line; a long station name (navigate to a SEPTA/long-name station) shows `name · HH:MM` on the second line with no third line and the time intact.

- [ ] **Step 3: Emulator-verify on round (chalk)**

```bash
pebble install --emulator chalk
```

Check: the clock sits centered in the bottom chord at GOTHIC_18_BOLD and does not clip on the bezel.

- [ ] **Step 4: Verify the 12/24 setting**

In the emulator settings menu, cycle the Clock row Auto → 12-hour → 24-hour and confirm the footer time switches between `7:42` and `19:42`, and that the choice survives an app relaunch (`pebble install` again).

- [ ] **Step 5: Capture screenshots** into `screenshots/` for the changelog (basalt one-line, basalt long-name, chalk).

```bash
pebble screenshot --emulator basalt screenshots/clock-basalt.png
pebble screenshot --emulator chalk screenshots/clock-chalk.png
```

- [ ] **Step 6: Commit screenshots**

```bash
git add screenshots/clock-basalt.png screenshots/clock-chalk.png
git commit -m "docs: board clock emulator screenshots"
```

---

## Part 5: Release

### Task 5.1: Version bump + changelog

**Files:**
- Modify: `package.json:4` (version)
- Modify: `docs/changelog.md`

- [ ] **Step 1: Bump the version**

In `package.json` line 4, change `"version": "1.10"` to `"version": "1.11"`.

- [ ] **Step 2: Add the changelog entry**

Prepend a `## 1.11` section under the title in `docs/changelog.md`, following the established voice (rider-facing, no em dashes per the writing-style memory, concrete benefits). Cover: Miami and Baltimore Metro now live; LA Metro Rail added; a current-time clock on the board; the Auto/12h/24h clock setting. Do not mention the FeedCache DO (internal). Draft:

```markdown
## 1.11

- **Three more systems.** Miami Metrorail, Baltimore Metro SubwayLink, and LA Metro Rail (A, B, C, D, E, K lines) are now live.
- **The time, while you wait.** Leave the board open and the current time now shows at the bottom, so you can watch the clock and your train at once. It tucks neatly beside long station names and sits in the bottom curve on round watches.
- **12 or 24 hour.** A new Clock setting (Auto, 12-hour, 24-hour) under the settings menu. Auto follows your watch's own time format.
```

- [ ] **Step 3: Rebuild the PBW with the new version**

```bash
pebble build
```

Expected: build succeeds; the PBW carries version 1.11.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/changelog.md
git commit -m "v1.11: Miami + Baltimore + LA Metro live, board clock, 12/24 setting"
```

### Task 5.2: Final full-suite verification

- [ ] **Step 1: Run every test suite**

```bash
cd cta-proxy && npx vitest run && cd ..
node --test tools/*.test.js
node --test src/pkjs/lib/*.test.js
```

Expected: all green. The worker suite count rises by the new FeedCache + lametro tests; the tools/pkjs suites rise by the baltimore/lametro/stations additions.

- [ ] **Step 2: Confirm the working tree is clean and on a feature branch**

```bash
git status
git log --oneline -12
```

Expected: clean tree; the commit series above present. (If work began on `main`, the executor should have branched first per repo norms — verify before any push.)

---

## Self-Review Notes

- **Spec coverage:** FeedCache DO (Tasks 1.1-1.4), stale-on-429 (1.1 test + 1.2 DO), coalescing (1.1), per-feed global instance (1.2 helper via `idFromName`), Miami+Baltimore go-live with LR trimmed (2.1-2.3), Skyline stays hidden (2.2 test asserts it), LA Metro build+worker+phone (3.1-3.4), adaptive clock both board states (4.1-4.2 covers `hero_draw` and `hero_draw_suspended`), 12/24 setting persisted (4.1 enum, 4.2 thread-through, 4.3 row, `PERSIST_CLOCK`), minute tick (no new code — existing `SECOND_UNIT` tick at main.c:1447 already calls `render_dispatch` every second, documented here). Vehicle positions, Skyline go-live, and Baltimore LR are out of scope per spec.
- **Type consistency:** `ClockMode` enum defined in `hero.h` (4.1), consumed in `hero_draw`/`hero_draw_suspended`/`hero_draw_footer` (4.2) and `main.c` `s_clock_mode`/`PERSIST_CLOCK` (4.2-4.3). `fetchSwiftlyFeed(env, url, key, ttl)` signature defined in 1.2 and called identically in miami/baltimore/skyline (1.4) and lametro (3.2). `FEED_CACHE` binding name consistent between wrangler.toml (1.3) and the helper (1.2).
- **Known nicety (not a blocker):** during the brief station-change riffle animation the inline two-line clock is painted by `hero_draw` after the riffle settles; the riffle path itself (`hero_station_glyphs`) is unchanged. The clock lives below the flip bands, so the per-second flip animation never tears it.
- **Open item for the implementer:** confirm the live LA Metro rail GTFS URL and the Swiftly `gtfs-rt-alerts` path for `lametro-rail` at build time (Tasks 3.1 Step 5, 3.2). Both are external endpoints that can move; the code paths degrade to an empty board/alerts if wrong, so a wrong guess fails safe.
