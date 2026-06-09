// Convert a CTA wall-clock America/Chicago stamp to epoch seconds. Accepts both
// the JSON ISO form "2015-04-30T20:23:53" and the compact "20150430 20:23:53".
// Strategy: treat the components as UTC to get a provisional epoch, then correct
// by Chicago's offset at that instant (computed via Intl), which is DST-accurate.
export function ctaToEpoch(s) {
  if (!s) return NaN;
  const m = /^(\d{4})-?(\d{2})-?(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S] = m.map(Number);
  const asUTC = Date.UTC(Y, Mo - 1, D, H, Mi, S) / 1000;
  // Offset (seconds) of America/Chicago at this instant.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(asUTC * 1000)).map(o => [o.type, o.value]));
  const localAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
  const offset = localAsUTC - asUTC;       // e.g. -18000 for CDT
  return asUTC - offset;
}
