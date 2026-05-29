var MAX_ALERTS = 3;
var MAX_LEN = 100;

function pickText(headerText) {
  var tr = headerText && headerText.translation;
  if (!Array.isArray(tr) || !tr.length) return null;
  var en = null, plain = null;
  for (var i = 0; i < tr.length; i++) {
    var t = tr[i];
    if (!t || typeof t.text !== 'string') continue;
    var lang = (t.language || '').toLowerCase();
    if (lang === 'en') return t.text;             // exact plain English wins
    if (plain === null && lang.indexOf('html') < 0) plain = t.text;
    if (en === null) en = t.text;
  }
  return plain !== null ? plain : en;
}

function isActive(periods, now) {
  if (!Array.isArray(periods) || !periods.length) return true;   // no window => always on
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i] || {};
    var start = typeof p.start === 'number' ? p.start : -Infinity;
    var end = typeof p.end === 'number' ? p.end : Infinity;
    if (now >= start && now <= end) return true;
  }
  return false;
}

function matchesLines(informed, lines) {
  if (!Array.isArray(informed)) return false;
  for (var i = 0; i < informed.length; i++) {
    var r = informed[i] && informed[i].route_id;
    if (r && lines.indexOf(r) >= 0) return true;
  }
  return false;
}

function clean(text) {
  var s = text.replace(/\s+/g, ' ').trim();
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN) : s;
}

// Returns up to MAX_ALERTS de-duped, cleaned headline strings for alerts that
// (a) inform one of `lines` and (b) are active at `now` (unix seconds). Never
// throws on malformed input; returns [] instead.
function extractAlerts(feed, lines, now) {
  var entities = feed && feed.entity;
  if (!Array.isArray(entities)) return [];
  var out = [], seen = {};
  for (var i = 0; i < entities.length && out.length < MAX_ALERTS; i++) {
    var a = entities[i] && entities[i].alert;
    if (!a) continue;
    if (!matchesLines(a.informed_entity, lines)) continue;
    if (!isActive(a.active_period, now)) continue;
    var raw = pickText(a.header_text);
    if (!raw) continue;
    var text = clean(raw);
    if (!text || seen[text]) continue;
    seen[text] = true;
    out.push(text);
  }
  return out;
}

module.exports = { extractAlerts };
