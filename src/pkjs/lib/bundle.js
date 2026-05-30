function putStr(arr, s, n) {
  for (var i = 0; i < n; i++) arr.push(i < s.length ? (s.charCodeAt(i) & 0xff) : 0);
}
function putU16(arr, v) { v = v < 0 ? 0 : (v > 65535 ? 65535 : v); arr.push(v & 0xff, (v >> 8) & 0xff); }
function putU32(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }

// The borough each (route, N/S) direction heads toward — the label shown above
// the destination headsign. Codes: 0 Manhattan, 1 Brooklyn, 2 Queens, 3 Bronx,
// 4 none. "none" is for lines whose two ends sit in the same borough (the
// shuttles, SIR) where a borough word can't pick a direction; the headsign does.
var MAN = 0, BKN = 1, QNS = 2, BRX = 3, NONE = 4;
var DIR = {
  '1': { N: BRX, S: MAN }, '2': { N: BRX, S: BKN }, '3': { N: MAN, S: BKN },
  '4': { N: BRX, S: BKN }, '5': { N: BRX, S: BKN }, '6': { N: BRX, S: MAN },
  '7': { N: QNS, S: MAN },
  'A': { N: MAN, S: QNS }, 'C': { N: MAN, S: BKN }, 'E': { N: QNS, S: MAN },
  'B': { N: BRX, S: BKN }, 'D': { N: BRX, S: BKN }, 'F': { N: QNS, S: BKN },
  'M': { N: NONE, S: NONE },
  'G': { N: QNS, S: BKN },
  'J': { N: QNS, S: MAN }, 'Z': { N: QNS, S: MAN },
  'N': { N: QNS, S: BKN }, 'Q': { N: MAN, S: BKN }, 'R': { N: QNS, S: BKN }, 'W': { N: QNS, S: MAN },
  'L': { N: MAN, S: BKN },
  'S': { N: NONE, S: NONE }, 'SIR': { N: NONE, S: NONE }
};
function dirCode(route, dir) {
  var d = DIR[route];
  if (!d) return NONE;
  return dir === 'N' ? d.N : d.S;
}

function encodeBundle(stationId, stationName, lines, epochBase, colorFn) {
  var b = [];
  b.push(3);                       // version
  putU32(b, epochBase);
  putStr(b, stationName, 39);
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
module.exports = { encodeBundle: encodeBundle, _dirCode: dirCode };
