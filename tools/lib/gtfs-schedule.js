'use strict';
const { buildRailArtifacts, titleCase } = require('./gtfs-rail.js');

function parseGtfsTime(s) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

// gtfs: { stops, routes, trips, stopTimes, calendar, calendarDates } parsed rows.
// cfg:  { id, agency, tz, railTypes:Set, labelFor, colorFor?, titleCase?, mergeByNameMeters? }
// Returns { stations:[phone DB], data: compact timetable } for ONE rail line.
function buildScheduleArtifacts(gtfs, cfg) {
  const { stations, data: rail } = buildRailArtifacts(gtfs, cfg);
  const routeIds = Object.keys(rail.routes);
  if (routeIds.length !== 1) {
    throw new Error('expected exactly one rail route, got ' + routeIds.length + ': ' + routeIds.join(','));
  }
  const railRouteId = routeIds[0];
  const line = rail.routes[railRouteId].label;
  const color = rail.routes[railRouteId].color;

  const stopToStation = {};
  for (const stationId of Object.keys(rail.stations)) {
    for (const sid of rail.stations[stationId]) stopToStation[sid] = stationId;
  }

  const tripInfo = {};
  for (const t of gtfs.trips) {
    if (t.route_id !== railRouteId) continue;
    tripInfo[t.trip_id] = { dir: String(t.direction_id || '0'), sid: t.service_id, head: t.trip_headsign || '' };
  }

  const stops = {};
  const headCount = {};
  for (const stRow of gtfs.stopTimes) {
    const info = tripInfo[stRow.trip_id];
    if (!info) continue;
    const stationId = stopToStation[stRow.stop_id];
    if (!stationId) continue;
    const t = parseGtfsTime(stRow.departure_time || stRow.arrival_time);
    if (t == null) continue;
    ((stops[stationId] = stops[stationId] || {})[info.dir] = stops[stationId][info.dir] || {});
    (stops[stationId][info.dir][info.sid] = stops[stationId][info.dir][info.sid] || []).push(t);
    if (info.head) {
      (headCount[info.dir] = headCount[info.dir] || {})[info.head] = (headCount[info.dir][info.head] || 0) + 1;
    }
  }
  for (const station of Object.keys(stops))
    for (const dir of Object.keys(stops[station]))
      for (const sid of Object.keys(stops[station][dir]))
        stops[station][dir][sid].sort((a, b) => a - b);

  const tc = cfg.titleCase ? titleCase : (s => s);
  const dirDest = {};
  for (const dir of Object.keys(headCount)) {
    dirDest[dir] = tc(Object.entries(headCount[dir]).sort((a, b) => b[1] - a[1])[0][0]);
  }

  const calendar = {};
  for (const c of gtfs.calendar) {
    calendar[c.service_id] = {
      days: [c.sunday, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday].map(v => +v ? 1 : 0),
      start: +c.start_date, end: +c.end_date
    };
  }
  const exceptions = {};
  for (const e of (gtfs.calendarDates || [])) {
    (exceptions[e.service_id] = exceptions[e.service_id] || {})[e.date] = +e.exception_type;
  }

  return { stations, data: { tz: cfg.tz, line, color, dirDest, calendar, exceptions, stops } };
}
module.exports = { parseGtfsTime, buildScheduleArtifacts };
