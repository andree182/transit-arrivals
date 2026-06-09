#!/usr/bin/env node
'use strict';
var https = require('https'); var fs = require('fs'); var path = require('path');

var LABEL = { RD:'Rd', OR:'Or', SV:'Sv', BL:'Bl', YL:'Yl', GR:'Gn' };
var ORDER = ['Rd','Or','Sv','Bl','Yl','Gn'];

// Pure: jStations `Stations` array -> directory entries. Exported for tests.
function buildStations(stations) {
  var byName = {};
  (stations || []).forEach(function (s) {
    var e = byName[s.Name] || (byName[s.Name] = { name: s.Name, codes: [], lat: +s.Lat, lon: +s.Lon, set: {} });
    if (s.Code) e.codes.push(s.Code);
    [s.LineCode1, s.LineCode2, s.LineCode3, s.LineCode4].forEach(function (c) { if (c && LABEL[c]) e.set[LABEL[c]] = 1; });
  });
  return Object.keys(byName).map(function (n) {
    var e = byName[n];
    var lines = ORDER.filter(function (l) { return e.set[l]; });
    return { id: e.codes.slice().sort().join(','), name: e.name, lat: e.lat, lon: e.lon, lines: lines, agency: 'wmata' };
  }).filter(function (e) { return e.id && e.lines.length && isFinite(e.lat); })
    .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
}

function main() {
  var KEY = process.env.WMATA_KEY;
  if (!KEY) { console.error('set WMATA_KEY env var'); process.exit(1); }
  https.get('https://api.wmata.com/Rail.svc/json/jStations?api_key=' + KEY, function (res) {
    var buf = ''; res.on('data', function (d) { buf += d; });
    res.on('end', function () {
      var out;
      try { out = buildStations(JSON.parse(buf).Stations); }
      catch (e) { console.error('parse failed: ' + e.message); process.exit(1); }
      var dst = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'wmata.stations.json');
      fs.writeFileSync(dst, JSON.stringify(out, null, 0) + '\n');
      console.log('wrote ' + out.length + ' WMATA stations -> ' + dst);
    });
  }).on('error', function (e) { console.error(e); process.exit(1); });
}

module.exports = { buildStations: buildStations };
if (require.main === module) main();
