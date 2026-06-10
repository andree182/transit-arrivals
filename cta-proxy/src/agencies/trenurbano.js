import { nowSecs } from '../shared.js';
import { nextDepartures } from '../schedule.js';
import DATA from './trenurbano-schedule.json';

// Tren Urbano (San Juan) has no real-time feed; arrivals come from the bundled GTFS timetable.
export async function arrivals(env, station, now) {
  return nextDepartures(DATA, station, now ?? nowSecs());
}
export async function alerts(env, routes) {
  return { alerts: [], suspensions: [] };
}
