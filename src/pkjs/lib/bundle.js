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
// Trim a UTF-8 byte array to at most n bytes without splitting a multi-byte
// sequence (drop trailing continuation bytes, then a now-incomplete lead byte).
function clampUtf8(b, n) {
  if (b.length <= n) return b;
  b = b.slice(0, n);
  var i = b.length;
  while (i > 0 && (b[i - 1] & 0xC0) === 0x80) i--;
  if (i > 0 && (b[i - 1] & 0x80)) {
    var lead = b[i - 1], need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
    if (b.length - (i - 1) < need) i--;
  }
  return b.slice(0, i);
}
function putStr(arr, s, n) {
  var b = clampUtf8(utf8Bytes(String(s == null ? '' : s)), n);
  for (var k = 0; k < n; k++) arr.push(k < b.length ? b[k] : 0);
}
function putU16(arr, v) { v = v < 0 ? 0 : (v > 65535 ? 65535 : v); arr.push(v & 0xff, (v >> 8) & 0xff); }
function putU32(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }

function encodeBundle(stationId, stationName, lines, epochBase) {
  var b = [];
  b.push(8);                       // version
  putU32(b, epochBase);
  putStr(b, stationName, 39);
  putStr(b, stationId, 23);        // v8: fits a 4-mapid CTA complex (4*5 + 3 commas)
  b.push(lines.length & 0xff);
  lines.forEach(function (ln) {
    putStr(b, ln.line, 2);
    var c = ln.color || [255, 255, 255]; b.push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff);
    var dirs = ln.directions || [];
    b.push(dirs.length & 0xff);
    b.push(ln.sched ? 1 : 0);          // v7: per-line scheduled-times flag
    if (dirs.length === 0) {
      // Variable-length, byte-length-prefixed UTF-8 (max 80 bytes -> watch's
      // 81-byte buffer). UTF-8 (not Latin-1) so non-ASCII alert/notice text
      // (em-dash, accents) renders on-watch instead of garbling.
      var nb = clampUtf8(utf8Bytes(String(ln.notice || '')), 80);
      b.push(nb.length & 0xff);
      for (var i = 0; i < nb.length; i++) b.push(nb[i]);
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
