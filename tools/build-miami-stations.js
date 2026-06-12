'use strict';
const fs = require('fs');
const path = require('path');
const { readDir } = require('./lib/gtfs.js');
const { buildRailArtifacts } = require('./lib/gtfs-rail.js');

// Miami Metrorail is ONE combined route (Orange + Green share a trunk).
// Route long name: "REGULAR METRORAIL SERVICE" — matched by /metrorail/i -> label 'MR'.
// Metromover inner + outer loops, Airport People Mover -> label 'MM'.
function labelFor(route) {
  const name = String(route.route_long_name || route.route_short_name || '');
  if (/metromover|mover|people.?mover/i.test(name)) return 'MM';
  if (/metrorail/i.test(name)) return 'MR';
  return null;
}
function main() {
  const dir = process.env.GTFS_DIR || '/tmp/miami-gtfs';
  const gtfs = readDir(dir);
  // Metrorail directional platforms are modeled as separate stops with names like
  // "PALMETTO STATION RAIL SOUTHBOUND" / "EARLINGTON HTS.STAT.RAIL NORTHBOUND".
  // Strip the direction tag so mergeByName can collapse N/S pairs into one station.
  gtfs.stops = gtfs.stops.map(s => {
    const cleaned = String(s.stop_name || '')
      .replace(/\s*(STAT\.?)?\s*RAIL\s+(NORTH|SOUTH)BOUND\s*$/i, '')
      .replace(/\s+(NORTH|SOUTH)BOUND\s*$/i, '')
      .trim();
    return cleaned !== s.stop_name ? Object.assign({}, s, { stop_name: cleaned }) : s;
  });
  const { stations, data } = buildRailArtifacts(gtfs, {
    id: 'miami', agency: 'miami', railTypes: new Set([0, 1, 2, 12]),
    labelFor,
    // Metrorail color: #FF8040 (orange-salmon from GTFS route_color); Metromover: medium gray.
    colorFor: (r, label) => label === 'MM' ? [120, 120, 120] : [255, 128, 64],
    // Merge same-named co-located directional platforms (Metrorail N/S + Metromover inner/outer).
    mergeByNameMeters: 100,
    // Then fuse co-located platforms whose names differ: street-address aliases,
    // abbreviations, and Metromover<->Metrorail interchanges (Government Center, MIA
    // Airport). 60 m keeps the genuinely-distinct downtown Metromover stops (~150 m
    // apart) separate.
    mergeByProximityMeters: 60,
    titleCase: true
  });
  fs.writeFileSync(path.join(__dirname, '../src/pkjs/lib/miami.stations.json'), JSON.stringify(stations));
  fs.writeFileSync(path.join(__dirname, '../cta-proxy/src/agencies/miami-data.json'), JSON.stringify(data));
  console.log('miami: ' + stations.length + ' stations, ' + Object.keys(data.routes).length + ' routes');
}
if (require.main === module) main();
module.exports = { labelFor };
