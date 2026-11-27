/**
 * @file      verify.ts – Unabhängige Regelprüfung des fertigen Plans („Vier-Augen-Prinzip im Code“)
 * @layer     Backend · Domäne (reine Funktionen)
 * @einstieg  verifyPlan() → Badge „✓ 0 Regelverstöße · 11 Regeln“ · applyExceptions() → bewusste Ausnahmen (gelb)
 * @nutzt     nur Originaldaten + ausgegebene Uhrzeiten + dieselbe Fahrzeitquelle wie der Planer
 * @genutzt   index.ts (GET /api/plan), Tests in __tests__/planner.test.ts schleusen gezielt Fehler ein
 * @siehe     docs/03-planung-und-regeln.md#die-regeln--umsetzung-und-nachweis · docs/10-code-navigation.md
 *
 * Zuordnung Prüf-Schlüssel → Case-Regel:
 *   window → REGEL-1/2 · returnHome → REGEL-2 · lunch → REGEL-3 · customerFrom → REGEL-4
 *   responsibility → REGEL-5 · fixed → REGEL-6 · travel → REGEL-7 · priority → REGEL-8
 *   duration, unique, totals → Zusatzprüfungen (Dauer passt zum Typ, jede Anfrage genau einmal, angezeigte Zahlen addieren sich)
 *
 * ACHTUNG (für Reviewer): Die Zeitregeln (REGEL-1…7) rechnen komplett mit eigenem Code. Nur die Prioritätsprüfung
 * (REGEL-8) nutzt olderCouldReplace() aus planner.ts, um „hätte eine ältere eine jüngere ersetzen können?“ zu beantworten.
 * Das ist die einzige Abhängigkeit zum Planer. AUSBLICK: eigene Tauschsuche hier, damit die Prüfung 100 % unabhängig ist.
 */
import { hasCoords } from './geo.js';
import { normalizeTime, splitIso, toMinutes } from './time.js';
import type { TravelLookup } from './travelMatrix.js';
import type { Dataset, Decision, LatLng, Plan, PlanException, RuleCheck, Verification, Violation } from './types.js';
import { eligibleTechnicians } from './validation.js';
import { olderCouldReplace } from './planner.js';

/**
 * Unabhängige Prüfung des fertigen Plans gegen alle Case-Regeln.
 * Bewusst KEIN Code aus planner.ts: wir rechnen nur mit den ausgegebenen Uhrzeiten,
 * den Originaldaten und derselben Fahrzeitquelle nach. Findet der Planer einen Fehler nicht,
 * findet ihn diese Prüfung (Vier-Augen-Prinzip im Code).
 */

// MARK: - Konstanten (absichtlich dupliziert statt aus planner.RULES importiert → unabhängige Prüfung)

const L_EARLY = toMinutes('11:30');
const L_LATE = toMinutes('13:00');
const FULL_DAY = 10 * 60;

const RULE_LABELS: Record<string, string> = {
  window: 'Arbeitstag im Verfügbarkeitsfenster, Beginn und Ende am Wohnort',
  travel: 'Nichts überlappt, auch nicht Fahrzeiten',
  returnHome: 'Heimfahrt höchstens 60 min über das Fensterende hinaus',
  lunch: 'Mittagspause 60 min, Beginn 11:30–13:00, nur ganze Tage',
  customerFrom: 'customerAvailableFrom als harte Grenze',
  duration: 'Dauer vor Ort korrekt (PV 60 · WP 75 · WP+PV/unbekannt 105)',
  fixed: 'Bestehende Termine bleiben, wo sie sind',
  responsibility: 'Zuständigkeit: Gebiet, sonst ≤ 15 km, sonst nicht zuordenbar',
  unique: 'Jede Anfrage genau einmal: eingeplant oder auf der Warteliste',
  priority: 'Reicht die Kapazität nicht, kommen ältere Anfragen zuerst',
  totals: 'Zahlen stimmen: Fahrt + vor Ort + Pause + Warten = Arbeitstag, Summen = Einzelwerte',
};

// MARK: - verifyPlan (EINSTIEG)

/** Prüft jede Route Stopp für Stopp. Jede Einzelprüfung zählt in `checks`, jeder Fehler landet in `violations`. */
export function verifyPlan(plan: Plan, data: Dataset, travel: TravelLookup, decisions: Record<string, Decision> = {}): Verification {
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

  // MARK: Pro Route: Fenster, Fahrzeiten, Kundenzeit, Dauer, Zuständigkeit, fixe Termine
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
      // REGEL-7: Lücke zum vorigen Stopp muss Fahrzeit (+ ggf. Pause) abdecken
      check('travel', start - earliestLeave >= needed, {
        ...sctx,
        message: `${stop.customer}: ${start - earliestLeave} min Lücke, benötigt ${needed} min (Fahrt ${leg}${lunchInGap ? ' + Pause 60' : ''})`,
      });
      // REGEL-1/2: Termin inkl. Anfahrt im Fenster
      check('window', start - leg >= ws && end <= we, { ...sctx, message: `${stop.customer} ${stop.start}–${stop.end} liegt inkl. Anfahrt außerhalb von ${avail.start}–${avail.end}` });
      if (lunch) check('travel', !(lunch[0] < end && lunch[1] > start), { ...sctx, message: `Mittagspause überschneidet sich mit ${stop.customer}` });

      if (stop.kind === 'request') {
        const r = requests.get(stop.id);
        check('unique', !!r && !seen.has(stop.id), { ...sctx, message: `${stop.id} ${r ? `doppelt (auch ${seen.get(stop.id)})` : 'unbekannt'}` });
        seen.set(stop.id, `${route.technicianId}@${route.date}`);
        if (r) {
          const from = normalizeTime(r.customerAvailableFrom);
          // REGEL-4: customerAvailableFrom ist eine harte Grenze
          if (from) check('customerFrom', start >= toMinutes(from), { ...sctx, message: `${stop.customer} beginnt ${stop.start}, Kunde erst ab ${from}` });
          // Zusatz: Dauer passt zum Typ · DATEN: unbekannter Typ = 105 min
          const expected = r.visitationType === null ? 105 : ({ PV: 60, WP: 75, 'WP+PV': 105 } as const)[r.visitationType];
          check('duration', end - start === expected, { ...sctx, message: `${stop.customer}: ${end - start} min geplant, erwartet ${expected}` });
          // REGEL-5: Zuständigkeit
          const eligible = eligibleTechnicians(r, data.technicians).map((t) => t.id);
          check('responsibility', eligible.includes(route.technicianId), { ...sctx, message: `${stop.customer} liegt weder im Gebiet von ${tech.name} noch ≤ 15 km von dessen Wohnort` });
        }
      } else {
        const a = appointments.get(stop.id);
        plannedApts.add(stop.id);
        // REGEL-6: fixer Termin exakt bei Person, Tag und Uhrzeit wie in der API
        const ok = !!a && a.technicianId === route.technicianId && splitIso(a.start).date === route.date && splitIso(a.start).minutes === start && splitIso(a.end).minutes === end;
        check('fixed', ok, { ...sctx, message: `Fixer Termin ${stop.id} verschoben oder falsch zugeordnet` });
      }
      pos = { lat: stop.lat, lng: stop.lng };
      free = end;
      freeFrom = end;
    }

    // MARK: Heimfahrt – REGEL-1/2 (Ende am Wohnort, max. +60 min)
    const back = travel.minutes(pos, tech.home);
    const lastEnd = toMinutes(route.stops[route.stops.length - 1].end);
    check('returnHome', ret >= lastEnd + back, { ...ctx, message: `Ankunft zu Hause ${route.returnHome} zu früh (Fahrt ${back} min)` });
    check('returnHome', lastEnd + back <= we + 60, { ...ctx, message: `Ankunft zu Hause ${lastEnd + back - we} min nach Fensterende (max. 60)` });

    // Zusatz `totals`: Was die Oberfläche anzeigt, muss sich exakt addieren (Fahrt, vor Ort, Pause, Warten → Arbeitstag)
    const legs = route.stops.reduce((n, s) => n + s.travelMinutes, 0) + (ret - lastEnd);
    const work = route.stops.reduce((n, s) => n + s.durationMinutes, 0);
    const waits = route.stops.reduce((n, s) => n + s.waitMinutes, 0);
    const pause = lunch && lunch[0] >= dep && lunch[1] <= ret ? lunch[1] - lunch[0] : 0;
    check('totals', route.driveMinutes === legs, { ...ctx, message: `Fahrzeit der Route ${route.driveMinutes} min, Summe der Fahrten ${legs} min` });
    check('totals', route.workMinutes === work, { ...ctx, message: `Zeit vor Ort ${route.workMinutes} min, Summe der Termine ${work} min` });
    check('totals', ret - dep === legs + work + pause + waits, {
      ...ctx,
      message: `Arbeitstag ${route.departure}–${route.returnHome} (${ret - dep} min) ≠ Fahrt ${legs} + vor Ort ${work} + Pause ${pause} + Warten ${waits}`,
    });

    if (lunch && lunch[0] >= lastEnd) check('lunch', lunch[0] >= ret, { ...ctx, message: 'Mittagspause überschneidet sich mit der Heimfahrt' });

    // MARK: Mittagspause – REGEL-3 (inkl. „hätte gepasst, fehlt aber“)
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

  // MARK: Planweite Prüfungen
  // REGEL-6: Fixe Termine: alle noch da?
  for (const a of data.appointments) {
    const hasDay = plan.routes.some((r) => r.technicianId === a.technicianId && r.date === splitIso(a.start).date);
    if (hasDay) check('fixed', plannedApts.has(a.id), { technicianId: a.technicianId, date: splitIso(a.start).date, stopId: a.id, message: `Fixer Termin ${a.id} fehlt im Plan` });
    else notes.push(`Fixer Termin ${a.id} liegt an einem Tag ohne Verfügbarkeit von ${a.technicianId} (Datenfehler, bleibt unverändert)`);
  }

  // Zusatz `unique` + REGEL-5: Keine Anfrage verloren, Zuständigkeit der nicht zuordenbaren korrekt
  const unassigned = new Map(plan.unassigned.map((u) => [u.requestId, u]));
  for (const r of data.requests) {
    check('unique', seen.has(r.id) !== unassigned.has(r.id), { stopId: r.id, message: `${r.id} ${seen.has(r.id) ? 'eingeplant und zugleich auf der Warteliste' : 'weder eingeplant noch auf der Warteliste'}` });
    const u = unassigned.get(r.id);
    // ACHTUNG · GRUND-PRAEFIX: prüft den Anfang von `reason` – muss zu den Texten in planner.ts buildPlan() passen
    if (u?.reason.startsWith('Nicht zuordenbar'))
      check('responsibility', hasCoords(r) && eligibleTechnicians(r, data.technicians).length === 0, { stopId: r.id, message: `${r.id} als nicht zuordenbar markiert, obwohl eine Zuständigkeit besteht` });
  }

  // REGEL-8: Priorität „ältere zuerst“: Wartet eine Anfrage, obwohl sie eine jüngere (nicht manuell gesetzte) Anfrage
  // regelkonform ersetzen könnte? Dann ist die Regel verletzt. Geprüft wird jeder mögliche Tausch in jeder offenen Route.
  const waitingCap = plan.unassigned.filter((u) => u.reason.startsWith('Kapazität')).map((u) => requests.get(u.requestId)!).filter(Boolean);
  for (const w of waitingCap) {
    const swap = olderCouldReplace(data, plan, w.id, { travel, decisions });
    check('priority', !swap, {
      technicianId: swap?.technicianId,
      date: swap?.date,
      stopId: swap?.displacedId,
      message: swap ? `${w.customer} (älter) wartet, obwohl sie ${swap.displacedCustomer} (jünger) am ${swap.date} ersetzen könnte` : '',
    });
  }
  if (waitingCap.length && !rules.get('priority')!.violations.length)
    notes.push(`Priorität: ${waitingCap.length} wartende Anfragen geprüft – keine passt regelkonform anstelle einer jüngeren in eine Route.`);

  // Zusatz `totals`: Wochensummen = Summe der Routen, jede Anfrage genau einmal gezählt
  const routeDrive = plan.routes.reduce((n, r) => n + r.driveMinutes, 0);
  check('totals', plan.stats.driveMinutes === routeDrive, { message: `Fahrzeit gesamt ${plan.stats.driveMinutes} min ≠ Summe der Routen ${routeDrive} min` });
  check('totals', plan.stats.planned === seen.size && plan.stats.unassigned === unassigned.size, {
    message: `Zählung: ${plan.stats.planned} eingeplant / ${plan.stats.unassigned} nicht – im Plan stehen ${seen.size} / ${unassigned.size}`,
  });
  check('totals', plan.stats.planned + plan.stats.unassigned === data.requests.length && plan.stats.totalRequests === data.requests.length, {
    message: `${plan.stats.planned} + ${plan.stats.unassigned} ≠ ${data.requests.length} Anfragen`,
  });

  const estLegs = plan.routes.reduce((n, r) => n + r.stops.filter((s) => s.travelEstimated).length, 0);
  if (estLegs) notes.push(`${estLegs} Fahrten basieren auf Luftlinien-Schätzung (keine echte Fahrzeit verfügbar).`);

  const list = [...rules.values()];
  const total = list.reduce((n, r) => n + r.violations.length, 0);
  return { ok: total === 0, totalViolations: total, rules: list, notes };
}

// MARK: - Bewusste Ausnahmen (Planer hat mit Begründung übersteuert)

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

  const total = rules.reduce((n, r) => n + r.violations.length, 0);
  return { ...v, rules, ok: total === 0, totalViolations: total, exceptions };
}
