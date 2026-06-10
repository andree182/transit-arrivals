var ID_MAX = 15, NAME_MAX = 47, LABEL_MAX = 23, AGENCY_MAX = 11;

function pushStr(arr, s, max) {
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    var width = c < 128 ? 1 : (c < 2048 ? 2 : 3);
    if (bytes.length + width > max) break;            // never split a character
    if (width === 1) bytes.push(c);
    else if (width === 2) { bytes.push(192 | (c >> 6), 128 | (c & 63)); }
    else { bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
  }
  arr.push(bytes.length);
  for (var j = 0; j < bytes.length; j++) arr.push(bytes[j]);
}

function encodeFavList(nearestPos, favs) {
  var out = [nearestPos & 255, favs.length & 255];
  for (var i = 0; i < favs.length; i++) {
    pushStr(out, favs[i].id || '', ID_MAX);
    pushStr(out, favs[i].name || '', NAME_MAX);
    pushStr(out, favs[i].label || '', LABEL_MAX);
    pushStr(out, favs[i].agency || '', AGENCY_MAX);   // agency for collision-free (agency,id) lookup
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
    else if ((c & 224) === 192 && pos.i < end) {
      s += String.fromCharCode(((c & 31) << 6) | (b[pos.i++] & 63));
    } else if (pos.i + 1 < end) {
      var c2 = b[pos.i++] & 63, c3 = b[pos.i++] & 63;
      s += String.fromCharCode(((c & 15) << 12) | (c2 << 6) | c3);
    } else break;                                     // truncated trailing bytes
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
    // agency reads '' on a short/legacy 3-field blob (readStr returns '' at end-of-buffer).
    favs.push({ id: readStr(b, pos), name: readStr(b, pos), label: readStr(b, pos), agency: readStr(b, pos) });
  }
  return { nearestPos: nearestPos, favs: favs };
}

module.exports = { encodeFavList: encodeFavList, decodeFavList: decodeFavList };
