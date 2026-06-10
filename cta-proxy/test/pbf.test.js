import { expect, test } from 'vitest';
import { readVarint, readFields } from '../src/pbf.js';

test('readVarint decodes multi-byte varints past 32 bits', () => {
  // 1781024258 = 0x6A2B... encode little-endian base-128
  const n = 1781024258;
  const bytes = [];
  let v = n;
  while (v > 0x7f) { bytes.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  bytes.push(v);
  const pos = { i: 0 };
  expect(readVarint(new Uint8Array(bytes), pos)).toBe(n);
  expect(pos.i).toBe(bytes.length);
});

test('readFields parses a varint field and a length-delimited field', () => {
  // field 1, wiretype 0, value 5  -> tag 0x08, 0x05
  // field 2, wiretype 2, len 3, "abc" -> tag 0x12, 0x03, 61 62 63
  const buf = new Uint8Array([0x08, 0x05, 0x12, 0x03, 0x61, 0x62, 0x63]);
  const fields = readFields(buf, 0, buf.length);
  expect(fields[0]).toMatchObject({ fieldNum: 1, wireType: 0, value: 5 });
  expect(fields[1]).toMatchObject({ fieldNum: 2, wireType: 2, start: 4, end: 7 });
});

test('readFields skips a deprecated group (incl. nested) and still decodes later fields', () => {
  // field 3 SGROUP (tag 0x1B), containing:
  //   field 1 varint 7            -> 0x08 0x07
  //   field 4 nested SGROUP       -> 0x23
  //     field 1 varint 1          -> 0x08 0x01
  //   field 4 EGROUP              -> 0x24
  // field 3 EGROUP (tag 0x1C)
  // field 5 varint 9              -> 0x28 0x09  (must survive the skip)
  const buf = new Uint8Array([0x1b, 0x08, 0x07, 0x23, 0x08, 0x01, 0x24, 0x1c, 0x28, 0x09]);
  const fields = readFields(buf, 0, buf.length);
  expect(fields).toEqual([{ fieldNum: 5, wireType: 0, value: 9 }]);
});

test('readFields still throws on truly invalid wire types', () => {
  const buf = new Uint8Array([0x0e]);              // field 1, wire type 6
  expect(() => readFields(buf, 0, buf.length)).toThrow(/wire type/);
});

test('readVarint handles values > 2^32 (int64 timestamps)', () => {
  const n = 4294967297; // 2^32 + 1
  const bytes = [];
  let v = n;
  while (v > 0x7f) { bytes.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  bytes.push(v);
  const pos = { i: 0 };
  expect(readVarint(new Uint8Array(bytes), pos)).toBe(n);
});
