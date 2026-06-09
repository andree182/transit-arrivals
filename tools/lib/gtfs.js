'use strict';
const fs = require('fs');
const path = require('path');

function splitCsv(line) {                 // handles simple quoted fields + "" escapes
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = splitCsv(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsv(line); const o = {};
    head.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });
}
function readDir(dir) {
  const rd = f => parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));
  return {
    stops: rd('stops.txt'), routes: rd('routes.txt'),
    trips: rd('trips.txt'), stopTimes: rd('stop_times.txt')
  };
}
module.exports = { splitCsv, parseCsv, readDir };
