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
