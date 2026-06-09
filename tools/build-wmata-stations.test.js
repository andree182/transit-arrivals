const { test } = require('node:test');
const assert = require('node:assert');
const { buildStations } = require('./build-wmata-stations');

test('merges transfer-station codes into a comma-joined id with unioned lines', () => {
  const out = buildStations([
    { Code:'A01', Name:'Metro Center', Lat:38.8983, Lon:-77.0281, LineCode1:'RD' },
    { Code:'C01', Name:'Metro Center', Lat:38.8983, Lon:-77.0281, LineCode1:'BL', LineCode2:'OR', LineCode3:'SV' },
    { Code:'B11', Name:'Glenmont', Lat:39.1119, Lon:-77.0524, LineCode1:'RD' }
  ]);
  const mc = out.find(s => s.name === 'Metro Center');
  assert.strictEqual(mc.id, 'A01,C01');                       // comma-joined, sorted
  assert.deepStrictEqual(mc.lines, ['Rd','Or','Sv','Bl']);    // unioned, in ORDER
  assert.strictEqual(mc.agency, 'wmata');
  const gl = out.find(s => s.name === 'Glenmont');
  assert.strictEqual(gl.id, 'B11');                           // single-code station
  assert.deepStrictEqual(gl.lines, ['Rd']);
});

test('drops stations with no valid lines or bad coords', () => {
  const out = buildStations([{ Code:'X', Name:'Bad', Lat:'nope', Lon:'nope' }]);
  assert.strictEqual(out.length, 0);
});
