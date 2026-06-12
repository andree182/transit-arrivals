'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildRailArtifacts } = require('./lib/gtfs-rail.js');

// LA Metro rail lines are single letters A/B/C/D/E/K. Names read "Metro A Line"
// (route_short_name is blank), so the label is the letter directly before "Line".
// The J Line is bus rapid transit and also fails the rail-letter set, so it is
// excluded twice over.
const RAIL_LETTERS = new Set(['A', 'B', 'C', 'D', 'E', 'K']);
function labelFor(route) {
  const name = String(route.route_short_name || route.route_long_name || '').trim();
  const m = /\b([A-Z])\s+Line\b/i.exec(name);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  return RAIL_LETTERS.has(letter) ? letter : null;
}

function main() {
  const dir = process.env.GTFS_DIR || '/tmp/lametro-rail-gtfs';
  const gtfs = readDir(dir);
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'lametro', agency: 'lametro',
    railTypes: new Set([0, 1, 2]),   // light rail (0) + heavy rail (1)
    labelFor,
    // colors from GTFS route_color (Metro publishes canonical hex)
    titleCase: true,
    mergeByNameMeters: 150,          // collapse co-located directional platforms
    excludeNameRe: /\b(yard|shop|division|layup)\b/i
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/lametro.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/lametro-data.json'), JSON.stringify(data));
  console.log('lametro: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
