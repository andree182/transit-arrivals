#!/usr/bin/env node
'use strict';
var https = require('https');
var LABEL = { RED:'Rd', GOLD:'Gd', BLUE:'Bl', GREEN:'Gn' };
function norm(s){ return String(s||'').trim().toUpperCase(); }

// Pure: live traindata array -> [{ station, lines:[labels] }] (exact API names). Exported for tests.
function extractStations(trains) {
  var by = {};
  (Array.isArray(trains) ? trains : []).forEach(function (t) {
    var st = norm(t.STATION); if (!st) return;
    var e = by[st] || (by[st] = { station: st, set: {} });
    var l = LABEL[norm(t.LINE)]; if (l) e.set[l] = 1;
  });
  return Object.keys(by).sort().map(function (st) { return { station: st, lines: Object.keys(by[st].set) }; });
}
function main() {
  var KEY = process.env.MARTA_KEY; if (!KEY) { console.error('set MARTA_KEY'); process.exit(1); }
  https.get('https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata?apiKey=' + KEY, function (res) {
    var buf=''; res.on('data',d=>buf+=d); res.on('end',function(){
      try { extractStations(JSON.parse(buf)).forEach(function(s){ console.log(s.station + '  [' + s.lines.join(',') + ']'); }); }
      catch(e){ console.error('parse: '+e.message); process.exit(1); }
    });
  }).on('error', e => { console.error(e); process.exit(1); });
}
module.exports = { extractStations: extractStations };
if (require.main === module) main();
