import { fetchBuf, nowSecs } from '../shared.js';
import { extractTripUpdates } from '../gtfsrt.js';
import { buildModelFromTripUpdates } from '../rtmodel.js';
import DATA from './skyline-data.json';

// Honolulu Skyline shares TheBus Swiftly feed; data.routes holds ONLY the Skyline
// route, so buildModelFromTripUpdates drops every bus trip by route lookup.
const TRIP_URL = 'https://api.goswift.ly/real-time/thebus/gtfs-rt-trip-updates';

export function transform(trips, station, data, now) {
  const stopIds = data.stations[station];
  if (!stopIds || !stopIds.length) return { epoch: now, model: [] };
  return { epoch: now, model: buildModelFromTripUpdates(trips, new Set(stopIds), data.routes, data.names, now) };
}
export async function arrivals(env, station, now) {
  const t = now ?? nowSecs();
  if (!env.HONOLULU_KEY || !DATA.stations[station]) return { epoch: t, model: [] };
  const trips = extractTripUpdates(await fetchBuf(TRIP_URL, { headers: { Authorization: env.HONOLULU_KEY } }));
  return transform(trips, station, DATA, t);
}
export async function alerts(env, routes) {
  return { alerts: [], suspensions: [] };
}
