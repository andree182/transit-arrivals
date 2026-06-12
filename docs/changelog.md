# Transit Arrivals — Changelog

## 1.11

- **Three more systems.** Miami Metrorail, Baltimore Metro SubwayLink, and LA Metro Rail (the A, B, C, D, E, and K lines) are now live.
- **The time, while you wait.** Leave the board open and the current time now shows at the bottom, so you can watch the clock and your train at once. It sits on its own line under short station names, tucks in beside long ones, and lands in the bottom curve on round watches. When a train hits the platform, the time sweeps gold with the rest of the board.
- **12 or 24 hour.** A new Clock setting (Auto, 12-hour, 24-hour) in the settings menu. Auto follows your watch's own time format.
- **Transfer points, on one board.** Where two lines share a station, you now get a single stop instead of two pins on top of each other: Miami's Government Center carries Metromover and Metrorail together, and LA's Expo/Crenshaw shows the E and K lines side by side.

## 1.10

**The reliability release.** No new cities this time — instead, a top-to-bottom hardening pass across all ten systems, with every fix verified live, station by station.

- **Instant launch, for real.** The watch keeps your last board on hand and flips it in the moment the app opens while fresh times load behind it. A storage limit meant this silently never worked for stations with more than two lines — exactly the busy stations where it matters. Fixed; big boards now appear instantly.
- **Chicago's big downtown stations can be favorites again.** Multi-platform CTA complexes like **Jackson/Library** carry a long internal ID that was getting truncated in three different places, leaving a favorite that could never load. The whole pipeline now carries the full ID, end to end.
- **No more endless spinner.** A connection that stalls mid-request (hello, subway platforms) used to hang until the watchdog gave up with the wrong message. Every request now times out cleanly and tells you what actually happened.
- **Honest when you're out of range.** Outside the ten covered systems, the app used to quietly show you a live Times Square board. Now it says so: *"No covered station nearby — pick a city in the phone app."*
- **Philadelphia: departed trains stay departed.** SEPTA's live feed kept already-left trains in its data; they no longer appear on your board.
- **Chicago: Red and Orange look different now.** The watch's 64-color palette was squeezing both lines into nearly the same red. The bullet is how you identify a line at a glance, so the two now land on clearly distinct shades.
- **Round watches polished.** The station position indicator ("2/4") was clipped by the circular bezel — now it computes the curve for each display size, so it sits cleanly on both Pebble Time Round and Pebble Time 2 Round.
- **Error cards tell the truth.** "Nothing scheduled" no longer appears when the real story is a feed problem, and an error card can no longer caption itself with a cached station from a different city.
- **Accented alert text is safe.** Service alerts with em-dashes and accents (San Juan, we see you) are now measured in bytes, not characters, so a long non-English alert can't get dropped in transit.

---

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
