import { nowSecs } from '../shared.js';
import { nextDepartures } from '../schedule.js';
import DATA from './patco-schedule.json';

// PATCO has no real-time feed; arrivals come from the bundled GTFS timetable.
export async function arrivals(env, station, now) {
  return nextDepartures(DATA, station, now ?? nowSecs());
}
export async function alerts(env, routes) {
  return { alerts: [], suspensions: [] };
}
