const { test } = require('node:test'); const assert = require('node:assert');
const { extractStations } = require('./build-marta-stations');
test('lists distinct exact station names with their lines', () => {
  const out = extractStations([
    { STATION:'FIVE POINTS STATION', LINE:'BLUE' },
    { STATION:'five points station', LINE:'GREEN' },   // case-insensitive merge
    { STATION:'MIDTOWN STATION', LINE:'RED' }
  ]);
  const fp = out.find(s => s.station === 'FIVE POINTS STATION');
  assert.deepStrictEqual(fp.lines.sort(), ['Bl','Gn']);
  assert.ok(out.find(s => s.station === 'MIDTOWN STATION'));
});
