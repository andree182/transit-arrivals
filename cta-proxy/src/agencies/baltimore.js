import { fetchBuf, fetchSwiftlyFeed, nowSecs } from '../shared.js';
import { extractTripUpdates, extractAlerts } from '../gtfsrt.js';
import { buildModelFromTripUpdates, buildAlerts } from '../rtmodel.js';
import DATA from './baltimore-data.json';

// MDOT MTA via Swiftly: Metro SubwayLink + Light RailLink are SEPARATE agency feeds (separate keys).
const METRO_URL = 'https://api.goswift.ly/real-time/mta-maryland-metro/gtfs-rt-trip-updates';
const LR_URL    = 'https://api.goswift.ly/real-time/mta-maryland-light-rail/gtfs-rt-trip-updates';
// Service alerts (all modes) are OPEN — no key.
const ALERT_URL = 'https://feeds.mta.maryland.gov/alerts.pb';
const FEED_TTL = 25;

export function transform(trips, station, data, now) {
  const stopIds = data.stations[station];
  if (!stopIds || !stopIds.length) return { epoch: now, model: [] };
  return { epoch: now, model: buildModelFromTripUpdates(trips, new Set(stopIds), data.routes, data.names, now) };
}
export function transformAlerts(rows, wantLabels, routes) {
  return buildAlerts(rows, routes, wantLabels);
}

// Fetch a Swiftly feed with its key; return [] on any failure so one mode's outage
// doesn't blank the other.
async function fetchTrips(env, url, key) {
  if (!key) return [];
  try { return extractTripUpdates(await fetchSwiftlyFeed(env, url, key, FEED_TTL)); }
  catch (e) { console.log(JSON.stringify({ msg: 'baltimore feed fail', url, err: String(e) })); return []; }
}

export async function arrivals(env, station, now) {
  const t = now ?? nowSecs();
  if (!DATA.stations[station]) return { epoch: t, model: [] };
  const [metro, lr] = await Promise.all([
    fetchTrips(env, METRO_URL, env.BALTIMORE_METRO_KEY),
    fetchTrips(env, LR_URL, env.BALTIMORE_LR_KEY)
  ]);
  return transform(metro.concat(lr), station, DATA, t);
}
export async function alerts(env, routes) {
  const rows = extractAlerts(await fetchBuf(ALERT_URL));   // keyless
  return transformAlerts(rows, routes, DATA.routes);
}
