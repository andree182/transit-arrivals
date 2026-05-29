function putStr(arr, s, n) {
  for (var i = 0; i < n; i++) arr.push(i < s.length ? (s.charCodeAt(i) & 0xff) : 0);
}
function putU16(arr, v) { v = v < 0 ? 0 : (v > 65535 ? 65535 : v); arr.push(v & 0xff, (v >> 8) & 0xff); }
function putU32(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }

function encodeBundle(stationName, lines, epochBase, colorFn) {
  var b = [];
  b.push(1);                       // version
  putU32(b, epochBase);
  putStr(b, stationName, 24);
  b.push(lines.length & 0xff);
  lines.forEach(function (ln) {
    putStr(b, ln.line, 2);
    var c = colorFn(ln.line); b.push(c[0], c[1], c[2]);
    b.push(ln.directions.length & 0xff);
    ln.directions.forEach(function (d) {
      putStr(b, d.dest, 20);
      var times = d.times.slice(0, 6);
      b.push(times.length & 0xff);
      times.forEach(function (t) { putU16(b, t - epochBase); });
    });
  });
  return Uint8Array.from(b);
}
module.exports = { encodeBundle };
