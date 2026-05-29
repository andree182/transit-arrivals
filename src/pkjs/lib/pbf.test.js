const { test } = require('node:test');
const assert = require('node:assert');
const { readVarint, readFields } = require('./pbf');

test('readVarint decodes a multi-byte value', () => {
  const buf = Uint8Array.from([0xAC, 0x02]); // 300
  const pos = { i: 0 };
  assert.strictEqual(readVarint(buf, pos), 300);
  assert.strictEqual(pos.i, 2);
});

test('readFields yields {fieldNum, wireType, value/bytes}', () => {
  // field 1, varint, value 5  => tag = (1<<3)|0 = 0x08
  const buf = Uint8Array.from([0x08, 0x05]);
  const fields = readFields(buf, 0, buf.length);
  assert.strictEqual(fields[0].fieldNum, 1);
  assert.strictEqual(fields[0].wireType, 0);
  assert.strictEqual(fields[0].value, 5);
});
