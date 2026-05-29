function putStr(arr, s, n) {
  for (var i = 0; i < n; i++) arr.push(i < s.length ? (s.charCodeAt(i) & 0xff) : 0);
}
function putU16(arr, v) { v = v < 0 ? 0 : (v > 65535 ? 65535 : v); arr.push(v & 0xff, (v >> 8) & 0xff); }
function putU32(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }

// Lines where N/S don't map cleanly to uptown/downtown (crosstown, shuttles,
// Staten Island). For these the destination headsign alone disambiguates.
var NO_NS = { 'L': 1, 'G': 1, '7': 1, 'S': 1, 'SIR': 1 };
function dirCode(route, dir) {
  if (NO_NS[route]) return 2;          // 2 = no direction word
  return dir === 'N' ? 0 : 1;          // 0 = uptown, 1 = downtown
}

function encodeBundle(stationId, stationName, lines, epochBase, colorFn) {
  var b = [];
  b.push(2);                       // version
  putU32(b, epochBase);
  putStr(b, stationName, 24);
  putStr(b, stationId, 11);
  b.push(lines.length & 0xff);
  lines.forEach(function (ln) {
    putStr(b, ln.line, 2);
    var c = colorFn(ln.line); b.push(c[0], c[1], c[2]);
    b.push(ln.directions.length & 0xff);
    ln.directions.forEach(function (d) {
      putStr(b, d.dest, 20);
      b.push(dirCode(ln.line, d.dir));
      var times = d.times.slice(0, 6);
      b.push(times.length & 0xff);
      times.forEach(function (t) { putU16(b, t - epochBase); });
    });
  });
  return Uint8Array.from(b);
}
module.exports = { encodeBundle, _dirCode: dirCode };
