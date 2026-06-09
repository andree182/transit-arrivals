// Encode a JS string to UTF-8 bytes. charCodeAt-&-0xff truncates multi-byte
// code points to a single Latin-1 byte (e.g. "·" U+00B7 -> a lone 0xB7), which
// is invalid UTF-8 and makes the watch's graphics_draw_text drop the whole string
// (the station footer's "· CTA"/"· Metro" suffix). Emit real UTF-8 instead.
function utf8Bytes(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return out;
}
function putStr(arr, s, n) {
  var b = utf8Bytes(String(s == null ? '' : s));
  if (b.length > n) {
    b = b.slice(0, n);
    // Don't leave a partial multi-byte sequence at the cut: drop trailing
    // continuation bytes, then a now-incomplete lead byte.
    var i = b.length;
    while (i > 0 && (b[i - 1] & 0xC0) === 0x80) i--;
    if (i > 0 && (b[i - 1] & 0x80)) {
      var lead = b[i - 1], need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
      if (b.length - (i - 1) < need) i--;
    }
    b = b.slice(0, i);
  }
  for (var k = 0; k < n; k++) arr.push(k < b.length ? b[k] : 0);
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
