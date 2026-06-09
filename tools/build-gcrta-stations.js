'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildRailArtifacts } = require('./lib/gtfs-rail.js');

// GCRTA rapid transit: Red (heavy rail), Blue/Green/Waterfront (light rail).
// Matched on route_long_name so BRT "lines" (HealthLine, MetroHealth Line — buses) are excluded.
const LABELS = [
  [/red/i, 'Rd'], [/blue/i, 'Bl'], [/green/i, 'Gn'], [/waterfront/i, 'W']
];
function labelFor(route) {
  const name = String(route.route_long_name || route.route_short_name || '');
  if (/health|brt|bus/i.test(name)) return null;
  for (const [re, label] of LABELS) if (re.test(name)) return label;
  return null;
}
function main() {
  const dir = process.env.GTFS_DIR || '/tmp/gcrta-gtfs';
  const gtfs = readDir(dir);
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'gcrta', agency: 'gcrta', railTypes: new Set([0, 1, 2]), labelFor,
    // GCRTA light rail models each directional platform as a separate parent-less
    // stop; merge the same-named pair at each station, and de-SHOUT the GTFS names.
    mergeByNameMeters: 300, titleCase: true
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/gcrta.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/gcrta-data.json'), JSON.stringify(data));
  console.log('gcrta: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
