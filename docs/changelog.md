# Transit Arrivals — Changelog

## 1.9

**A new city — live rail.**

- **Cleveland — GCRTA.** The Red Line (heavy rail) plus the Blue, Green, and Waterfront light-rail lines, with live predictions and service alerts.

**Two more cities — scheduled rail.**

- **Philadelphia / South Jersey — PATCO.** The High Speed Line, every station.
- **San Juan — Tren Urbano.** Puerto Rico's metro, every station.

PATCO and Tren Urbano don't publish real-time data, so their countdowns come from the official published timetable and are clearly marked **"SCHED"** on the watch — honest scheduled times, never a fake "live" number.

That brings the app to **ten transit systems**.

**Also**

- **Right station, every time.** Favorites now remember which agency they belong to, so stations that share an internal ID across cities (a few NYC and DC stops do) always load the correct system's arrivals.
- **No more flicker between stations.** Quickly flipping past stations no longer lets a slow reply land on the wrong one — each request is tracked and stale answers are ignored.
- Error cards (**"No trains"**, "No phone") now show the station name, and very-distant scheduled times (a couple hours out, overnight) display the minutes cleanly instead of clipping.
- **Big complexes detected from every entrance.** Sprawling stations like **14 St/6 Av** (1/2/3 at 7 Av, F/M/L + PATH a block east at 6 Av) are now matched from whichever entrance you're actually at, instead of from a single point stuck at one end.
- **Every line, even on a hiccup.** If one of a station's live feeds momentarily fails, the app retries it once and then shows that line as **"NO DATA"** rather than hiding it — so you always see all the lines a station serves, never just the one whose feed happened to load.

---

## 1.8

**Three new cities.**

- **Boston — MBTA.** Red, Orange, Blue, Green (all four branches), and the Mattapan trolley, with live predictions at every station.
- **Philadelphia — SEPTA.** Trolleys, the Norristown High Speed Line, and Regional Rail with real-time arrivals. The Market–Frankford (L) and Broad Street (B) lines show service alerts plus an honest **"NO DATA"** notice — SEPTA doesn't publish live times for them, so the app won't pretend otherwise.
- **San Francisco Bay Area — BART.** Every line, every station, color-coded, with service advisories.

That's **seven transit systems** in one app — New York, Chicago, Washington, Atlanta, Boston, Philadelphia, and the Bay Area — picked automatically by your location, or pin favorites from any city.

**Also new**

- **Atlanta (MARTA) service alerts** are now supported.
- **"NO DATA" indicator** for any line that doesn't publish live arrivals — no fake countdowns.
- **Color-coded cities** in settings: each city now has its own distinct color on the filter chips and station badges, so you can tell them apart at a glance.
- Reliability fixes: BART falls back to a second live feed if its primary is down, and non-English alert text (accents, dashes) now renders correctly on the watch.

---

## 1.7

- New York (MTA, incl. PATH), Chicago (CTA), Washington (WMATA), and Atlanta (MARTA) rail.
- Nearest-station auto-select, favorites, and line/direction switching.
