'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildScheduleArtifacts } = require('./lib/gtfs-schedule.js');

// PATCO is a single rapid-transit line (route_type 1). Match it, exclude anything else.
function labelFor(route) {
  return (+route.route_type === 1) ? 'PA' : null;
}
function main() {
  const dir = process.env.GTFS_DIR || '/tmp/patco-gtfs';
  const gtfs = readDir(dir);
  const { stations, data } = buildScheduleArtifacts(gtfs, {
    id: 'patco', agency: 'patco', tz: 'America/New_York', railTypes: new Set([1]), labelFor
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/patco.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/patco-schedule.json'), JSON.stringify(data));
  console.log('patco: ' + stations.length + ' stations, line ' + data.line + ', ' + Object.keys(data.calendar).length + ' services');
}
if (require.main === module) main();
module.exports = { labelFor };
