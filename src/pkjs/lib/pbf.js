function readVarint(buf, pos) {
  var result = 0, shift = 0, b;
  do {
    b = buf[pos.i++];
    result += (b & 0x7f) * Math.pow(2, shift); // avoid 32-bit overflow on times
    shift += 7;
  } while (b & 0x80);
  return result;
}

// Reads all top-level fields in [start,end). Returns array of
// { fieldNum, wireType, value (varint), start,end (for length-delimited) }.
function readFields(buf, start, end) {
  var pos = { i: start }, out = [];
  while (pos.i < end) {
    var tag = readVarint(buf, pos);
    var fieldNum = tag >>> 3, wireType = tag & 0x7;
    if (wireType === 0) {
      out.push({ fieldNum: fieldNum, wireType: 0, value: readVarint(buf, pos) });
    } else if (wireType === 2) {
      var len = readVarint(buf, pos);
      out.push({ fieldNum: fieldNum, wireType: 2, start: pos.i, end: pos.i + len });
      pos.i += len;
    } else if (wireType === 5) { pos.i += 4; }
      else if (wireType === 1) { pos.i += 8; }
      else { throw new Error('unsupported wire type ' + wireType); }
  }
  return out;
}
module.exports = { readVarint: readVarint, readFields: readFields };
