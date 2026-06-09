// Shared GTFS-RT transforms for agencies whose live feed is TripUpdates + Alerts.
// Generalized from the SEPTA (transformRT) and MARTA (transformAlerts) modules.

// trips:    extractTripUpdates() output [{ routeId, tripId, directionId, stops:[{stopId,time}] }]
// stopIds:  Set of GTFS stop_ids that belong to the requested station (platforms)
// routeMap: { route_id: { label, color:[r,g,b] } } — only rail routes; others are dropped
// names:    { stop_id: name } — used to label the destination (the trip's last stop)
// now:      epoch seconds; arrivals strictly before `now` are dropped
// Returns model:[{ line, color, directions:[{ label:'', dest, times, exp }] }].
export function buildModelFromTripUpdates(trips, stopIds, routeMap, names, now) {
  const byLabel = new Map();                 // label -> { color, dirs: Map(dir -> {dest, times, _min}) }
  for (const trip of (Array.isArray(trips) ? trips : [])) {
    const rm = routeMap[trip.routeId];
    if (!rm) continue;
    let hit = null;                          // earliest future stop_time at this station
    for (const s of trip.stops) {
      if (!stopIds.has(s.stopId) || s.time < now) continue;
      if (!hit || s.time < hit.time) hit = s;
    }
    if (!hit) continue;
    const last = trip.stops.length ? trip.stops[trip.stops.length - 1] : null;
    const dest = (last && names[last.stopId]) || '';
    const dir = String(trip.directionId == null ? '' : trip.directionId);
    let entry = byLabel.get(rm.label);
    if (!entry) { entry = { color: rm.color, dirs: new Map() }; byLabel.set(rm.label, entry); }
    let b = entry.dirs.get(dir);
    if (!b) { b = { dest, times: [], _min: Infinity }; entry.dirs.set(dir, b); }
    b.times.push(hit.time);
    if (hit.time < b._min) { b._min = hit.time; if (dest) b.dest = dest; }
  }
  const model = [];
  for (const [label, entry] of byLabel) {
    const directions = [];
    for (const k of [...entry.dirs.keys()].sort()) {
      const b = entry.dirs.get(k);
      const times = b.times.sort((x, y) => x - y).slice(0, 6);
      directions.push({ label: '', dest: b.dest, times, exp: times.map(() => false) });
    }
    if (directions.length) model.push({ line: label, color: entry.color, directions });
  }
  return model;
}

// rows:       extractAlerts() output [{ routeIds, stopIds, header, effect }]
// routeMap:   { route_id: { label, color } } (same map as arrivals)
// wantLabels: requested display labels, e.g. ['Rd','Bl']
// Returns { alerts:[header...], suspensions:[{ line, color, reason }] } per the pinned contract.
export function buildAlerts(rows, routeMap, wantLabels) {
  const want = new Set((wantLabels || []).map(String));
  const labelColor = {};
  for (const k in routeMap) labelColor[routeMap[k].label] = routeMap[k].color;
  const alerts = [], suspensions = [];
  const seenHeader = new Set(), seenSusp = new Set();         // dedup repeated entities (per-sub-route)
  for (const a of (Array.isArray(rows) ? rows : [])) {
    const labels = [...new Set((a.routeIds || []).map(r => (routeMap[r] || {}).label).filter(Boolean))];
    const hit = labels.filter(l => want.has(l));
    if (!hit.length) continue;
    const header = String(a.header || '').trim();
    if (header && !seenHeader.has(header)) { seenHeader.add(header); alerts.push(header); }
    const isSusp = a.effect === 1 || /suspend|no service/i.test(header);
    if (isSusp) {
      for (const l of hit) {
        if (seenSusp.has(l)) continue;
        seenSusp.add(l);
        suspensions.push({ line: l, color: labelColor[l] || [128, 128, 128], reason: header });
      }
    }
  }
  return { alerts, suspensions };
}
