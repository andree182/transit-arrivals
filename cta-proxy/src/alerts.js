import { ROUTE_MAP } from './routeMap.js';

// CTA rail-route ServiceId -> our 2-char label. ServiceId values mirror eta.rt
// (Red/Blue/Brn/G/Org/P/Pink/Y); alerts may also use "Pexp" for Purple Express,
// which folds onto Purple.
const SERVICE_TO_LABEL = Object.fromEntries(
  Object.entries(ROUTE_MAP).map(([rt, v]) => [rt, v.label])
);
SERVICE_TO_LABEL.Pexp = ROUTE_MAP.P.label;

function arr(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

// routes: routes.aspx JSON; alerts: alerts.aspx JSON; wantLabels: ['Bl',…].
// Returns { alerts:[text…], suspensions:[{line,reason}] } for the requested labels.
// ImpactedService.Service entries are typed: ServiceType "R" = rail route (ServiceId
// is a route code), "X" = systemwide (applies to all lines); "T" (station) and "B"
// (bus) are ignored.
export function transformAlerts(routes, alerts, wantLabels) {
  const want = new Set(wantLabels);
  const out = { alerts: [], suspensions: [] };
  const seenSusp = new Set();

  for (const a of arr(alerts?.CTAAlerts?.Alert)) {
    const services = arr(a.ImpactedService?.Service);
    const routeLabels = services
      .filter(s => s.ServiceType === 'R')
      .map(s => SERVICE_TO_LABEL[s.ServiceId])
      .filter(Boolean);
    const systemwide = services.some(s => s.ServiceType === 'X');
    const hit = systemwide ? [...want] : routeLabels.filter(l => want.has(l));
    if (!hit.length) continue;
    const text = a.Headline || a.ShortDescription || '';
    if (text) out.alerts.push(text);
    const suspended = /suspend/i.test(a.Impact || '') || /suspend/i.test(a.Headline || '');
    if (suspended) {
      for (const l of hit) {
        if (seenSusp.has(l)) continue;
        seenSusp.add(l);
        out.suspensions.push({ line: l, reason: a.ShortDescription || a.Headline || 'Service suspended' });
      }
    }
  }
  // A route whose routes.aspx RouteStatus mentions "suspend" is also suspended.
  for (const r of arr(routes?.CTARoutes?.RouteInfo)) {
    const label = SERVICE_TO_LABEL[r.ServiceId];
    if (!label || !want.has(label) || seenSusp.has(label)) continue;
    if (/suspend/i.test(r.RouteStatus || '')) {
      seenSusp.add(label);
      out.suspensions.push({ line: label, reason: r.RouteStatus });
    }
  }
  return out;
}
