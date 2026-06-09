#!/usr/bin/env node
'use strict';
var https = require('https');
var fs = require('fs');
var os = require('os');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

// Metro/trolley/NHSL routes we query for stops. el:true => El/BSL (no live arrivals).
// B2 omitted: SEPTA Stops API returns no stops for it; ROUTE_MAP still recognizes B2 trips if service resumes.
var ROUTES = [
  { route: 'L1', label: 'L', el: true },
  { route: 'B1', label: 'B', el: true },
  { route: 'B3', label: 'B', el: true },
  { route: 'M1', label: 'M', el: false },
  { route: 'T1', label: 'T', el: false },
  { route: 'T2', label: 'T', el: false },
  { route: 'T3', label: 'T', el: false },
  { route: 'T4', label: 'T', el: false },
  { route: 'T5', label: 'T', el: false },
  { route: 'G1', label: 'G', el: false },
  { route: 'D1', label: 'D', el: false },
  { route: 'D2', label: 'D', el: false }
];

var RR_LABELS = {
  'Airport': 'AI', 'Chestnut Hill East': 'CE', 'Chestnut Hill West': 'CW',
  'Cynwyd': 'CY', 'Fox Chase': 'FC', 'Lansdale/Doylestown': 'LD',
  'Media/Wawa': 'MW', 'Manayunk/Norristown': 'MN', 'Paoli/Thorndale': 'PT',
  'Trenton': 'TR', 'Warminster': 'WA', 'Wilmington/Newark': 'WN', 'West Trenton': 'WT'
};

// Multimodal interchanges where the RR station name differs from the rapid-transit
// hub name. Maps RR stop_name -> the rapid hub name it should merge into. Without
// this, 30th Street RR (pin ~248m from the El/trolley platforms, different name)
// would not merge. Pure proximity is deliberately NOT used for RR (it false-merged
// unrelated stops), so these are the only RR→rapid merges.
var RR_HUB_ALIAS = {
  '30th Street Station': 'Drexel Station at 30th St'
};

function slugify(name) {
  // Plain kebab: lowercase, & -> space, collapse non-alphanumerics to hyphens.
  // '30th Street Station' -> 'septa-30th-street-station'; '8th & Market' -> 'septa-8th-market'.
  var s = String(name || '').toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return 'septa-' + s;
}

function norm(name) {
  return String(name || '').toLowerCase()
    .replace(/\bstation\b|\btransit center\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function haversine(aLat, aLon, bLat, bLon) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (bLat - aLat) * toRad, dLon = (bLon - aLon) * toRad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(aLat * toRad) * Math.cos(bLat * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

var MERGE_M = 200;  // <~150m target; 200m tolerance for differing platform pins

// rapidStops: [{route,label,el,stopid,stopname,lat,lon}]
// rrStations: [{name,lat,lon}]
// -> { phone:[{id,name,lat,lon,lines,agency}], fanout:{slug:{rr,rt,el,routes}} }
function mergeStations(rapidStops, rrStations) {
  var hubs = [];  // {name, lat, lon, lines:{}, rt:{}, el:{}, routes:{}, rr:null}

  function findHub(name, lat, lon) {
    var nn = norm(name);
    var hasCoord = isFinite(lat) && isFinite(lon);
    for (var i = 0; i < hubs.length; i++) {
      var h = hubs[i];
      var dist = (hasCoord && isFinite(h.lat) && isFinite(h.lon))
        ? haversine(lat, lon, h.lat, h.lon) : Infinity;
      // Merge when physically close, OR same normalized name within a looser 600m
      // (handles platform pins that differ but share a name, e.g. El vs RR at 30th).
      if (dist < MERGE_M) return h;
      if (nn && norm(h.name) === nn && dist < 600) return h;
    }
    return null;
  }

  (rapidStops || []).forEach(function (s) {
    var lat = +s.lat, lon = +s.lon;
    var h = findHub(s.stopname, lat, lon);
    if (!h) { h = { name: s.stopname, lat: lat, lon: lon, lines: {}, rt: {}, el: {}, routes: {}, rr: null }; hubs.push(h); }
    h.lines[s.label] = 1;
    h.routes[s.route] = 1;
    if (s.el) h.el[s.label] = 1; else h.rt[s.stopid] = 1;
  });

  // RR merges into a rapid hub ONLY by name (exact normalized match, or an
  // explicit interchange alias), confirmed within a generous 700m radius. Blind
  // proximity is NOT used for RR: a trolley stop and an RR station can sit <200m
  // apart yet be unrelated (e.g. RR "49th St" vs the Chester Av trolley), so a
  // pure-distance merge produced false positives. The alias table captures the
  // handful of true multimodal interchanges whose RR and rapid names differ.
  function findRRHub(name, lat, lon) {
    var nn = norm(name);
    var alias = RR_HUB_ALIAS[name];
    var an = alias ? norm(alias) : null;
    var hasCoord = isFinite(lat) && isFinite(lon);
    for (var i = 0; i < hubs.length; i++) {
      var h = hubs[i];
      var hn = norm(h.name);
      if (hn !== nn && (an == null || hn !== an)) continue;   // name must match (or alias)
      var dist = (hasCoord && isFinite(h.lat) && isFinite(h.lon))
        ? haversine(lat, lon, h.lat, h.lon) : 0;
      if (dist < 700) return h;
    }
    return null;
  }

  (rrStations || []).forEach(function (st) {
    var lat = +st.lat, lon = +st.lon;
    var h = findRRHub(st.name, lat, lon);
    if (!h) { h = { name: st.name, lat: lat, lon: lon, lines: {}, rt: {}, el: {}, routes: {}, rr: null }; hubs.push(h); }
    h.rr = st.name;                  // exact RR name for the Arrivals query
    // RR lines are attached at runtime by the resolver; for directory `lines` we
    // add a generic "RR" only if the hub is RR-only, else metro letters dominate.
  });

  var phone = [], fanout = {};
  hubs.forEach(function (h) {
    var labels = Object.keys(h.lines).sort();
    if (h.rr) labels = labels.concat(['RR']);      // RR service -> generic RR bullet (incl. multimodal hubs)
    var id = slugify(h.name);
    // de-dupe slug collisions deterministically
    var base = id, k = 2; while (fanout[id]) { id = base + '-' + (k++); }
    phone.push({ id: id, name: h.name, lat: h.lat, lon: h.lon, lines: labels, agency: 'septa' });
    fanout[id] = {
      rr: h.rr,
      rt: Object.keys(h.rt).sort(),
      el: Object.keys(h.el).sort(),
      routes: Object.keys(h.routes).sort()
    };
  });
  phone.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return { phone: phone, fanout: fanout };
}

function get(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'mta-arrivals-builder' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
      var buf = ''; res.on('data', function (d) { buf += d; });
      res.on('end', function () { resolve(buf); });
    }).on('error', reject);
  });
}

function getBinary(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'mta-arrivals-builder' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getBinary(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
      var chunks = []; res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

// Sleep helper for retry backoff on the throttled SEPTA Stops API.
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Minimal CSV line splitter (handles quoted fields).
function parseCSV(text) {
  var lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  var head = splitCSVLine(lines[0]);
  return lines.slice(1).map(function (l) {
    var cells = splitCSVLine(l), row = {};
    head.forEach(function (h, i) { row[h] = cells[i]; });
    return row;
  });
}
function splitCSVLine(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur);
  return out;
}

// The Arrivals API rejects the rail GTFS color-prefixed name for 30th Street;
// map it (and any other known mismatches) to a query-valid station name.
var RR_NAME_FIX = {
  'Gray 30th St Station': '30th Street Station'
};

// Fetch the SEPTA RR station list. The septadev/GTFS repo serves data only as a
// release asset gtfs_public.zip whose payload is a NESTED google_rail.zip; we
// download it, extract google_rail/stops.txt via `unzip`, and parse it. The rail
// GTFS stop_name is (with one documented fix) a valid Arrivals-API station name.
// Degrades to [] (rapid-transit-only directory) if anything in the chain fails.
async function fetchRRStations() {
  // Resolve the latest release asset URL from the GitHub API (default_branch=master).
  var assetUrl = null;
  try {
    var rel = JSON.parse(await get('https://api.github.com/repos/septadev/GTFS/releases/latest'));
    (rel.assets || []).forEach(function (a) {
      if (/gtfs_public\.zip$/i.test(a.name)) assetUrl = a.browser_download_url;
    });
  } catch (e) { console.error('RR release lookup failed: ' + e.message); }
  // Fallbacks: SEPTA's own mirror, then a fixed release URL pattern.
  var candidates = [assetUrl, 'https://www3.septa.org/developer/gtfs_public.zip'].filter(Boolean);

  for (var i = 0; i < candidates.length; i++) {
    var tmp = null;
    try {
      var zipBuf = await getBinary(candidates[i]);
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'septa-gtfs-'));
      var outerZip = path.join(tmp, 'gtfs_public.zip');
      fs.writeFileSync(outerZip, zipBuf);
      // gtfs_public.zip contains google_rail.zip (a nested zip); extract both.
      execFileSync('unzip', ['-o', outerZip, 'google_rail.zip', '-d', tmp], { stdio: 'ignore' });
      var railZip = path.join(tmp, 'google_rail.zip');
      var csv = execFileSync('unzip', ['-p', railZip, 'stops.txt']).toString('utf8');
      var rows = parseCSV(csv);
      if (!rows.length || !('stop_name' in rows[0])) { cleanup(tmp); continue; }
      var rr = [], seen = {};
      rows.forEach(function (row) {
        var nm = row.stop_name;
        if (!nm) return;
        nm = RR_NAME_FIX[nm] || nm;
        if (!seen[nm]) { seen[nm] = 1; rr.push({ name: nm, lat: +row.stop_lat, lon: +row.stop_lon }); }
      });
      cleanup(tmp);
      if (rr.length) { console.error('RR stops from ' + candidates[i] + ' (' + rr.length + ')'); return rr; }
    } catch (e) {
      console.error('RR candidate failed (' + candidates[i] + '): ' + e.message);
      if (tmp) cleanup(tmp);
    }
  }
  console.error('RR stops fetch failed on all candidates; writing rapid-only directory');
  return [];
}

function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

async function main() {
  // 1) rapid-transit/trolley/NHSL stops per route
  var rapid = [], stopnames = {};
  for (var i = 0; i < ROUTES.length; i++) {
    var r = ROUTES[i];
    var arr = null;
    // The Stops API throttles (transient HTTP 501) under rapid sequential hits;
    // retry a few times with backoff before skipping the route.
    for (var attempt = 0; attempt < 4 && arr == null; attempt++) {
      if (attempt > 0) await sleep(800 * attempt);
      try {
        var body = await get('https://www3.septa.org/api/Stops/index.php?req1=' + encodeURIComponent(r.route));
        var parsed = JSON.parse(body);
        if (Array.isArray(parsed)) arr = parsed;
      } catch (e) {
        if (attempt === 3) console.error('skip route ' + r.route + ': ' + e.message);
      }
    }
    if (!arr) continue;
    arr.forEach(function (s) {
      rapid.push({ route: r.route, label: r.label, el: r.el,
        stopid: String(s.stopid), stopname: s.stopname, lat: +s.lat, lon: +s.lng });
      if (!r.el) stopnames[String(s.stopid)] = s.stopname;   // rt terminals only
    });
    await sleep(300);   // be polite between routes
  }

  // 2) RR station list from GTFS stops.txt (parent stops / plain stops)
  var rr = await fetchRRStations();

  var merged = mergeStations(rapid, rr);

  var phoneDst = path.join(__dirname, '..', 'src', 'pkjs', 'lib', 'septa.stations.json');
  var fanoutDst = path.join(__dirname, '..', 'cta-proxy', 'src', 'agencies', 'septa-stations.json');
  var namesDst = path.join(__dirname, '..', 'cta-proxy', 'src', 'agencies', 'septa-stopnames.json');
  fs.writeFileSync(phoneDst, JSON.stringify(merged.phone, null, 0) + '\n');
  fs.writeFileSync(fanoutDst, JSON.stringify(merged.fanout, null, 0) + '\n');
  fs.writeFileSync(namesDst, JSON.stringify(stopnames, null, 0) + '\n');
  console.log('wrote ' + merged.phone.length + ' SEPTA stations + fanout + ' +
    Object.keys(stopnames).length + ' stop names');
}

module.exports = { mergeStations: mergeStations, slugify: slugify };
if (require.main === module) main();
