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
