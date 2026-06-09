'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildRailArtifacts } = require('./lib/gtfs-rail.js');

// Baltimore MDOT MTA — two separate GTFS feeds merged before artifact build.
// route_short_name: 'METRO SUBWAYLINK' (type 1), 'LIGHT RAILLINK' (type 0).
// route_long_name: 'Owings Mills - Johns Hopkins' / 'BWI Airport / Glen Burnie - Hunt Valley'
// — so we check both fields.
function labelFor(route) {
  const combined = String(route.route_long_name || '') + ' ' + String(route.route_short_name || '');
  if (/subway|metro/i.test(combined)) return 'M';
  if (/light\s*rail/i.test(combined)) return 'LR';
  return null;
}

function mergeGtfs(a, b) {
  return {
    stops: a.stops.concat(b.stops), routes: a.routes.concat(b.routes),
    trips: a.trips.concat(b.trips), stopTimes: a.stopTimes.concat(b.stopTimes)
  };
}

function main() {
  const metroDir = process.env.METRO_DIR || '/tmp/balt-metro';
  const lrDir = process.env.LR_DIR || '/tmp/balt-lr';
  const gtfs = mergeGtfs(readDir(metroDir), readDir(lrDir));
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'baltimore', agency: 'baltimore', railTypes: new Set([0, 1, 2]),
    labelFor,
    colorFor: (r, label) => label === 'M' ? [0, 128, 0] : [0, 116, 153],   // Metro green (#008000), Light Rail teal (#007499)
    titleCase: true    // Metro names are ALL-CAPS in GTFS
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/baltimore.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/baltimore-data.json'), JSON.stringify(data));
  console.log('baltimore: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
