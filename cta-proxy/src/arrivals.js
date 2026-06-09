import { ROUTE_MAP } from './routeMap.js';
import { ctaToEpoch } from './ctaTime.js';

// ctatt: the `ctatt` object from ttarrivals.aspx JSON. now: proxy response epoch.
// Returns { epoch, model: [{line,color,directions:[{label,dest,times,exp}]}] }.
// Per CTA Appendix D, time-to-arrival = arrT - prdt (re-anchored to `now`), and
// isApp ("Due") arrives immediately. CTA drops reached trains from the feed, so
// no past-filter is needed beyond clamping the delta at 0.
export function transformArrivals(ctatt, now) {
  const etas = ctatt && ctatt.eta ? (Array.isArray(ctatt.eta) ? ctatt.eta : [ctatt.eta]) : [];
  const byRoute = new Map();                              // rt -> Map(trDr -> {dest, times, _min})
  for (const e of etas) {
    const rm = ROUTE_MAP[e.rt];
    if (!rm) continue;
    const arrT = ctaToEpoch(e.arrT), prdt = ctaToEpoch(e.prdt);
    if (!Number.isFinite(arrT) || !Number.isFinite(prdt)) continue;
    const due = (e.isApp === '1' || e.isApp === 1);
    const t = now + (due ? 0 : Math.max(0, arrT - prdt));
    let dirs = byRoute.get(e.rt);
    if (!dirs) { dirs = new Map(); byRoute.set(e.rt, dirs); }
    let bucket = dirs.get(e.trDr);
    if (!bucket) { bucket = { dest: e.destNm || '', times: [], _min: Infinity }; dirs.set(e.trDr, bucket); }
    bucket.times.push(t);
    // Soonest train's destNm is the headsign (CTA rewrites it mid-route).
    if (t < bucket._min) { bucket._min = t; bucket.dest = e.destNm || bucket.dest; }
  }
  const model = [];
  for (const [rt, dirs] of byRoute) {
    const rm = ROUTE_MAP[rt];
    const directions = [];
    // Stable direction order: trDr 1 before 5 (then any others).
    const keys = [...dirs.keys()].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
    for (const k of keys) {
      const b = dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: rm.label, color: rm.color, directions });
  }
  return { epoch: now, model };
}
