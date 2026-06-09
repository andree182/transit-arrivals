'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildRailArtifacts } = require('./lib/gtfs-rail.js');

// TheBus GTFS contains hundreds of bus routes; keep ONLY Skyline (rail).
function labelFor(route) {
  const name = (route.route_long_name || '') + ' ' + (route.route_short_name || '');
  return /skyline|\brail\b/i.test(name) ? 'SK' : null;
}
function main() {
  const dir = process.env.GTFS_DIR || '/tmp/thebus-gtfs';
  const gtfs = readDir(dir);
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'skyline', agency: 'skyline', railTypes: new Set([0, 1, 2, 12]),
    labelFor, colorFor: () => [0, 132, 169],  // Skyline teal
    titleCase: true
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/skyline.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/skyline-data.json'), JSON.stringify(data));
  console.log('skyline: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
