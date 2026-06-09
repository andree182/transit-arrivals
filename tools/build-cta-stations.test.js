const { test } = require('node:test'); const assert = require('node:assert');
const { mergeComplexes } = require('./build-cta-stations');

test('merges connected CTA complexes into one comma-id entry with unioned lines', () => {
  const out = mergeComplexes([
    { id:'40070', name:'Jackson', lat:41.878, lon:-87.629, lines:['Bl'], agency:'cta' },
    { id:'40560', name:'Jackson', lat:41.878, lon:-87.627, lines:['Rd'], agency:'cta' },
    { id:'40850', name:'Harold Washington Library', lat:41.876, lon:-87.628, lines:['Br','Or','Pk','Pr'], agency:'cta' },
    { id:'40380', name:'Clark/Lake', lat:41.886, lon:-87.631, lines:['Bl','Br','Gr','Or','Pk','Pr'], agency:'cta' }
  ], [{ ids:['40070','40560','40850'], name:'Jackson/Library' }]);
  const jx = out.find(s => s.name === 'Jackson/Library');
  assert.strictEqual(jx.id, '40070,40560,40850');
  assert.deepStrictEqual(jx.lines, ['Rd','Bl','Br','Or','Pk','Pr']);   // ORDER: Rd,Bl,Br,Gr,Or,Pk,Pr,Ye
  assert.ok(!out.find(s => s.name === 'Jackson'));                      // originals removed
  assert.ok(out.find(s => s.name === 'Clark/Lake'));                    // untouched
});

test('skips a complex whose members are not present (no-op)', () => {
  const out = mergeComplexes([{ id:'40380', name:'Clark/Lake', lat:1, lon:1, lines:['Bl'], agency:'cta' }],
    [{ ids:['40070','40560'], name:'Jackson' }]);
  assert.strictEqual(out.length, 1);
});
