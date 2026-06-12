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
  return null;   // Light RailLink is a separate Swiftly entity (no key) — excluded
}

function main() {
  // Metro SubwayLink only. Light RailLink is a separate Swiftly entity our key does
  // not cover, so its boards would be permanently empty; re-merge an LR feed here
  // (readDir(LR_DIR) -> concat) if MDOT ever grants a Light Rail key.
  const metroDir = process.env.METRO_DIR || '/tmp/balt-metro';
  const gtfs = readDir(metroDir);
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'baltimore', agency: 'baltimore', railTypes: new Set([0, 1, 2]),
    labelFor,
    colorFor: () => [0, 128, 0],   // Metro green (#008000)
    titleCase: true,    // Metro names are ALL-CAPS in GTFS
    excludeNameRe: /\b(division|yard|depot|shop|garage)\b/i   // drop non-passenger yard/division stops
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/baltimore.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/baltimore-data.json'), JSON.stringify(data));
  console.log('baltimore: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
