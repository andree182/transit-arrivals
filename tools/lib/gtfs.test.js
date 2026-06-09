const { test } = require('node:test');
const assert = require('node:assert');
const { splitCsv, parseCsv } = require('./gtfs.js');

test('splitCsv handles quoted fields and escaped quotes', () => {
  assert.deepStrictEqual(splitCsv('a,b,c'), ['a', 'b', 'c']);
  assert.deepStrictEqual(splitCsv('"a,1",b,"c ""x"""'), ['a,1', 'b', 'c "x"']);
});

test('parseCsv maps header to row objects and tolerates CRLF', () => {
  const rows = parseCsv('stop_id,stop_name\r\n1,"Downtown"\r\n2,Airport\r\n');
  assert.deepStrictEqual(rows, [{ stop_id: '1', stop_name: 'Downtown' }, { stop_id: '2', stop_name: 'Airport' }]);
});
