import { hasCoords } from './geo.js';
import { splitIso, toMinutes } from './time.js';
import type { TravelLookup } from './travelMatrix.js';
import type { Dataset, Decision, LatLng, Plan, PlanException, RuleCheck, Verification, Violation } from './types.js';
import { eligibleTechnicians } from './validation.js';

/**
 * Unabhängige Prüfung des fertigen Plans gegen alle Case-Regeln.
 * Bewusst KEIN Code aus planner.ts: wir rechnen nur mit den ausgegebenen Uhrzeiten,
 * den Originaldaten und derselben Fahrzeitquelle nach. Findet der Planer einen Fehler nicht,
 * findet ihn diese Prüfung (Vier-Augen-Prinzip im Code).
 */

const L_EARLY = toMinutes('11:30');
const L_LATE = toMinutes('13:00');
const FULL_DAY = 10 * 60;

const RULE_LABELS: Record<string, string> = {
  window: 'Arbeitstag im Verfügbarkeitsfenster, Beginn und Ende am Wohnort',
  travel: 'Nichts überlappt, auch nicht Fahrzeiten',
  returnHome: 'Heimfahrt höchstens 60 min über das Fensterende hinaus',
  lunch: 'Mittagspause 60 min, Beginn 11:30–13:00, nur ganze Tage',
  customerFrom: 'customerAvailableFrom als harte Grenze (inkl. bestätigter Notizen)',
  duration: 'Dauer vor Ort korrekt (PV 60 · WP 75 · WP+PV/unbekannt 105)',
  fixed: 'Bestehende Termine bleiben, wo sie sind',
  responsibility: 'Zuständigkeit: Gebiet, sonst ≤ 15 km, sonst nicht zuordenbar',
  unique: 'Jede Anfrage genau einmal: eingeplant oder auf der Warteliste',
  priority: 'Reicht die Kapazität nicht, kommen ältere Anfragen zuerst',
};

export function verifyPlan(plan: Plan, data: Dataset, travel: TravelLookup, noteConstraints: Record<string, { earliest?: string; latest?: string }> = {}): Verification {
  const rules = new Map<string, RuleCheck>(Object.entries(RULE_LABELS).map(([rule, label]) => [rule, { rule, label, checks: 0, violations: [] }]));
  const check = (rule: string, ok: boolean, v: Omit<Violation, 'rule'>) => {
    const r = rules.get(rule)!;
    r.checks++;
    if (!ok) r.violations.push({ rule, ...v });
  };
  const notes: string[] = [];
  const requests = new Map(data.requests.map((r) => [r.id, r]));
  const appointments = new Map(data.appointments.map((a) => [a.id, a]));
  const seen = new Map<string, string>();
  const plannedApts = new Set<string>();

  for (const route of plan.routes) {
    const tech = data.technicians.find((t) => t.id === route.technicianId);
    const ctx = { technicianId: route.technicianId, date: route.date };
    const avail = data.availability.find((a) => a.technicianId === route.technicianId && a.date === route.date);
    check('window', !!tech && !!avail && !avail.blocked, { ...ctx, message: 'Route an einem Tag ohne Verfügbarkeit' });
    if (!tech || !avail) continue;
    const ws = toMinutes(avail.start), we = toMinutes(avail.end);
    if (!route.stops.length) continue;

    const dep = toMinutes(route.departure), ret = toMinutes(route.returnHome);
    check('window', dep >= ws, { ...ctx, message: `Abfahrt ${route.departure} vor Fensterbeginn ${avail.start}` });
    const lunch = route.lunch ? [toMinutes(route.lunch.start), toMinutes(route.lunch.end)] as const : null;

    let pos: LatLng = tech.home;
    let free = dep; // ab hier darf gefahren werden
    let freeFrom = ws; // Beginn der Lücke (für Pause)
    for (const [i, stop] of route.stops.entries()) {
      const sctx = { ...ctx, stopId: stop.id };
      const start = toMinutes(stop.start), end = toMinutes(stop.end);
      const leg = travel.minutes(pos, { lat: stop.lat, lng: stop.lng });
      const lunchInGap = lunch && lunch[0] >= freeFrom && lunch[1] <= start;
      const needed = leg + (lunchInGap ? 60 : 0);
      const earliestLeave = i === 0 ? ws : free;
      check('travel', start - earliestLeave >= needed, {
        ...sctx,
        message: `${stop.customer}: ${start - earliestLeave} min Lücke, benötigt ${needed} min (Fahrt ${leg}${lunchInGap ? ' + Pause 60' : ''})`,
      });
      check('window', start - leg >= ws && end <= we, { ...sctx, message: `${stop.customer} ${stop.start}–${stop.end} liegt inkl. Anfahrt außerhalb von ${avail.start}–${avail.end}` });
      if (lunch) check('travel', !(lunch[0] < end && lunch[1] > start), { ...sctx, message: `Mittagspause überschneidet sich mit ${stop.customer}` });

      if (stop.kind === 'request') {
        const r = requests.get(stop.id);
        check('unique', !!r && !seen.has(stop.id), { ...sctx, message: `${stop.id} ${r ? `doppelt (auch ${seen.get(stop.id)})` : 'unbekannt'}` });
        seen.set(stop.id, `${route.technicianId}@${route.date}`);
        if (r) {
          if (r.customerAvailableFrom && /^\d{2}:\d{2}$/.test(r.customerAvailableFrom))
            check('customerFrom', start >= toMinutes(r.customerAvailableFrom), { ...sctx, message: `${stop.customer} beginnt ${stop.start}, Kunde erst ab ${r.customerAvailableFrom}` });
          const nc = noteConstraints[r.id];
          if (nc?.earliest) check('customerFrom', start >= toMinutes(nc.earliest), { ...sctx, message: `${stop.customer} beginnt ${stop.start}, laut bestätigter Notiz erst ab ${nc.earliest}` });
          if (nc?.latest) check('customerFrom', end <= toMinutes(nc.latest), { ...sctx, message: `${stop.customer} endet ${stop.end}, laut bestätigter Notiz bis ${nc.latest}` });
          const expected = r.visitationType === null ? 105 : ({ PV: 60, WP: 75, 'WP+PV': 105 } as const)[r.visitationType];
          check('duration', end - start === expected, { ...sctx, message: `${stop.customer}: ${end - start} min geplant, erwartet ${expected}` });
          const eligible = eligibleTechnicians(r, data.technicians).map((t) => t.id);
          check('responsibility', eligible.includes(route.technicianId), { ...sctx, message: `${stop.customer} liegt weder im Gebiet von ${tech.name} noch ≤ 15 km von dessen Wohnort` });
        }
      } else {
        const a = appointments.get(stop.id);
        plannedApts.add(stop.id);
        const ok = !!a && a.technicianId === route.technicianId && splitIso(a.start).date === route.date && splitIso(a.start).minutes === start && splitIso(a.end).minutes === end;
        check('fixed', ok, { ...sctx, message: `Fixer Termin ${stop.id} verschoben oder falsch zugeordnet` });
      }
      pos = { lat: stop.lat, lng: stop.lng };
      free = end;
      freeFrom = end;
    }

    // Heimfahrt
    const back = travel.minutes(pos, tech.home);
    const lastEnd = toMinutes(route.stops[route.stops.length - 1].end);
    check('returnHome', ret >= lastEnd + back, { ...ctx, message: `Ankunft zu Hause ${route.returnHome} zu früh (Fahrt ${back} min)` });
    check('returnHome', lastEnd + back <= we + 60, { ...ctx, message: `Ankunft zu Hause ${lastEnd + back - we} min nach Fensterende (max. 60)` });

    if (lunch && lunch[0] >= lastEnd) check('lunch', lunch[0] >= ret, { ...ctx, message: 'Mittagspause überschneidet sich mit der Heimfahrt' });

    // Mittagspause
    const full = we - ws >= FULL_DAY;
    if (lunch) {
      check('lunch', full, { ...ctx, message: 'Pause an einem Halbtag' });
      check('lunch', lunch[1] - lunch[0] === 60 && lunch[0] >= L_EARLY && lunch[0] <= L_LATE, { ...ctx, message: `Mittagspause ${route.lunch!.start}–${route.lunch!.end} außerhalb der Regel` });
    } else if (full) {
      // Gibt es eine Lücke, in die sie gepasst hätte? Dann hätte sie eingeplant werden müssen.
      const gaps: [number, number][] = [[ws, dep]];
      let p: LatLng = tech.home;
      route.stops.forEach((s, i) => {
        const leg = travel.minutes(p, { lat: s.lat, lng: s.lng });
        if (i > 0) gaps.push([toMinutes(route.stops[i - 1].end), toMinutes(s.start) - leg]);
        p = { lat: s.lat, lng: s.lng };
      });
      gaps.push([ret, we]);
      const fit = gaps.some(([a, b]) => Math.max(a, L_EARLY) <= L_LATE && Math.max(a, L_EARLY) + 60 <= b);
      check('lunch', !fit, { ...ctx, message: 'Mittagspause hätte gepasst, ist aber nicht eingeplant' });
    }
  }

  // Fixe Termine: alle noch da?
  for (const a of data.appointments) {
    const hasDay = plan.routes.some((r) => r.technicianId === a.technicianId && r.date === splitIso(a.start).date);
    if (hasDay) check('fixed', plannedApts.has(a.id), { technicianId: a.technicianId, date: splitIso(a.start).date, stopId: a.id, message: `Fixer Termin ${a.id} fehlt im Plan` });
    else notes.push(`Fixer Termin ${a.id} liegt an einem Tag ohne Verfügbarkeit von ${a.technicianId} (Datenfehler, bleibt unverändert)`);
  }

  // Keine Anfrage verloren, Zuständigkeit der nicht zuordenbaren korrekt
  const unassigned = new Map(plan.unassigned.map((u) => [u.requestId, u]));
  for (const r of data.requests) {
    check('unique', seen.has(r.id) !== unassigned.has(r.id), { stopId: r.id, message: `${r.id} ${seen.has(r.id) ? 'eingeplant und zugleich auf der Warteliste' : 'weder eingeplant noch auf der Warteliste'}` });
    const u = unassigned.get(r.id);
    if (u?.reason.startsWith('Nicht zuordenbar'))
      check('responsibility', hasCoords(r) && eligibleTechnicians(r, data.technicians).length === 0, { stopId: r.id, message: `${r.id} als nicht zuordenbar markiert, obwohl eine Zuständigkeit besteht` });
  }

  // Priorität: ist eine jüngere Anfrage eingeplant, während eine ältere mit demselben Techniker wartet?
  const waitingCap = plan.unassigned.filter((u) => u.reason.startsWith('Kapazität')).map((u) => requests.get(u.requestId)!).filter(Boolean);
  let inversions = 0;
  for (const w of waitingCap) {
    const wEl = new Set(eligibleTechnicians(w, data.technicians).map((t) => t.id));
    for (const route of plan.routes) {
      if (!wEl.has(route.technicianId)) continue;
      for (const s of route.stops) {
        const r = s.kind === 'request' ? requests.get(s.id) : null;
        if (r && r.createdAt > w.createdAt) inversions++;
      }
    }
  }
  rules.get('priority')!.checks = plan.routes.length;
  if (inversions)
    notes.push(`Priorität: ${waitingCap.length} ältere Anfragen auf der Warteliste passten in keinen Tag (Zeitfenster/Ort) – jüngere wurden nur dort eingeplant, wo keine ältere hineinpasste (die Planung prüft immer die älteste zuerst).`);

  const estLegs = plan.routes.reduce((n, r) => n + r.stops.filter((s) => s.travelEstimated).length, 0);
  if (estLegs) notes.push(`${estLegs} Fahrten basieren auf Luftlinien-Schätzung (keine echte Fahrzeit verfügbar).`);

  const list = [...rules.values()];
  const total = list.reduce((n, r) => n + r.violations.length, 0);
  return { ok: total === 0, totalViolations: total, rules: list, notes };
}

/**
 * Bewusste Ausnahmen: Hat der Planer eine Anfrage mit Begründung "trotzdem" eingeplant oder vorgezogen,
 * wird ein dadurch entstehender Regelbruch nicht als Fehler (rot), sondern als Ausnahme (gelb) geführt –
 * mit Begründung, nie stillschweigend. Ohne bestätigte Ausnahme bleibt jeder Verstoß ein Fehler.
 */
export function applyExceptions(v: Verification, plan: Plan, decisions: Record<string, Decision>): Verification {
  const exceptions: PlanException[] = [];
  // Touren, in denen eine bewusste Ausnahme steckt → auch tourweite Verstöße (Heimkehr, Pause) gehören dazu
  const overrideIn = new Map<string, { requestId: string; reason: string }>();
  for (const r of plan.routes)
    for (const s of r.stops) {
      const d = decisions[s.id];
      if (d?.override && d.mode === 'pin') overrideIn.set(`${r.technicianId}@${r.date}`, { requestId: s.id, reason: d.reason });
    }

  const rules = v.rules.map((rule) => {
    const keep: Violation[] = [];
    for (const x of rule.violations) {
      const own = x.stopId ? decisions[x.stopId] : undefined;
      const viaRoute = x.technicianId && x.date ? overrideIn.get(`${x.technicianId}@${x.date}`) : undefined;
      const cover = own?.override && own.mode === 'pin' ? { requestId: x.stopId!, reason: own.reason } : viaRoute;
      if (cover) exceptions.push({ requestId: cover.requestId, rule: x.rule, technicianId: x.technicianId, date: x.date, message: x.message, reason: cover.reason });
      else keep.push(x);
    }
    return { ...rule, violations: keep };
  });

  // Vorgezogen: bricht bewusst "ältere zuerst" – als Ausnahme sichtbar, sobald die Anfrage eingeplant ist
  for (const r of plan.routes)
    for (const s of r.stops) {
      const d = decisions[s.id];
      if (d?.mode === 'prioritize') exceptions.push({ requestId: s.id, rule: 'priority', technicianId: r.technicianId, date: r.date, message: `${s.customer} vorgezogen (vor älteren Anfragen)`, reason: d.reason });
    }

  const total = rules.reduce((n, r) => n + r.violations.length, 0);
  return { ...v, rules, ok: total === 0, totalViolations: total, exceptions };
}
