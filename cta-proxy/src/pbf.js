export function readVarint(buf, pos) {
  let result = 0, shift = 0, b;
  do {
    if (pos.i >= buf.length) throw new RangeError('varint overrun at ' + pos.i);
    b = buf[pos.i++];
    result += (b & 0x7f) * Math.pow(2, shift); // avoid 32-bit overflow on int64 times
    shift += 7;
  } while (b & 0x80);
  return result;
}

// Skip a deprecated group (wire type 3): consume nested fields until the matching
// EGROUP (wire type 4) for groupField. Nested groups recurse.
function skipGroup(buf, pos, end, groupField) {
  while (true) {
    if (pos.i >= end) throw new RangeError('group overrun at ' + pos.i);
    const tag = readVarint(buf, pos);
    const fieldNum = tag >>> 3, wireType = tag & 0x7;
    if (wireType === 4) {
      if (fieldNum === groupField) return;             // matching EGROUP ends the skip
      throw new Error('mismatched group end for field ' + fieldNum);
    }
    if (wireType === 0) { readVarint(buf, pos); }
    else if (wireType === 2) {
      const len = readVarint(buf, pos);
      if (pos.i + len > end) throw new RangeError('length-delimited overrun at ' + pos.i);
      pos.i += len;
    } else if (wireType === 5) { pos.i += 4; if (pos.i > end) throw new RangeError('fixed32 overrun'); }
    else if (wireType === 1) { pos.i += 8; if (pos.i > end) throw new RangeError('fixed64 overrun'); }
    else if (wireType === 3) { skipGroup(buf, pos, end, fieldNum); }
    else { throw new Error('unsupported wire type ' + wireType); }
  }
}

// Reads all fields in [start,end). Returns { fieldNum, wireType, value | start,end }.
// Deprecated groups (wire types 3/4) are skipped, not surfaced.
export function readFields(buf, start, end) {
  const pos = { i: start }, out = [];
  while (pos.i < end) {
    const tag = readVarint(buf, pos);
    const fieldNum = tag >>> 3, wireType = tag & 0x7;
    if (wireType === 0) {
      out.push({ fieldNum, wireType: 0, value: readVarint(buf, pos) });
    } else if (wireType === 2) {
      const len = readVarint(buf, pos);
      if (pos.i + len > end) throw new RangeError('length-delimited overrun at ' + pos.i);
      out.push({ fieldNum, wireType: 2, start: pos.i, end: pos.i + len });
      pos.i += len;
    } else if (wireType === 5) { pos.i += 4; if (pos.i > end) throw new RangeError('fixed32 overrun'); }
    else if (wireType === 1) { pos.i += 8; if (pos.i > end) throw new RangeError('fixed64 overrun'); }
    else if (wireType === 3) { skipGroup(buf, pos, end, fieldNum); }
    else if (wireType === 4) { /* stray EGROUP: tag has no payload; consume and continue */ }
    else { throw new Error('unsupported wire type ' + wireType); }
  }
  return out;
}
