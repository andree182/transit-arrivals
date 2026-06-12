import { fetchSwiftlyFeed, nowSecs } from '../shared.js';
import { extractTripUpdates } from '../gtfsrt.js';
import { buildModelFromTripUpdates } from '../rtmodel.js';
import DATA from './miami-data.json';

// Miami-Dade via Swiftly. Key is a Worker secret (env.MIAMI_KEY), sent as Authorization.
const TRIP_URL = 'https://api.goswift.ly/real-time/miami/gtfs-rt-trip-updates';
const FEED_TTL = 25;

export function transform(trips, station, data, now) {
  const stopIds = data.stations[station];
  if (!stopIds || !stopIds.length) return { epoch: now, model: [] };
  return { epoch: now, model: buildModelFromTripUpdates(trips, new Set(stopIds), data.routes, data.names, now) };
}

export async function arrivals(env, station, now) {
  const t = now ?? nowSecs();
  if (!env.MIAMI_KEY || !DATA.stations[station]) return { epoch: t, model: [] };   // no key yet -> empty board
  const trips = extractTripUpdates(await fetchSwiftlyFeed(env, TRIP_URL, env.MIAMI_KEY, FEED_TTL));
  return transform(trips, station, DATA, t);
}

// Swiftly Miami has no confirmed open service-alerts feed wired in Phase 1.
export async function alerts(env, routes) {
  return { alerts: [], suspensions: [] };
}
