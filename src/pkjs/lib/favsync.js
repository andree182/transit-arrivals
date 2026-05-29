var ID_MAX = 15, NAME_MAX = 47, LABEL_MAX = 23;

function pushStr(arr, s, max) {
  var bytes = [];
  for (var i = 0; i < s.length && bytes.length < max; i++) {
    var c = s.charCodeAt(i);
    if (c < 128) bytes.push(c);                       // ASCII fast path
    else if (c < 2048) { bytes.push(192 | (c >> 6), 128 | (c & 63)); }
    else { bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
  }
  if (bytes.length > max) bytes = bytes.slice(0, max);
  arr.push(bytes.length);
  for (var j = 0; j < bytes.length; j++) arr.push(bytes[j]);
}

function encodeFavList(nearestPos, favs) {
  var out = [nearestPos & 255, favs.length & 255];
  for (var i = 0; i < favs.length; i++) {
    pushStr(out, favs[i].id || '', ID_MAX);
    pushStr(out, favs[i].name || '', NAME_MAX);
    pushStr(out, favs[i].label || '', LABEL_MAX);
  }
  return new Uint8Array(out);
}

function readStr(b, pos) {
  var len = b[pos.i++];
  var s = '';
  var end = pos.i + len;
  while (pos.i < end) {
    var c = b[pos.i++];
    if (c < 128) s += String.fromCharCode(c);
    else if ((c & 224) === 192) { s += String.fromCharCode(((c & 31) << 6) | (b[pos.i++] & 63)); }
    else { var c2 = b[pos.i++] & 63, c3 = b[pos.i++] & 63; s += String.fromCharCode(((c & 15) << 12) | (c2 << 6) | c3); }
  }
  return s;
}

function decodeFavList(bytes) {
  var b = bytes;
  var pos = { i: 0 };
  var nearestPos = b[pos.i++];
  var count = b[pos.i++];
  var favs = [];
  for (var i = 0; i < count; i++) {
    favs.push({ id: readStr(b, pos), name: readStr(b, pos), label: readStr(b, pos) });
  }
  return { nearestPos: nearestPos, favs: favs };
}

module.exports = { encodeFavList: encodeFavList, decodeFavList: decodeFavList };
