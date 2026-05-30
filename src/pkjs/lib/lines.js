var BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';
var PATH_URL = 'https://path.transitdata.nyc/gtfsrt';
// group key -> URL suffix ('' for the 1-7/S group); 'path' is an absolute URL,
// emitted specially in feedUrls.
var GROUPS = {
  '123456': '', '7': '', 's': '',
  'ace': '-ace', 'bdfm': '-bdfm', 'g': '-g',
  'jz': '-jz', 'nqrw': '-nqrw', 'l': '-l', 'si': '-si',
  'path': null
};
var LINE_GROUP = {
  '1':'123456','2':'123456','3':'123456','4':'123456','5':'123456','6':'123456','7':'123456','S':'123456',
  'A':'ace','C':'ace','E':'ace',
  'B':'bdfm','D':'bdfm','F':'bdfm','M':'bdfm',
  'G':'g', 'J':'jz','Z':'jz',
  'N':'nqrw','Q':'nqrw','R':'nqrw','W':'nqrw',
  'L':'l', 'SIR':'si',
  'NW':'path','H3':'path','HW':'path','JS':'path','JH':'path','NH':'path','W3':'path'
};
var COLORS = {
  '1':[238,53,46],'2':[238,53,46],'3':[238,53,46],
  '4':[0,147,60],'5':[0,147,60],'6':[0,147,60],
  '7':[185,51,173],
  'A':[0,57,166],'C':[0,57,166],'E':[0,57,166],
  'B':[255,99,25],'D':[255,99,25],'F':[255,99,25],'M':[255,99,25],
  'G':[108,190,69],
  'J':[153,102,51],'Z':[153,102,51],
  'N':[252,204,10],'Q':[252,204,10],'R':[252,204,10],'W':[252,204,10],
  'L':[167,169,172],'S':[128,129,131],'SIR':[0,57,166],
  'NW':[217,58,48],'H3':[77,146,251],'HW':[101,193,0],
  'JS':[255,153,0],'JH':[255,153,0],'NH':[140,60,150],'W3':[101,193,0]
};
// The "S" bullet covers three shuttles in two feeds: the 42 St Shuttle rides in
// the base feed (its station's primary group), while the Franklin Av and
// Rockaway Park shuttles ride in the ace feed. Pull both for any S station so
// every shuttle resolves regardless of which one the station belongs to.
var EXTRA_GROUPS = { 'S': ['ace'] };
function feedForLine(line) { return LINE_GROUP[line] || null; }
function colorForLine(line) { return COLORS[line] || [255,255,255]; }
function feedUrls(lines) {
  var groups = {};
  lines.forEach(function (l) {
    var g = feedForLine(l); if (g) groups[g] = true;
    var ex = EXTRA_GROUPS[l]; if (ex) ex.forEach(function (e) { groups[e] = true; });
  });
  return Object.keys(groups).map(function (g) {
    return g === 'path' ? PATH_URL : BASE + GROUPS[g];
  });
}
module.exports = { feedForLine: feedForLine, colorForLine: colorForLine, feedUrls: feedUrls, _groups: GROUPS };
