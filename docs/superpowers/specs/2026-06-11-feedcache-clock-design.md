# FeedCache Durable Object, Swiftly Go-Live, LA Metro, and Board Clock

Date: 2026-06-11
Status: approved pending user review

## Overview

Two work tracks, one release (v1.11):

1. **Worker track.** A `FeedCache` Durable Object that bounds Swiftly API usage globally, then go-live for Miami and Baltimore (Metro SubwayLink only), plus a new LA Metro Rail agency. All three share one Swiftly key limited to 180 requests per 15 minutes.
2. **Watch track.** A small current-time clock on the arrivals board so riders who leave the app open can see the time, with an Auto / 12h / 24h setting in the settings menu.

## Constraints

- One Swiftly key covers exactly three feeds: `mta-maryland-metro`, `lametro-rail`, `miami`. Rate limit 180 req/15 min (12/min average), shared across all three. Swiftly will not grant more entities unless the transit agency requests it on our behalf.
- `mta-maryland-light-rail` and `thebus` (Skyline) are NOT on the key. Baltimore ships Metro only; Skyline stays hidden in `NOT_YET_LIVE`.
- The existing per-request cache (`cached()` in `shared.js`, 25s arrivals TTL) is keyed per station and per Cloudflare colo, so it does not bound upstream requests when many stations are viewed.

## Part 1: FeedCache Durable Object

### Architecture

New file `cta-proxy/src/feedcache.js` exporting a `FeedCache` DO class (SQLite-backed for free-plan compatibility). One global instance per Swiftly feed via `idFromName(feedUrl)`. All Worker isolates in every colo route Swiftly fetches through the feed's single DO instance, which turns the per-colo probability bound into a global guarantee: at most one upstream request per feed per TTL window, so a hard ceiling of about 7 req/min across the key with all three agencies hot (3 trip-update feeds at 25s TTL plus LA alerts at 60s).

### Request flow

1. Agency module calls `fetchSwiftlyFeed(env, feedUrl, key, ttl)` (new helper in `shared.js`).
2. Helper gets the DO stub (`env.FEED_CACHE.idFromName(feedUrl)`) and forwards `{url, key, ttl}`.
3. DO logic, all state in instance memory (re-fetch on eviction is fine):
   - Fresh (`now - fetchedAt < ttl`): return cached bytes.
   - Stale or empty: fetch Swiftly with `Authorization: key`. Concurrent callers coalesce on a shared in-flight promise (DO awaits on fetch allow event interleaving, so the promise guard is required, not optional).
   - Upstream 200: cache bytes + timestamp, return them.
   - Upstream 429/5xx/network error: return the last good bytes with an `x-feedcache: stale` header if any exist, else propagate the error status. Log a structured line either way.
4. Agency modules treat the DO response exactly like a direct `fetchBuf` response (protobuf bytes).

### Config

- `wrangler.toml`: `[[durable_objects.bindings]]` FEED_CACHE plus a `[[migrations]]` entry with `new_sqlite_classes = ["FeedCache"]`.
- TTLs: trip updates 25s (matches ARR_TTL), alerts 60s (matches ALR_TTL).
- The per-station `cached()` response layer stays as-is on top.

### Affected agency modules

`baltimore.js`, `miami.js`, `skyline.js` (dormant but converted for consistency), and new `lametro.js` switch their Swiftly fetches to `fetchSwiftlyFeed`. Non-Swiftly agencies are untouched.

### Testing

DO cache/stale/coalesce logic factored into a small pure class with injected `fetch` and clock, unit-tested in vitest (fresh hit, stale refresh, 429 stale fallback, error with no stale copy, coalescing). Existing agency tests keep passing with the helper mocked.

## Part 2: Miami + Baltimore go-live

- Secrets: set the one Swiftly key into `MIAMI_KEY` and `BALTIMORE_METRO_KEY`. `BALTIMORE_LR_KEY` stays unset; the merged-feed code path remains for a future MDOT-granted key.
- Baltimore data: regenerate `baltimore-data.json` + `baltimore.stations.json` with Light RailLink excluded (Metro SubwayLink stations only), so riders never see permanently empty Light Rail boards.
- Unhide: remove `miami` and `baltimore` from `NOT_YET_LIVE` in `src/pkjs/lib/stations.js`. `skyline` stays.
- Deploy worker, rebuild PBW, verify live boards in the emery emulator, changelog entry.

## Part 3: LA Metro Rail agency

- New agency id `lametro`, rail lines A, B, C, D, E, K (J Line is bus rapid transit, excluded under the no-bus rule).
- Data build: new tools builder invoking `buildRailArtifacts` on LA Metro's rail GTFS (feed URL confirmed during implementation; Metro publishes a rail-only GTFS). Emits `lametro.stations.json` + `lametro-data.json` like the others.
- `cta-proxy/src/agencies/lametro.js`: trip updates from `https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-trip-updates` via FeedCache with `LAMETRO_KEY` (same key value); alerts from the Swiftly alerts endpoint for `lametro-rail` at 60s TTL, also via FeedCache.
- Registration: `index.js` agency map, pkjs `stations.js` search DB + nearest-station, config chips (Metro brand color), line colors per current Metro signage.
- Tests mirroring an existing Swiftly agency (transform, station mapping, alerts).

## Part 4: Board clock + 12/24 setting

### Placement (approved via mockups)

Single adaptive rule on every platform, keyed off whether the station footer name fits one line of GOTHIC_14 in its box:

- **One-line name:** the name stays on its line and the clock gets its own centered line at the very bottom. Rect: GOTHIC_14_BOLD, light gray. Round: GOTHIC_18_BOLD centered in the bottom chord.
- **Two-line name:** no separate clock line. The time joins the end of the wrapped name as `name · 7:42` (dot dimmer than the time, time in the same GOTHIC_14 as the name). If `name + " · " + time` would wrap to a third line, the name is character-trimmed with a trailing ellipsis until the composed string fits two lines, so the time always survives.

The clock string: 12h style renders without a leading zero (`7:42`), 24h as `19:42`.

### Where it appears

The hero board in both states: normal arrivals and the suspended/NO DATA screen (same footer treatment). Menus, settings, alerts, and loading screens are excluded; they are transient interaction surfaces.

### Implementation notes

- `hero.c` has two parallel layout paths: `hero_draw` and the glyph-emitting flip-animation path. Both must apply identical footer geometry or the flip animation will tear. The footer composition (which case, composed string, clock line position) is computed by one shared helper both paths call.
- Composed footer strings live in static buffers (the app task stack is tiny; deep text-layout chains have faulted on hardware before). Recomposed only when station, bundle, or minute changes.
- Minute ticks: subscribe `tick_timer_service` MINUTE_UNIT in main.c, mark the board layer dirty. The whole window repaints anyway (no partial-rect redraw on Pebble).

### 12/24 setting

- New settings-menu row `ROW_CLOCK` cycling Auto, 12h, 24h. Auto follows `clock_is_24h_style()`.
- Stored in a new watch persist key; no phone/pkjs involvement.

## Rollout order

1. FeedCache DO + tests, deploy.
2. Secrets in, Baltimore data trim, unhide, deploy + verify live Miami/Baltimore boards in emulator.
3. LA Metro build + deploy + verify.
4. Clock + setting, emulator screenshots on basalt, chalk, emery (one-line, two-line, and trimmed-name cases).
5. Version 1.11, changelog, PBW rebuild.

## Out of scope

- Vehicle positions (unused by the app).
- Skyline/Honolulu go-live (no key; requires TheBus to write Swiftly).
- Baltimore Light Rail (requires MDOT to write Swiftly; code path retained).
- Clock on non-board screens.
