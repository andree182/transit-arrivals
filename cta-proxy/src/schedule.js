// Schedule-based arrivals for agencies with no real-time feed (PATCO, Tren Urbano).
// Computes the next departures from a compact bundled timetable, in the agency's
// local timezone, and returns the same { epoch, model } contract as the live
// agencies — but each line is flagged sched:true so the watch shows a "SCHED" badge.

// nowEpoch (sec) -> agency-local calendar facts. weekday is 0=Sun..6=Sat to match
// Date.getUTCDay(); startOfDayEpoch is the epoch of local midnight for that date.
export function localParts(nowEpoch, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date(nowEpoch * 1000))) p[part.type] = part.value;
  const y = +p.year, mo = +p.month, da = +p.day, h = +p.hour, mi = +p.minute, s = +p.second;
  const dateInt = y * 10000 + mo * 100 + da;
  const weekday = new Date(Date.UTC(y, mo - 1, da)).getUTCDay();
  const secOfDay = h * 3600 + mi * 60 + s;
  return { dateInt, weekday, secOfDay, startOfDayEpoch: nowEpoch - secOfDay };
}

// Set of service_ids running on the given local date: calendar day-of-week + date
// range, then calendar_dates exceptions (type 1 adds, type 2 removes).
export function activeServices(calendar, exceptions, dateInt, weekday) {
  const active = new Set();
  for (const sid in calendar) {
    const c = calendar[sid];
    if (dateInt >= c.start && dateInt <= c.end && c.days[weekday]) active.add(sid);
  }
  for (const sid in (exceptions || {})) {
    const ex = exceptions[sid][dateInt] ?? exceptions[sid][String(dateInt)];
    if (ex === 1) active.add(sid);
    else if (ex === 2) active.delete(sid);
  }
  return active;
}

// data: the <id>-schedule.json object. Returns { epoch: nowEpoch, model:[ one sched line ] }.
export function nextDepartures(data, stationId, nowEpoch, maxPerDir = 6) {
  const st = data.stops[stationId];
  if (!st) return { epoch: nowEpoch, model: [] };
  const today = localParts(nowEpoch, data.tz);
  const todaySvc = activeServices(data.calendar, data.exceptions, today.dateInt, today.weekday);
  const tmr = localParts(today.startOfDayEpoch + 90000, data.tz);   // +25h lands safely in next local day
  const tmrSvc = activeServices(data.calendar, data.exceptions, tmr.dateInt, tmr.weekday);

  const directions = [];
  for (const dir of Object.keys(st).sort()) {
    const bySid = st[dir];
    const times = [];
    for (const sid in bySid) {
      if (!todaySvc.has(sid)) continue;
      for (const t of bySid[sid]) {
        const e = today.startOfDayEpoch + t;
        if (e >= nowEpoch) times.push(e);
      }
    }
    if (times.length === 0) {
      for (const sid in bySid) {
        if (!tmrSvc.has(sid)) continue;
        for (const t of bySid[sid]) times.push(tmr.startOfDayEpoch + t);
      }
    }
    times.sort((a, b) => a - b);
    const top = times.slice(0, maxPerDir);
    if (top.length) directions.push({ label: '', dest: data.dirDest[dir] || '', times: top, exp: top.map(() => false) });
  }
  if (!directions.length) return { epoch: nowEpoch, model: [] };
  return { epoch: nowEpoch, model: [{ line: data.line, color: data.color, sched: true, directions }] };
}
