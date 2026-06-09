import { expect, test } from 'vitest';
import { transformETD, transformRT, transformAlerts, ROUTE_MAP } from '../src/agencies/bart.js';

const NOW = 1781030000;

const ETD = { root: { station: [ {
  name: 'Montgomery St.', abbr: 'MONT',
  etd: [
    { destination: 'Antioch', abbreviation: 'ANTC', estimate: [
      { minutes: '7',  platform: '2', direction: 'North', length: '9', color: 'YELLOW', hexcolor: '#ffff33', cancelflag: '0' },
      { minutes: '27', platform: '2', direction: 'North', length: '9', color: 'YELLOW', hexcolor: '#ffff33', cancelflag: '0' } ] },
    { destination: 'Daly City', abbreviation: 'DALY', estimate: [
      { minutes: 'Leaving', platform: '1', direction: 'South', length: '8', color: 'GREEN', hexcolor: '#339933', cancelflag: '0' } ] },
    { destination: 'SFO', abbreviation: 'SFIA', estimate: [
      { minutes: '4', platform: '1', direction: 'South', length: '8', color: 'YELLOW', hexcolor: '#ffff33', cancelflag: '1' } ] }  // cancelled -> dropped
  ] } ] } };

test('transformETD groups by line color, splits direction, Leaving->now, drops cancelled', () => {
  const { epoch, model } = transformETD(ETD, NOW);
  expect(epoch).toBe(NOW);
  const yl = model.find(l => l.line === 'Yl');
  expect(yl.color).toEqual([255, 255, 51]);
  const north = yl.directions.find(d => d.dest === 'Antioch');
  expect(north.label).toBe('');
  expect(north.exp).toEqual([false, false]);
  expect(north.times).toEqual([NOW + 7 * 60, NOW + 27 * 60]);
  // the cancelled SFO/Yellow-South estimate was dropped, so Yellow has only the North bucket
  expect(yl.directions.length).toBe(1);
  const gn = model.find(l => l.line === 'Gn');
  expect(gn.directions[0].times).toEqual([NOW]);            // "Leaving" -> now
  expect(gn.directions[0].dest).toBe('Daly City');
});
