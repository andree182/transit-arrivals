// Convert a CTA wall-clock America/Chicago stamp to epoch seconds. Accepts both
// the JSON ISO form "2015-04-30T20:23:53" and the compact "20150430 20:23:53".
// Strategy: treat the components as UTC to get a provisional epoch, then correct
// by Chicago's offset at that instant (computed via Intl). One refinement pass
// fixes the spring-forward window, where the offset at the provisional instant
// differs from the offset at the true instant by an hour.
const TZ_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

// Chicago's UTC offset (seconds) at a given epoch instant. Negative (e.g. -18000
// for CDT, -21600 for CST).
function chicagoOffset(epochSecs) {
  const p = Object.fromEntries(TZ_FMT.formatToParts(new Date(epochSecs * 1000)).map(o => [o.type, o.value]));
  let hour = +p.hour;
  if (hour === 24) hour = 0;   // Intl can emit "24" for midnight in hour12:false
  const localAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second) / 1000;
  return localAsUTC - epochSecs;
}

export function ctaToEpoch(s) {
  if (!s) return NaN;
  const m = /^(\d{4})-?(\d{2})-?(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S] = m.map(Number);
  const asUTC = Date.UTC(Y, Mo - 1, D, H, Mi, S) / 1000;
  // First estimate using the offset at the provisional (as-UTC) instant, then
  // refine using the offset at that estimated true instant. The second pass
  // corrects the DST-transition window; away from transitions both passes agree.
  const est = asUTC - chicagoOffset(asUTC);
  return asUTC - chicagoOffset(est);
}
