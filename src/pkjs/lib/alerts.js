var MAX_ALERTS = 3;
var MAX_LEN = 220;
var NOTICE_LEN = 80;
var displayRoute = require('./arrivals')._displayRoute;

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

function clean(text, max) {
  if (!max) max = MAX_LEN;
  var s = text.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

// Returns up to MAX_ALERTS de-duped, cleaned headline strings for alerts that
// (a) inform one of `lines` and (b) are active at `now` (unix seconds). Never
// throws on malformed input; returns [] instead.
function extractAlerts(feed, lines, now) {
  var entities = feed && feed.entity;
  if (!Array.isArray(entities)) return [];
  var out = [], seen = Object.create(null);
  for (var i = 0; i < entities.length && out.length < MAX_ALERTS; i++) {
    var a = entities[i] && entities[i].alert;
    if (!a) continue;
    if (!matchesLines(a.informed_entity, lines)) continue;
    if (!isActive(a.active_period, now)) continue;
    var raw = pickText(a.header_text);
    if (!raw) continue;
    var desc = pickText(a.description_text);
    if (desc) raw = raw + ' — ' + desc;
    var text = clean(raw);
    if (!text || seen[text]) continue;
    seen[text] = true;
    out.push(text);
  }
  return out;
}

function mercuryType(a) {
  var m = a['transit_realtime.mercury_alert'];
  return m && typeof m.alert_type === 'string' ? m.alert_type : '';
}
function isSuspension(atype) {
  return /suspend/i.test(atype) || atype === 'No Scheduled Service';
}
function isPartial(atype) {
  return /part/i.test(atype);
}

// Returns one entry per station line with an ACTIVE suspension alert:
// [{ code, reason }]. code is the displayRoute-normalized line label (SI->SIR,
// FS/GS/H->S) so it matches the bundle's line codes. A full suspension outranks
// a partial one for the same line. Never throws; returns [] on malformed input.
function extractSuspensions(feed, lines, now) {
  var entities = feed && feed.entity;
  if (!Array.isArray(entities)) return [];
  var best = Object.create(null);   // code -> { reason, full }
  for (var i = 0; i < entities.length; i++) {
    var a = entities[i] && entities[i].alert;
    if (!a) continue;
    var atype = mercuryType(a);
    if (!isSuspension(atype)) continue;
    if (!isActive(a.active_period, now)) continue;
    var raw = pickText(a.header_text);
    if (!raw) continue;
    var reason = clean(raw, NOTICE_LEN);
    var full = !isPartial(atype);
    var informed = a.informed_entity;
    if (!Array.isArray(informed)) continue;
    for (var k = 0; k < informed.length; k++) {
      var rid = informed[k] && informed[k].route_id;
      if (!rid) continue;
      var code = displayRoute(rid);
      if (lines.indexOf(code) < 0) continue;
      var prev = best[code];
      if (!prev || (full && !prev.full)) best[code] = { reason: reason, full: full };
    }
  }
  return Object.keys(best).map(function (code) {
    return { code: code, reason: best[code].reason };
  });
}

module.exports = { extractAlerts: extractAlerts, extractSuspensions: extractSuspensions };
