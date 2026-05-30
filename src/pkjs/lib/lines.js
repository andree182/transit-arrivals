var BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';
// group key -> URL suffix ('' for the 1-7/S group)
var GROUPS = {
  '123456': '', '7': '', 's': '',
  'ace': '-ace', 'bdfm': '-bdfm', 'g': '-g',
  'jz': '-jz', 'nqrw': '-nqrw', 'l': '-l', 'si': '-si'
};
var LINE_GROUP = {
  '1':'123456','2':'123456','3':'123456','4':'123456','5':'123456','6':'123456','7':'123456','S':'123456',
  'A':'ace','C':'ace','E':'ace',
  'B':'bdfm','D':'bdfm','F':'bdfm','M':'bdfm',
  'G':'g', 'J':'jz','Z':'jz',
  'N':'nqrw','Q':'nqrw','R':'nqrw','W':'nqrw',
  'L':'l', 'SIR':'si'
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
  'L':[167,169,172],'S':[128,129,131],'SIR':[0,57,166]
};
function feedForLine(line) { return LINE_GROUP[line] || null; }
function colorForLine(line) { return COLORS[line] || [255,255,255]; }
function feedUrls(lines) {
  var groups = {};
  lines.forEach(function (l) { var g = feedForLine(l); if (g) groups[g] = true; });
  return Object.keys(groups).map(function (g) { return BASE + GROUPS[g]; });
}
module.exports = { feedForLine: feedForLine, colorForLine: colorForLine, feedUrls: feedUrls, _groups: GROUPS };
