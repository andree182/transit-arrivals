const { test } = require('node:test');
const assert = require('node:assert');
const { mergeStations, slugify } = require('./build-septa-stations');

test('slugify produces septa-<kebab> ids', () => {
  assert.strictEqual(slugify('30th Street Station'), 'septa-30th-street-station');
  assert.strictEqual(slugify('8th & Market'), 'septa-8th-market');
  assert.strictEqual(slugify('69th St Transit Center'), 'septa-69th-st-transit-center');
});

test('merges 30th Street: RR + L + T into one entry', () => {
  const rapid = [
    { route: 'L1', label: 'L', el: true, stopid: '21532', stopname: 'Drexel Station at 30th St', lat: 39.9548, lon: -75.1833 },
    { route: 'T1', label: 'T', el: false, stopid: '30001', stopname: '30th Street', lat: 39.9549, lon: -75.1831 }
  ];
  const rr = [{ name: '30th Street Station', lat: 39.9554, lon: -75.1820 }];
  const { phone, fanout } = mergeStations(rapid, rr);
  const hub = phone.find(s => /30th/.test(s.name));
  assert.ok(hub, 'hub exists');
  // union must contain L and T at minimum
  assert.ok(hub.lines.includes('L') && hub.lines.includes('T'));
  assert.strictEqual(hub.agency, 'septa');
  const fe = fanout[hub.id];
  assert.strictEqual(fe.rr, '30th Street Station');     // exact RR name
  assert.ok(fe.rt.includes('30001'));                   // trolley stopid in rt
  assert.ok(!fe.rt.includes('21532'));                  // El stopid NOT in rt
  assert.ok(fe.el.includes('L'));                       // L is el-only
  assert.ok(fe.routes.includes('L1') && fe.routes.includes('T1'));
});

test('merges 8th & Market: L + B (no RR)', () => {
  const rapid = [
    { route: 'L1', label: 'L', el: true, stopid: '728', stopname: '8th St', lat: 39.9514, lon: -75.1533 },
    { route: 'B3', label: 'B', el: true, stopid: '316', stopname: '8th St', lat: 39.9519, lon: -75.1583 }
  ];
  const { phone, fanout } = mergeStations(rapid, []);
  const hub = phone.find(s => /8th/.test(s.name));
  assert.ok(hub.lines.includes('L') && hub.lines.includes('B'));
  const fe = fanout[hub.id];
  assert.strictEqual(fe.rr, null);
  assert.deepStrictEqual(fe.rt, []);                    // both are el-only -> no rt
  assert.ok(fe.el.includes('L') && fe.el.includes('B'));
});

test('merges 69th St Transit Center: L + M + T', () => {
  const rapid = [
    { route: 'L1', label: 'L', el: true,  stopid: '20845', stopname: '69th St Transit Center', lat: 39.9625, lon: -75.2586 },
    { route: 'M1', label: 'M', el: false, stopid: '1937',  stopname: '69th Street', lat: 39.9623, lon: -75.2588 },
    { route: 'T1', label: 'T', el: false, stopid: '30002', stopname: '69th St', lat: 39.9626, lon: -75.2585 }
  ];
  const { phone, fanout } = mergeStations(rapid, []);
  const hub = phone.find(s => /69th/.test(s.name));
  assert.ok(['L', 'M', 'T'].every(l => hub.lines.includes(l)));
  const fe = fanout[hub.id];
  assert.ok(fe.rt.includes('1937') && fe.rt.includes('30002'));  // M + T have rt
  assert.ok(!fe.rt.includes('20845'));                           // L el-only
  assert.ok(fe.el.includes('L'));
});

test('merges City Hall / 15th St: B + T', () => {
  const rapid = [
    { route: 'B1', label: 'B', el: true,  stopid: '50', stopname: 'City Hall', lat: 39.9525, lon: -75.1635 },
    { route: 'T1', label: 'T', el: false, stopid: '1392', stopname: '15th St/City Hall', lat: 39.9526, lon: -75.1653 }
  ];
  const { phone, fanout } = mergeStations(rapid, []);
  const hub = phone.find(s => /City Hall|15th/.test(s.name));
  assert.ok(hub.lines.includes('B') && hub.lines.includes('T'));
  const fe = fanout[hub.id];
  assert.ok(fe.el.includes('B'));
  assert.ok(fe.rt.includes('1392'));
});
