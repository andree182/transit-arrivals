'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildScheduleArtifacts } = require('./lib/gtfs-schedule.js');

// The ATI feed bundles buses (type 3) + ferries (type 4) + the Tren Urbano metro.
// Keep ONLY route_id "TU" (route_type 1).
function labelFor(route) {
  return (route.route_id === 'TU' && +route.route_type === 1) ? 'TU' : null;
}
function main() {
  const dir = process.env.GTFS_DIR || '/tmp/ati-gtfs';
  const gtfs = readDir(dir);
  const { stations, data } = buildScheduleArtifacts(gtfs, {
    id: 'trenurbano', agency: 'trenurbano', tz: 'America/Puerto_Rico', railTypes: new Set([1]), labelFor,
    titleCase: true
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/trenurbano.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/trenurbano-schedule.json'), JSON.stringify(data));
  console.log('trenurbano: ' + stations.length + ' stations, line ' + data.line + ', ' + Object.keys(data.calendar).length + ' services');
}
if (require.main === module) main();
module.exports = { labelFor };
