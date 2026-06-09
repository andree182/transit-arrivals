function putStr(arr, s, n) {
  for (var i = 0; i < n; i++) arr.push(i < s.length ? (s.charCodeAt(i) & 0xff) : 0);
}
function putU16(arr, v) { v = v < 0 ? 0 : (v > 65535 ? 65535 : v); arr.push(v & 0xff, (v >> 8) & 0xff); }
function putU32(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }

function encodeBundle(stationId, stationName, lines, epochBase) {
  var b = [];
  b.push(6);                       // version
  putU32(b, epochBase);
  putStr(b, stationName, 39);
  putStr(b, stationId, 11);
  b.push(lines.length & 0xff);
  lines.forEach(function (ln) {
    putStr(b, ln.line, 2);
    var c = ln.color || [255, 255, 255]; b.push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff);
    var dirs = ln.directions || [];
    b.push(dirs.length & 0xff);
    if (dirs.length === 0) {
      var notice = ln.notice || '';
      var n = notice.length > 80 ? 80 : notice.length;
      b.push(n & 0xff);
      for (var i = 0; i < n; i++) b.push(notice.charCodeAt(i) & 0xff);
    } else {
      dirs.forEach(function (d) {
        putStr(b, d.dest, 20);
        putStr(b, d.label || '', 10);
        var times = d.times.slice(0, 6);
        b.push(times.length & 0xff);
        times.forEach(function (t) { putU16(b, t - epochBase); });
        // Express bitmask: bit a set => arrival a is an express (diamond) train.
        var exp = d.exp || [];
        var mask = 0;
        for (var k = 0; k < times.length; k++) if (exp[k]) mask |= (1 << k);
        b.push(mask & 0xff);
      });
    }
  });
  return Uint8Array.from(b);
}
module.exports = { encodeBundle: encodeBundle };
