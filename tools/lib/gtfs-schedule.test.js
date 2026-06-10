'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseGtfsTime, buildScheduleArtifacts } = require('./gtfs-schedule.js');

test('parseGtfsTime handles >24h times', () => {
  assert.strictEqual(parseGtfsTime('04:30:00'), 4 * 3600 + 30 * 60);
  assert.strictEqual(parseGtfsTime('25:10:00'), 25 * 3600 + 10 * 60);
});

const gtfs = {
  stops: [
    { stop_id: 'L', stop_name: 'Lindenwold', stop_lat: '39.83', stop_lon: '-75.00', location_type: '0', parent_station: '' },
    { stop_id: 'A', stop_name: 'Ashland', stop_lat: '39.85', stop_lon: '-75.01', location_type: '0', parent_station: '' }
  ],
  routes: [{ route_id: '2', route_short_name: 'PATCO', route_long_name: 'High Speed Line', route_type: '1', route_color: 'BC0035' }],
  trips: [
    { route_id: '2', service_id: 'WK', trip_id: 'w1', trip_headsign: 'Philadelphia', direction_id: '0' },
    { route_id: '2', service_id: 'WK', trip_id: 'e1', trip_headsign: 'Lindenwold', direction_id: '1' }
  ],
  stopTimes: [
    { trip_id: 'w1', departure_time: '04:30:00', arrival_time: '04:30:00', stop_id: 'L', stop_sequence: '1' },
    { trip_id: 'w1', departure_time: '04:32:00', arrival_time: '04:32:00', stop_id: 'A', stop_sequence: '2' },
    { trip_id: 'e1', departure_time: '05:00:00', arrival_time: '05:00:00', stop_id: 'A', stop_sequence: '1' },
    { trip_id: 'e1', departure_time: '05:02:00', arrival_time: '05:02:00', stop_id: 'L', stop_sequence: '2' }
  ],
  calendar: [{ service_id: 'WK', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }],
  calendarDates: [{ service_id: 'WK', date: '20260704', exception_type: '2' }]
};
const cfg = { id: 'patco', agency: 'patco', tz: 'America/New_York', railTypes: new Set([1]), labelFor: () => 'PA' };

test('buildScheduleArtifacts builds stations + compact timetable for the single rail line', () => {
  const { stations, data } = buildScheduleArtifacts(gtfs, cfg);
  assert.deepStrictEqual(stations.map(s => s.id).sort(), ['A', 'L']);
  assert.strictEqual(stations[0].agency, 'patco');
  assert.strictEqual(data.tz, 'America/New_York');
  assert.strictEqual(data.line, 'PA');
  assert.deepStrictEqual(data.color, [188, 0, 53]);
  assert.deepStrictEqual(data.calendar.WK.days, [0, 1, 1, 1, 1, 1, 0]);
  assert.strictEqual(data.calendar.WK.start, 20260101);
  assert.strictEqual(data.exceptions.WK['20260704'], 2);
  assert.deepStrictEqual(data.stops.L['0'].WK, [4 * 3600 + 30 * 60]);
  assert.strictEqual(data.dirDest['0'], 'Philadelphia');
  assert.strictEqual(data.dirDest['1'], 'Lindenwold');
});
