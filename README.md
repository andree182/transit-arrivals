# Transit Arrivals

A Pebble watchapp that shows live train countdowns for ten transit systems: New York MTA Subway (incl. PATH), Chicago CTA, Washington DC Metro (WMATA), Atlanta MARTA, SF Bay Area BART, Boston MBTA subway, Philadelphia SEPTA (Metro + Regional Rail), Cleveland GCRTA, PATCO Speedline, and San Juan Tren Urbano. The watch picks the nearest station by GPS (multi-entrance complexes included), steps through agency-scoped favorites (up to 10, managed from a phone config page), shows service alerts and suspensions, marks timetable-derived times with a SCHED badge (PATCO, Tren Urbano), and shows an honest NO DATA state — after one retry — instead of fake countdowns. Builds for all current Pebble platforms: basalt, chalk, diorite, emery, flint, gabbro.

## A note on names

The package name `mta-arrivals` and the worker directory `cta-proxy` are historical: the app started NYC-only, and the worker started as a CTA proxy. Today the app is **Transit Arrivals** and the worker proxies *all* non-MTA agencies. Renaming the worker would break its deployed URL (`https://cta-proxy.david-torcivia.workers.dev`, baked into the phone JS), so the names stay.

## Repo layout

| Path | What it is |
| --- | --- |
| `src/c/` | The watchapp (Pebble C SDK): UI, favorites, AppMessage bundle decoding, app glance |
| `src/pkjs/` | Phone-side JS (PebbleKit JS): fetches MTA feeds directly, everything else via the worker; station DBs (`lib/*.stations.json`); favorites config page |
| `cta-proxy/` | Cloudflare Worker that proxies + normalizes arrivals/alerts for all non-MTA agencies (see `cta-proxy/README.md`) |
| `tools/` | Node scripts that build the station-data files from each agency's GTFS/API (see `tools/README.md`) |
| `docs/` | Changelog, store listing, references |
| `resources/`, `screenshots/` | App icons and store screenshots |

## Building

Standard Pebble SDK workflow from the repo root:

```sh
pebble build
pebble install --emulator emery   # or a physical watch
```

## Tests — two different runners

There are **two test suites with two different runners**; don't mix them up.

**Phone JS + tools** use Node's built-in `node:test`. The test files sit next to the code (`src/pkjs/lib/*.test.js`, `tools/*.test.js`, `tools/lib/*.test.js`) and must be passed explicitly — zsh users in particular should pass the globs rather than relying on test discovery:

```sh
node --test src/pkjs/lib/*.test.js tools/*.test.js tools/lib/*.test.js
```

**The worker** uses vitest, with tests in `cta-proxy/test/`:

```sh
cd cta-proxy && npx vitest run
```
