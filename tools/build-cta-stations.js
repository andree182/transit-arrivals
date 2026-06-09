#!/usr/bin/env node
// Generate src/pkjs/lib/cta.stations.json from the Chicago Data Portal
// "List of 'L' Stops" dataset (8pix-ypme). One entry per MAP_ID (= CTA mapid).
// Run: node tools/build-cta-stations.js
'use strict';
var fs = require('fs');
var path = require('path');

var URL = 'https://data.cityofchicago.org/resource/8pix-ypme.json?$limit=1000';

// Socrata boolean column -> our 2-char label. PEXP (Purple Express) folds into P.
var COL_LABEL = { RED:'Rd', BLUE:'Bl', G:'Gr', BRN:'Br', P:'Pr', PEXP:'Pr', Y:'Ye', PNK:'Pk', O:'Or' };
var LABEL_ORDER = ['Rd','Bl','Br','Gr','Or','Pk','Pr','Ye'];

function truthy(v) { return v === true || v === 'true' || v === 'True' || v === '1'; }

function latlon(row) {
  if (row.location && row.location.latitude) return [ +row.location.latitude, +row.location.longitude ];
  if (row.location && Array.isArray(row.location.coordinates)) {
    return [ +row.location.coordinates[1], +row.location.coordinates[0] ];  // [lon,lat] -> [lat,lon]
  }
  if (row.latitude && row.longitude) return [ +row.latitude, +row.longitude ];
  return [ NaN, NaN ];
}

function main() {
  require('https').get(URL, function (res) {
    var buf = '';
    res.on('data', function (d) { buf += d; });
    res.on('end', function () {
      var rows = JSON.parse(buf);
      var byMap = {};
      rows.forEach(function (r) {
        var id = String(r.map_id);
        var ll = latlon(r);
        var e = byMap[id] || (byMap[id] = { id: id, name: r.station_name, lat: ll[0], lon: ll[1], lineSet: {}, agency: 'cta' });
        Object.keys(COL_LABEL).forEach(function (col) {
          if (truthy(r[col.toLowerCase()])) e.lineSet[COL_LABEL[col]] = true;
        });
      });
      var out = Object.keys(byMap).map(function (id) {
        var e = byMap[id];
        var lines = LABEL_ORDER.filter(function (l) { return e.lineSet[l]; });
        return { id: e.id, name: e.name, lat: e.lat, lon: e.lon, lines: lines, agency: 'cta' };
      }).filter(function (e) { return e.lines.length && isFinite(e.lat); })
        .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      var dst = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'cta.stations.json');
      fs.writeFileSync(dst, JSON.stringify(out, null, 0) + '\n');
      console.log('wrote ' + out.length + ' CTA stations -> ' + dst);
    });
  }).on('error', function (e) { console.error(e); process.exit(1); });
}
main();
