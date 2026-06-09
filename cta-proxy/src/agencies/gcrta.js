import { fetchBuf, nowSecs } from '../shared.js';
import { extractTripUpdates, extractAlerts } from '../gtfsrt.js';
import { buildModelFromTripUpdates, buildAlerts } from '../rtmodel.js';
import DATA from './gcrta-data.json';

// Cleveland GCRTA — open Vontas GTFS-RT, NO API key (verified at build time).
const TRIP_URL  = 'https://gtfs-rt.gcrta.vontascloud.com/TMGTFSRealTimeWebService/TripUpdate/TripUpdates.pb';
const ALERT_URL = 'https://gtfs-rt.gcrta.vontascloud.com/TMGTFSRealTimeWebService/Alert/Alerts.pb';

// Pure: trips + station id + data -> { epoch, model }. (Unit-tested.)
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
  if (!DATA.stations[station]) return { epoch: t, model: [] };
  const trips = extractTripUpdates(await fetchBuf(TRIP_URL));
  return transform(trips, station, DATA, t);
}
export async function alerts(env, routes) {
  const rows = extractAlerts(await fetchBuf(ALERT_URL));
  return transformAlerts(rows, routes, DATA.routes);
}
