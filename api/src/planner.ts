/**
 * @file      planner.ts – Kern der Einsatzplanung (Anfragen → Personen-Tage → Tagesrouten)
 * @layer     Backend · Domäne (reine Funktionen, kein I/O)
 * @einstieg  buildPlan() · rankOptions() · baselinePlan()
 * @nutzt     travelMatrix (Fahrzeiten), validation (Zuständigkeit, Datenfehler)
 * @genutzt   index.ts (HTTP-Routen), verify.ts prüft das Ergebnis unabhängig nach
 * @siehe     docs/03-planung-und-regeln.md · docs/10-code-navigation.md
 *
 * Lesereihenfolge für Reviewer:
 *   1. RULES (Konstanten)  2. simulate() – hier stecken alle Tagesregeln  3. buildPlan() Phasen 1–5
 *   4. rankOptions() – Vorschau für „Verschieben“   5. baselinePlan() – Vergleich mit Handplanung
 * Schnellsuche: `grep -n "REGEL-" planner.ts` zeigt, wo jede Case-Regel umgesetzt ist.
 */
import { hasCoords, haversineKm } from './geo.js';
import { normalizeTime, splitIso, toHHMM, toMinutes } from './time.js';
import { estimateLookup, type MatrixStats, type TravelLookup } from './travelMatrix.js';
import { eligibleTechnicians, validateDataset } from './validation.js';
import type { Appointment, Dataset, DayRoute, Decision, LatLng, ManualMark, Plan, PlannedStop, ServiceRequest, SlotOption, Technician, UnassignedRequest } from './types.js';

/**
 * Planer in drei Phasen:
 * 1) Greedy "Cheapest Insertion" – älteste Anfrage zuerst, an die Stelle mit den geringsten Zusatz-Fahrminuten,
 *    die alle Regeln erfüllt (Simulation des ganzen Tages).
 * 2) Lokale Verbesserung – 2-opt je Tour (Abschnitt umdrehen) + Relocate (Anfrage in andere Tour/anderen Tag verschieben),
 *    solange die Gesamtfahrzeit sinkt. Jeder Schritt wird wieder voll simuliert → Regeln bleiben erfüllt.
 * 3) Freigewordene Kapazität – Warteliste erneut in Altersreihenfolge einplanen.
 * Freigegebene Tage sind gesperrt: ihre Stopps werden wie fixe Termine behandelt und nicht mehr angefasst.
 * Fahrzeiten kommen aus der Fahrzeitmatrix (travelMatrix.ts), Fallback Luftlinien-Schätzung.
 *
 * TRADE-OFF: Heuristik statt VRPTW-Solver (z. B. OR-Tools). ~150 Anfragen × 7 Personen × 5 Tage sind in < 1 s
 *            fertig, jeder Schritt ist nachvollziehbar. AUSBLICK: Solver für größere Mengen (docs/08).
 */

// MARK: - Regel-Konstanten (eine Stelle für alle Zahlen aus der Case Study)

export const RULES = {
  LUNCH_EARLIEST: toMinutes('11:30'), // REGEL-3
  LUNCH_LATEST: toMinutes('13:00'), // REGEL-3
  LUNCH_MINUTES: 60, // REGEL-3
  RETURN_TOLERANCE: 60, // REGEL-2: Heimfahrt darf bis 60 min über das Fenster
  FULL_DAY_MINUTES: 10 * 60, // REGEL-3 · ANNAHME: "ganzer Tag" = Fenster ≥ 10 h (z. B. 07–19); 07–12 / 12–19 sind halbe Tage
  UNKNOWN_TYPE_MINUTES: 105, // DATEN: visitationType = null → 105 min laut API-Doku
};
const { LUNCH_EARLIEST, LUNCH_LATEST, LUNCH_MINUTES, RETURN_TOLERANCE, FULL_DAY_MINUTES } = RULES;

export const isFullDay = (windowStart: number, windowEnd: number) => windowEnd - windowStart >= FULL_DAY_MINUTES;

// MARK: - Interne Typen
// Item = ein Stopp (Anfrage oder fixer Termin) in einheitlicher Form. Alle Zeiten in Minuten seit Mitternacht.
// Slot = ein Personen-Tag (Techniker × Datum) mit Verfügbarkeitsfenster und geordneter Stopp-Liste.

interface Item {
  kind: 'request' | 'appointment';
  id: string;
  customer: string;
  address: string;
  pos: LatLng;
  visitationType: string | null;
  appointmentType: 'Besichtigung' | 'Inbetriebnahme';
  duration: number;
  earliest: number | null; // customerAvailableFrom
  fixedStart: number | null; // fixe Termine bzw. freigegebene Stopps
  createdAt: string;
  eligible: Set<string>;
  manual: ManualMark | null;
}

interface Slot {
  tech: Technician;
  date: string;
  windowStart: number;
  windowEnd: number;
  items: Item[];
  locked: { at: string } | null;
}

interface SimResult {
  feasible: boolean;
  drive: number;
  departure: number;
  returnHome: number;
  lunch: [number, number] | null;
  stops: PlannedStop[];
  /** Warum der Tag nicht regelkonform ist (nur bei feasible = false) */
  reason?: string;
}

const FAIL: SimResult = { feasible: false, drive: Infinity, departure: 0, returnHome: 0, lunch: null, stops: [] };
const fail = (reason: string): SimResult => ({ ...FAIL, reason });

// MARK: - Tages-Simulation (Herzstück: hier werden alle Tagesregeln durchgesetzt)

/**
 * Spielt einen Personen-Tag in der gegebenen Stopp-Reihenfolge durch: Abfahrt Wohnort → Stopps → Heimfahrt.
 * Gibt `feasible: false` + `reason` zurück, sobald eine Regel verletzt ist.
 *
 * Erzwungene Regeln: REGEL-1 (Start/Ende Wohnort, Fenster) · REGEL-2 (Termin im Fenster, Heimfahrt ≤ +60)
 *                    REGEL-3 (Mittagspause) · REGEL-4 (customerAvailableFrom) · REGEL-6 (fixe Termine)
 *                    REGEL-7 (keine Überlappung – lückenlose Zeitkette `t`)
 * Nicht hier: REGEL-5 (Zuständigkeit → Item.eligible) und REGEL-8 (Reihenfolge → buildPlan Phase 2/4b).
 *
 * @param strict  false = Regeln nicht abbrechen, nur durchrechnen (für Darstellung bewusster Regelbrüche
 *                und für die Frage „hätte die Pause ohne Zusatz-Besuche gepasst?“)
 * ACHTUNG: Wird pro Kandidat sehr oft aufgerufen (O(n²) je Einfügeversuch) – keine I/O, keine teuren Lookups hier.
 */
function simulate(slot: Slot, items: Item[], travel: TravelLookup, strict = true): SimResult {
  const fullDay = isFullDay(slot.windowStart, slot.windowEnd);
  let t = slot.windowStart;
  let pos: LatLng = slot.tech.home;
  let drive = 0;
  let lunch: [number, number] | null = null;
  const stops: PlannedStop[] = [];

  for (const item of items) {
    const leg = travel.minutes(pos, item.pos);

    // REGEL-3: Mittagspause vor der Weiterfahrt, wenn die Fahrt ins Fenster 11:30–13:00 fällt
    const lunchStart = Math.max(t, LUNCH_EARLIEST);
    if (fullDay && !lunch && stops.length && lunchStart <= LUNCH_LATEST && t + leg >= LUNCH_EARLIEST) {
      const afterLunchArrival = lunchStart + LUNCH_MINUTES + leg;
      const latestStart = item.fixedStart ?? slot.windowEnd - item.duration;
      if (afterLunchArrival <= latestStart) {
        lunch = [lunchStart, lunchStart + LUNCH_MINUTES];
        t = lunchStart + LUNCH_MINUTES;
      }
    }

    // REGEL-7: Ankunft = Ende des vorigen Stopps + Fahrzeit → Fahrten können sich nie überlappen
    const arrival = t + leg;
    let start = arrival;
    // REGEL-6: fixer Termin bleibt auf seiner Uhrzeit · REGEL-4: nie vor customerAvailableFrom beginnen (sonst warten)
    if (item.fixedStart !== null) {
      if (arrival > item.fixedStart && strict) return fail(`Fixer Termin ${item.customer} um ${toHHMM(item.fixedStart)} nicht mehr erreichbar`);
      start = item.fixedStart;
    } else if (item.earliest !== null) {
      start = Math.max(arrival, item.earliest);
    }
    const end = start + item.duration;
    // REGEL-2: Termin inkl. Anfahrt ganz im Fenster
    if (end > slot.windowEnd && strict) return fail(`${item.customer} endet ${toHHMM(end)}, Fenster bis ${toHHMM(slot.windowEnd)}`);

    drive += leg;
    stops.push({
      kind: item.kind,
      id: item.id,
      customer: item.customer,
      address: item.address,
      lat: item.pos.lat,
      lng: item.pos.lng,
      visitationType: item.visitationType,
      appointmentType: item.appointmentType,
      durationMinutes: item.duration,
      travelMinutes: leg,
      travelEstimated: travel.isEstimated(pos, item.pos),
      arrival: toHHMM(arrival),
      start: toHHMM(start),
      end: toHHMM(end),
      waitMinutes: start - arrival,
      fixed: item.kind === 'appointment',
      manual: item.manual,
    });
    t = end;
    pos = item.pos;
  }

  // REGEL-1 + REGEL-2: Tag endet am Wohnort; nur die Heimfahrt darf bis RETURN_TOLERANCE über das Fenster
  const back = travel.minutes(pos, slot.tech.home);
  const returnHome = stops.length ? t + back : slot.windowStart;
  if (returnHome > slot.windowEnd + RETURN_TOLERANCE && strict) return fail(`Heimkehr ${toHHMM(returnHome)} – ${returnHome - slot.windowEnd} min nach Fensterende (max. ${RETURN_TOLERANCE})`);
  drive += back;

  // Abfahrt so spät wie möglich, damit beim ersten Kunden nicht gewartet wird
  const first = stops[0];
  let departure = first ? Math.max(slot.windowStart, toMinutes(first.start) - first.travelMinutes) : slot.windowStart;
  if (first) {
    first.arrival = toHHMM(departure + first.travelMinutes);
    first.waitMinutes = toMinutes(first.start) - departure - first.travelMinutes;
  }

  // REGEL-3: Pause noch nicht gesetzt? → in eine Lücke legen, in die sie passt (Wartezeit vor einer Fahrt, vor Abfahrt, nach Heimkehr)
  if (fullDay && !lunch && stops.length) {
    const fits = (g0: number, g1: number) => {
      const s = Math.max(g0, LUNCH_EARLIEST);
      return s <= LUNCH_LATEST && s + LUNCH_MINUTES <= g1 ? s : null;
    };
    const s0 = fits(slot.windowStart, departure);
    if (s0 !== null) lunch = [s0, s0 + LUNCH_MINUTES];
    for (let i = 1; !lunch && i < stops.length; i++) {
      const prevEnd = toMinutes(stops[i - 1].end);
      const leave = toMinutes(stops[i].start) - stops[i].travelMinutes;
      const s = fits(prevEnd, leave);
      if (s !== null) {
        lunch = [s, s + LUNCH_MINUTES];
        // Fahrt startet nach der Pause → Ankunft/Wartezeit neu
        const arr = Math.max(s + LUNCH_MINUTES + stops[i].travelMinutes, toMinutes(stops[i - 1].end) + stops[i].travelMinutes);
        stops[i].arrival = toHHMM(arr);
        stops[i].waitMinutes = toMinutes(stops[i].start) - arr;
      }
    }
    if (!lunch) {
      const sEnd = fits(returnHome, slot.windowEnd);
      if (sEnd !== null) lunch = [sEnd, sEnd + LUNCH_MINUTES];
    }
  }

  // Zeitkette lückenlos ausweisen: Lücke vor jedem Stopp = Fahrt + (Pause, falls dazwischen) + Wartezeit.
  // Abfahrt so spät wie möglich → Ankunft = Beginn; jede freie Zeit steht als Wartezeit beim nächsten Stopp (nichts verschwindet).
  for (let i = 0; i < stops.length; i++) {
    const prevEnd = i === 0 ? departure : toMinutes(stops[i - 1].end);
    const start = toMinutes(stops[i].start);
    const pause = lunch && lunch[0] >= prevEnd && lunch[1] <= start ? LUNCH_MINUTES : 0;
    stops[i].waitMinutes = Math.max(0, start - prevEnd - stops[i].travelMinutes - pause);
    stops[i].arrival = stops[i].start;
  }

  // REGEL-3 · ANNAHME: Mittagspause hat Vorrang vor einem weiteren Besuch: Entfallen darf sie nur, wenn schon die fixen Termine
  // (bzw. freigegebenen Stopps) des Tages sie unmöglich machen – nie, um eine zusätzliche Anfrage unterzubringen.
  if (strict && fullDay && !lunch && items.some((x) => x.fixedStart === null)) {
    const fixedOnly = items.filter((x) => x.fixedStart !== null);
    const possible = !fixedOnly.length || simulate(slot, fixedOnly, travel, false).lunch !== null;
    if (possible) return fail('Mittagspause hätte keinen Platz mehr (11:30–13:00, 60 min)');
  }

  return { feasible: true, drive, departure, returnHome, lunch, stops };
}

// MARK: - Umwandlung API-Daten → Item

/**
 * DATEN: Anfrage ohne Koordinaten → null (landet als „zuerst geokodieren“ auf der Warteliste).
 * DATEN: Unlesbare/abweichende Uhrzeitformate werden über normalizeTime() vereinheitlicht („10.00“ → 10:00).
 * REGEL-4: earliest = max(customerAvailableFrom, bestätigter Notiz-Zeitwunsch).
 * REGEL-5: eligible = alle zuständigen Personen (Gebiet, sonst ≤ 15 km) – siehe validation.eligibleTechnicians().
 */
function requestToItem(r: ServiceRequest, techs: Technician[]): Item | null {
  if (!hasCoords(r)) return null;
  const norm = normalizeTime(r.customerAvailableFrom);
  const earliest = norm ? toMinutes(norm) : null;
  return {
    kind: 'request',
    id: r.id,
    customer: r.customer,
    address: r.address,
    pos: { lat: r.lat, lng: r.lng },
    visitationType: r.visitationType,
    appointmentType: 'Besichtigung',
    duration: r.visitationType === null ? RULES.UNKNOWN_TYPE_MINUTES : r.durationMinutes,
    earliest,
    fixedStart: null,
    createdAt: r.createdAt,
    eligible: new Set(eligibleTechnicians(r, techs).map((t) => t.id)),
    manual: null,
  };
}

/** REGEL-6: Fixer Termin → Item mit fixedStart, nur für die eigene Person zulässig. Dauer aus start/end (Inbetriebnahme = 4 h). */
function appointmentToItem(a: Appointment): Item {
  const s = splitIso(a.start);
  return {
    kind: 'appointment',
    id: a.id,
    customer: a.customer,
    address: a.address,
    pos: { lat: a.lat, lng: a.lng },
    visitationType: a.visitationType,
    appointmentType: a.type,
    duration: splitIso(a.end).minutes - s.minutes,
    earliest: null,
    fixedStart: s.minutes,
    createdAt: '',
    eligible: new Set([a.technicianId]),
    manual: null,
  };
}

// MARK: - Öffentliche Optionen

export interface ApprovedRoute {
  at: string;
  stops: { id: string; start: string }[];
}

export interface PlanOptions {
  travel?: TravelLookup;
  travelStats?: MatrixStats;
  /** key "techId@date" → freigegebene Route (Stopps + Startzeiten) */
  approvals?: Record<string, ApprovedRoute>;
  /** Manuelle Entscheidungen des Planers je Anfrage */
  decisions?: Record<string, Decision>;
  optimize?: boolean;
}

// MARK: - buildPlan – Hauptablauf (EINSTIEG)

/**
 * Erzeugt den kompletten Wochenplan. Reine Funktion: gleiche Eingabe → gleicher Plan (deterministisch).
 * Phasen: 1 Slots + Vorbelegung → 1a Datenfehler → 1b Planer-Entscheidungen → 2 Greedy → 3 2-opt/Relocate
 *         → 4 Warteliste erneut → 4b „ältere zuerst“-Tausch → 5 Ergebnis aufbereiten.
 * Jede Phase ist unten mit `// MARK: Phase …` markiert.
 */
export function buildPlan(data: Dataset, opts: PlanOptions = {}): Plan {
  const travel = opts.travel ?? estimateLookup;
  const approvals = opts.approvals ?? {};
  const optimize = opts.optimize ?? true;

  const items = new Map<string, Item>();
  for (const r of data.requests) {
    const it = requestToItem(r, data.technicians);
    if (it) items.set(r.id, it);
  }

  // MARK: Phase 1 – Personen-Tage anlegen
  // 1) Tages-Slots aus den Verfügbarkeiten (gesperrte Tage fallen raus), fixe Termine vorbelegen
  // DATEN: Kein Verfügbarkeitseintrag = nicht verfügbar (z. B. tech_06) → es entsteht schlicht kein Slot.
  // REGEL-6: fixe Termine werden als unverrückbare Items vorbelegt. Freigegebene Routen (approvals) ebenso → Slot `locked`.
  const slots: Slot[] = [];
  const pinned = new Set<string>();
  for (const entry of data.availability) {
    if (entry.blocked) continue;
    const tech = data.technicians.find((t) => t.id === entry.technicianId);
    if (!tech) continue;
    const fixed = data.appointments
      .filter((a) => a.technicianId === tech.id && splitIso(a.start).date === entry.date)
      .map(appointmentToItem);
    const approval = approvals[`${tech.id}@${entry.date}`] ?? null;
    if (approval) {
      for (const s of approval.stops) {
        const it = items.get(s.id);
        if (!it || pinned.has(s.id)) continue;
        fixed.push({ ...it, fixedStart: toMinutes(s.start) });
        pinned.add(s.id);
      }
    }
    fixed.sort((a, b) => (a.fixedStart ?? 0) - (b.fixedStart ?? 0));
    slots.push({
      tech,
      date: entry.date,
      windowStart: toMinutes(entry.start),
      windowEnd: toMinutes(entry.end),
      items: fixed,
      locked: approval ? { at: approval.at } : null,
    });
  }
  const open = slots.filter((s) => !s.locked);
  const sim = (slot: Slot, list = slot.items) => simulate(slot, list, travel);
  const decisions = opts.decisions ?? {};
  /**
   * Nicht eingeplante Anfragen mit Grund. ACHTUNG: Der Grund-Text beginnt mit einem festen Präfix, auf das andere
   * Dateien per startsWith()/Regex prüfen (Status, Warteliste, Prognose, Prüfung). Präfix ändern = überall ändern:
   *   „Kapazität erschöpft“ · „Passt in keinen Tag“ · „Zeitwunsch klären“ · „Aus dem Plan genommen“ · „Datenfehler“
   *   „Keine Koordinaten“ · „Nicht zuordenbar“ · „Zuständige Außendienstler ohne Verfügbarkeit“ · „Fixierung nicht möglich“
   * Fundstellen: `npm run code:index -- GRUND-PRAEFIX` · docs/10-code-navigation.md#8--warteliste-gründe
   */
  const unassigned: UnassignedRequest[] = [];
  const waiting: Item[] = [];
  const handled = new Set<string>(pinned);

  // MARK: Phase 1a – Datenfehler aussortieren
  // 1a) Datenfehler sperren die Planung – auch für manuelle Entscheidungen. Nach der Korrektur wird automatisch geplant.
  for (const [id, message] of blockingErrors(data)) {
    if (handled.has(id)) continue;
    unassigned.push({ requestId: id, reason: `Datenfehler – zuerst korrigieren: ${message}` });
    handled.add(id);
  }

  // MARK: Phase 1b – Manuelle Entscheidungen des Planers (exclude / pin)
  // 1b) Planer-Entscheidungen zuerst: "aus Plan genommen" und "fixiert" (Planer entscheidet, Regeln werden danach geprüft)
  const byTime = Object.entries(decisions).sort(([, a], [, b]) => a.at.localeCompare(b.at));
  for (const [id, d] of byTime) {
    if (handled.has(id) || !data.requests.some((r) => r.id === id)) continue;
    if (d.mode === 'exclude') {
      unassigned.push({ requestId: id, reason: `Aus dem Plan genommen: ${d.reason}` });
      handled.add(id);
      continue;
    }
    if (d.mode !== 'pin') continue;
    handled.add(id);
    const item = items.get(id);
    if (!item) {
      unassigned.push({ requestId: id, reason: 'Keine Koordinaten – zuerst geokodieren' });
      continue;
    }
    if (!item.eligible.size) {
      // REGEL-5: auch der Planer kann eine nicht zuordenbare Anfrage nicht fixieren
      unassigned.push({ requestId: id, reason: 'Nicht zuordenbar (kein Gebiet, > 15 km)' });
      continue;
    }
    item.manual = { mode: 'pin', reason: d.reason, override: d.override };
    const slot = open.find((s) => s.tech.id === d.technicianId && s.date === d.date);
    if (!slot) {
      unassigned.push({ requestId: id, reason: `Fixierung nicht möglich: ${d.technicianId} ist am ${d.date} nicht verfügbar oder die Route ist bereits freigegeben` });
      continue;
    }
    const at = insertionIndex(slot, item, sim, travel);
    slot.items.splice(at, 0, item);
  }

  /**
   * Günstigste regelkonforme Einfügestelle für ein Item („Cheapest Insertion“).
   * Probiert jeden zuständigen Slot × jede Position, simuliert den ganzen Tag und nimmt den kleinsten Fahrzeit-Zuwachs.
   * REGEL-5: nur Slots mit item.eligible.
   */
  function bestInsertion(item: Item, candidates: Slot[]) {
    let best: { slot: Slot; index: number; delta: number } | null = null;
    for (const slot of candidates) {
      if (!item.eligible.has(slot.tech.id)) continue;
      const base = sim(slot);
      if (!base.feasible) continue;
      for (let i = 0; i <= slot.items.length; i++) {
        const trial = [...slot.items.slice(0, i), item, ...slot.items.slice(i)];
        const s = sim(slot, trial);
        if (!s.feasible) continue;
        const delta = s.drive - base.drive;
        if (!best || delta < best.delta) best = { slot, index: i, delta };
      }
    }
    return best;
  }

  // MARK: Phase 2 – Greedy Cheapest Insertion
  // REGEL-8: 2) Älteste Anfragen zuerst
  const byPriority = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);
  const queue = [...data.requests].filter((r) => !handled.has(r.id)).sort(byPriority);

  for (const request of queue) {
    const item = items.get(request.id);
    if (!item) {
      unassigned.push({ requestId: request.id, reason: 'Keine Koordinaten – zuerst geokodieren' });
      continue;
    }
    if (!item.eligible.size) {
      // REGEL-5 · DATEN: z. B. Innsbruck – außerhalb aller Gebiete und > 15 km von jedem Wohnort
      unassigned.push({ requestId: request.id, reason: 'Nicht zuordenbar (kein Gebiet, > 15 km)' });
      continue;
    }
    if (!slots.some((s) => item.eligible.has(s.tech.id))) {
      unassigned.push({ requestId: request.id, reason: 'Zuständige Außendienstler ohne Verfügbarkeit' });
      continue;
    }
    const best = bestInsertion(item, open);
    if (best) best.slot.items.splice(best.index, 0, item);
    else waiting.push(item);
  }

  const totalDrive = () => slots.reduce((n, s) => n + sim(s).drive, 0);
  const greedyDrive = totalDrive();

  // MARK: Phase 3 – Lokale Verbesserung (2-opt + Relocate)
  // 3) Lokale Verbesserung. Jeder Schritt wird voll simuliert → Regeln bleiben garantiert erfüllt.
  // TRADE-OFF: max. 4 Runden und Mindestgewinn 0,5 min – stoppt sicher, findet aber kein globales Optimum.
  // Tests sichern ab: Ergebnis ist nie schlechter als Greedy (greedyDrive).
  let improvements = 0;
  if (optimize) {
    for (let round = 0; round < 4; round++) {
      let improved = false;
      // 2-opt je Tour
      for (const slot of open) {
        let base = sim(slot);
        for (let i = 0; i < slot.items.length - 1; i++) {
          for (let j = i + 1; j < slot.items.length; j++) {
            const trial = [...slot.items.slice(0, i), ...slot.items.slice(i, j + 1).reverse(), ...slot.items.slice(j + 1)];
            const s = sim(slot, trial);
            if (s.feasible && s.drive < base.drive - 0.5) {
              slot.items = trial;
              base = s;
              improved = true;
              improvements++;
            }
          }
        }
      }
      // Relocate: Anfrage in eine andere Tour / an einen anderen Tag
      // REGEL-6: fixe Termine und vom Planer fixierte Anfragen werden nie verschoben
      for (const slot of open) {
        for (const item of [...slot.items]) {
          if (item.fixedStart !== null || item.manual?.mode === 'pin') continue;
          const before = sim(slot).drive;
          const without = slot.items.filter((x) => x !== item);
          const removedDrive = sim(slot, without).drive;
          const saving = before - removedDrive;
          const prev = slot.items;
          slot.items = without;
          const best = bestInsertion(item, open);
          if (best && best.delta < saving - 0.5) {
            best.slot.items.splice(best.index, 0, item);
            improved = true;
            improvements++;
          } else slot.items = prev;
        }
      }
      if (!improved) break;
    }
  }

  // MARK: Phase 4 – Warteliste erneut einplanen
  // REGEL-8: 4) Freigewordene Kapazität: Warteliste erneut, älteste zuerst
  let stillWaiting: Item[] = [];
  for (const item of waiting.sort(byPriority)) {
    const best = bestInsertion(item, open);
    if (best) best.slot.items.splice(best.index, 0, item);
    else stillWaiting.push(item);
  }

  // MARK: Phase 4b – „Ältere zuerst“ per Tausch durchsetzen
  // REGEL-8: 4b) „Ältere zuerst“ durchsetzen: Nach der Optimierung kann eine jüngere Anfrage einen Platz belegen, in den eine
  // wartende ältere passen würde. Dann wird getauscht (regelkonform), die jüngere sucht sich einen anderen Platz
  // oder rückt auf die Warteliste. Vom Planer fixierte Stopps werden nie verdrängt.
  let swaps = 0;
  // ACHTUNG: `guard` begrenzt die Tausch-Runden hart (200) – Schutz gegen Endlosschleifen bei Ping-Pong-Tauschen.
  for (let guard = 0; guard < 200; guard++) {
    let done = false;
    for (const w of [...stillWaiting].sort(byPriority)) {
      let best: { slot: Slot; victim: Item; list: Item[]; score: number } | null = null;
      for (const slot of open) {
        if (!w.eligible.has(slot.tech.id)) continue;
        const base = sim(slot);
        if (!base.feasible) continue;
        for (const victim of slot.items) {
          if (victim.kind !== 'request' || victim.fixedStart !== null || victim.manual || victim.createdAt <= w.createdAt) continue;
          const without = slot.items.filter((x) => x !== victim);
          for (let i = 0; i <= without.length; i++) {
            const trial = [...without.slice(0, i), w, ...without.slice(i)];
            const s2 = sim(slot, trial);
            if (!s2.feasible) continue;
            // Jüngstes Opfer zuerst, dann geringste Mehrfahrzeit
            const score = -Date.parse(victim.createdAt) / 6e4 + (s2.drive - base.drive);
            if (!best || score < best.score) best = { slot, victim, list: trial, score };
          }
        }
      }
      if (!best) continue;
      best.slot.items = best.list;
      stillWaiting = stillWaiting.filter((x) => x !== w);
      const again = bestInsertion(best.victim, open);
      if (again) again.slot.items.splice(again.index, 0, best.victim);
      else stillWaiting.push(best.victim);
      swaps++;
      done = true;
      break; // Lage hat sich geändert → von der ältesten Wartenden neu beginnen
    }
    if (!done) break;
  }
  // MARK: Phase 4c – Warteliste begründen: Kapazität oder „passt nie“?
  // REGEL-8 · DATEN: Nur echte Kapazitätsfälle kommen auf die Warteliste („ältere zuerst“, Prüfung `priority`).
  // Eine Anfrage, die selbst an einem leeren Tag nicht passt (z. B. Kunde erst ab 17 Uhr + 105 min), braucht eine
  // Klärung mit Kunde/Vertrieb – mehr Kapazität hilft ihr nicht. Sie zählt in der Prognose zu „needsAction.dataErrors“.
  for (const item of stillWaiting.sort(byPriority)) {
    // Passt sie selbst an einem leeren Tag nicht (Fenster, Kundenzeit, Fahrzeit), ist das kein Kapazitätsproblem
    const tries = slots.filter((s) => item.eligible.has(s.tech.id)).map((s) => simulate({ ...s, items: [] }, [item], travel));
    const fitsSomewhere = tries.some((t) => t.feasible);
    unassigned.push({
      requestId: item.id,
      reason: fitsSomewhere ? 'Kapazität erschöpft (Warteliste)' : `Passt in keinen Tag: ${tries.find((t) => t.reason)?.reason ?? 'Zeitfenster zu kurz'}`,
    });
  }

  // MARK: Phase 5 – Ergebnis für API/UI aufbereiten (Uhrzeiten als HH:MM, Kennzahlen)
  // 5) Ergebnis aufbereiten
  const routes: DayRoute[] = slots
    .map((slot) => {
      // Fixe Termine können selbst schon Regeln verletzen → dann ohne Prüfung darstellen (Validator meldet es)
      const strictSim = sim(slot);
      const s = strictSim.feasible ? strictSim : simulate(slot, slot.items, travel, false);
      const workMinutes = s.stops.reduce((sum, st) => sum + (toMinutes(st.end) - toMinutes(st.start)), 0);
      const windowMinutes = slot.windowEnd - slot.windowStart;
      return {
        technicianId: slot.tech.id,
        date: slot.date,
        window: { start: toHHMM(slot.windowStart), end: toHHMM(slot.windowEnd) },
        departure: toHHMM(s.departure),
        returnHome: toHHMM(s.returnHome),
        lunch: s.lunch ? { start: toHHMM(s.lunch[0]), end: toHHMM(s.lunch[1]) } : null,
        stops: s.stops,
        driveMinutes: s.drive === Infinity ? 0 : s.drive,
        workMinutes,
        utilization: windowMinutes ? Math.round(((workMinutes + (s.stops.length ? s.drive : 0)) / windowMinutes) * 100) : 0,
        approved: slot.locked,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.technicianId.localeCompare(b.technicianId));

  const planned = routes.reduce((n, r) => n + r.stops.filter((s) => s.kind === 'request').length, 0);
  const driveMinutes = routes.reduce((n, r) => n + r.driveMinutes, 0);
  const visits = routes.reduce((n, r) => n + r.stops.length, 0);
  return {
    generatedAt: new Date().toISOString(),
    travelSource: opts.travelStats?.source ?? 'estimate',
    travel: opts.travelStats ?? null,
    routes,
    unassigned,
    stats: {
      totalRequests: data.requests.length,
      planned,
      unassigned: unassigned.length,
      driveMinutes,
      greedyDriveMinutes: optimize ? greedyDrive : driveMinutes,
      baseline: baselinePlan(data, travel),
      improvements,
      prioritySwaps: swaps,
      avgDrivePerVisit: visits ? Math.round(driveMinutes / visits) : 0,
      approvedRoutes: routes.filter((r) => r.approved).length,
      routesWithStops: routes.filter((r) => r.stops.length).length,
    },
  };
}

// MARK: - Hilfen für manuelle Eingriffe

/**
 * Einfügestelle für eine vom Planer fixierte Anfrage: regelkonform, wenn möglich;
 * sonst die Stelle mit der kürzesten Fahrzeit (Regelbruch – der Validator weist ihn aus).
 */
function insertionIndex(slot: Slot, item: Item, sim: (slot: Slot, list?: Item[]) => SimResult, travel: TravelLookup): number {
  let best = { index: slot.items.length, drive: Infinity, strict: false };
  for (let i = 0; i <= slot.items.length; i++) {
    const trial = [...slot.items.slice(0, i), item, ...slot.items.slice(i)];
    const s = sim(slot, trial);
    if (s.feasible) {
      if (!best.strict || s.drive < best.drive) best = { index: i, drive: s.drive, strict: true };
    } else if (!best.strict) {
      const loose = simulate(slot, trial, travel, false);
      if (loose.drive < best.drive) best = { index: i, drive: loose.drive, strict: false };
    }
  }
  return best.index;
}

// MARK: - Vorschau „Verschieben / Einplanen …“ (EINSTIEG: GET /api/requests/:id/options)

/**
 * Mögliche Slots für eine Anfrage auf Basis des aktuellen Plans (für "Verschieben…").
 * Pro Techniker-Tag: günstigste Einfügestelle, Zusatz-Fahrzeit und was dabei gegen Regeln verstoßen würde.
 * Es wird nichts geändert – das ist die Vorschau, die der Planer vor dem Übernehmen sieht.
 */
export function rankOptions(data: Dataset, plan: Plan, requestId: string, opts: PlanOptions = {}): SlotOption[] {
  const travel = opts.travel ?? estimateLookup;
  const request = data.requests.find((r) => r.id === requestId);
  if (!request) return [];
  const item = requestToItem(request, data.technicians);
  if (!item) return [];
  const toItem = (stop: PlannedStop, approved: boolean): Item | null => {
    if (stop.kind === 'appointment') {
      const a = data.appointments.find((x) => x.id === stop.id);
      return a ? appointmentToItem(a) : null;
    }
    const r = data.requests.find((x) => x.id === stop.id);
    const it = r ? requestToItem(r, data.technicians) : null;
    return it ? { ...it, fixedStart: approved ? toMinutes(stop.start) : null } : null;
  };

  const options: SlotOption[] = [];
  for (const route of plan.routes) {
    const tech = data.technicians.find((t) => t.id === route.technicianId);
    if (!tech) continue;
    const slot: Slot = {
      tech,
      date: route.date,
      windowStart: toMinutes(route.window.start),
      windowEnd: toMinutes(route.window.end),
      items: route.stops.filter((s) => s.id !== requestId).map((s) => toItem(s, !!route.approved)).filter((x): x is Item => !!x),
      locked: route.approved,
    };
    const current = route.stops.some((s) => s.id === requestId);
    const base = simulate(slot, slot.items, travel);
    const baseDrive = base.feasible ? base.drive : simulate(slot, slot.items, travel, false).drive;
    const sourceSaving = current ? Math.max(0, route.driveMinutes - baseDrive) : 0;
    const warnings: string[] = [];
    if (!item.eligible.has(tech.id)) warnings.push(`Außerhalb des Gebiets von ${tech.name} und > 15 km vom Wohnort`);

    // Regelkonform bevorzugt; sonst die kürzeste Variante mit Begründung, was sie verletzt
    let ok: { stop: PlannedStop; drive: number } | null = null;
    let loose: { stop: PlannedStop | null; drive: number; reason?: string } | null = null;
    for (let i = 0; i <= slot.items.length; i++) {
      const trial = [...slot.items.slice(0, i), item, ...slot.items.slice(i)];
      const s = simulate(slot, trial, travel);
      if (s.feasible) {
        if (!ok || s.drive < ok.drive) ok = { stop: s.stops[i], drive: s.drive };
      } else if (!ok) {
        const l = simulate(slot, trial, travel, false);
        if (!loose || l.drive < loose.drive) loose = { stop: l.stops[i] ?? null, drive: l.drive, reason: s.reason };
      }
    }
    const best = ok ?? loose;
    if (!ok && !base.feasible) warnings.push('Die Route verletzt bereits ohne diese Anfrage Regeln');
    else if (!ok && loose?.reason) warnings.push(loose.reason);
    options.push({
      technicianId: tech.id,
      technicianName: tech.name,
      date: route.date,
      start: best?.stop?.start ?? null,
      end: best?.stop?.end ?? null,
      deltaDrive: best ? Math.round(best.drive - baseDrive) : 0,
      sourceSaving: Math.round(sourceSaving),
      stopsBefore: slot.items.length,
      warnings,
      blocked: route.approved ? 'Route ist freigegeben – zuerst die Freigabe zurücknehmen' : null,
      current,
    });
  }
  // Regelkonforme zuerst, dann nach Zusatz-Fahrzeit; gesperrte ans Ende
  const rank = (o: SlotOption) => (o.blocked ? 2 : o.warnings.length ? 1 : 0);
  return options.sort((a, b) => rank(a) - rank(b) || a.deltaDrive - b.deltaDrive || a.date.localeCompare(b.date));
}

// MARK: - Prüfhilfe „ältere zuerst“ (REGEL-8, genutzt von verify.ts)

/**
 * Könnte die wartende Anfrage regelkonform den Platz einer jüngeren, nicht vom Planer gesetzten Anfrage einnehmen?
 * Liefert den ersten solchen Tausch oder null. Freigegebene Routen und fixe Termine bleiben unberührt.
 */
export function olderCouldReplace(data: Dataset, plan: Plan, requestId: string, opts: PlanOptions = {}): { technicianId: string; date: string; displacedId: string; displacedCustomer: string } | null {
  const travel = opts.travel ?? estimateLookup;
  const decisions = opts.decisions ?? {};
  const request = data.requests.find((r) => r.id === requestId);
  const item = request ? requestToItem(request, data.technicians) : null;
  if (!request || !item) return null;
  const toItem = (id: string, kind: PlannedStop['kind']): Item | null => {
    if (kind === 'appointment') {
      const a = data.appointments.find((x) => x.id === id);
      return a ? appointmentToItem(a) : null;
    }
    const r = data.requests.find((x) => x.id === id);
    return r ? requestToItem(r, data.technicians) : null;
  };
  for (const route of plan.routes) {
    const tech = data.technicians.find((t) => t.id === route.technicianId);
    if (route.approved || !tech || !item.eligible.has(tech.id)) continue;
    const slot: Slot = {
      tech,
      date: route.date,
      windowStart: toMinutes(route.window.start),
      windowEnd: toMinutes(route.window.end),
      items: route.stops.map((x) => toItem(x.id, x.kind)).filter((x): x is Item => !!x),
      locked: null,
    };
    for (const stop of route.stops) {
      if (stop.kind !== 'request' || stop.fixed || stop.manual || decisions[stop.id]?.mode === 'pin') continue;
      const displaced = data.requests.find((r) => r.id === stop.id);
      if (!displaced || displaced.createdAt <= request.createdAt) continue;
      const without = slot.items.filter((x) => x.id !== stop.id);
      for (let i = 0; i <= without.length; i++) {
        if (simulate(slot, [...without.slice(0, i), item, ...without.slice(i)], travel).feasible)
          return { technicianId: tech.id, date: route.date, displacedId: stop.id, displacedCustomer: stop.customer };
      }
    }
  }
  return null;
}

// MARK: - Vergleich: so würde man von Hand planen (Baseline für die Ersparnis-Anzeige)

/**
 * Baseline „Handplanung“: älteste zuerst, jede Anfrage an die zuständige Person mit dem nächstgelegenen Wohnort,
 * am ersten Tag, an dem sie hinten an die Tagesliste passt. Keine Routen-Optimierung, kein Umverteilen.
 * Gleiche Regeln und Fahrzeiten wie der Planer (simulate) → fairer Vergleich.
 * TRADE-OFF: vereinfachtes Modell eines menschlichen Planers – echte Vergleichsdaten von Heizma gibt es nicht.
 */
export function baselinePlan(data: Dataset, travel: TravelLookup = estimateLookup): { planned: number; driveMinutes: number } {
  const slots: Slot[] = [];
  for (const entry of data.availability) {
    if (entry.blocked) continue;
    const tech = data.technicians.find((t) => t.id === entry.technicianId);
    if (!tech) continue;
    const fixed = data.appointments
      .filter((a) => a.technicianId === tech.id && splitIso(a.start).date === entry.date)
      .map(appointmentToItem)
      .sort((a, b) => (a.fixedStart ?? 0) - (b.fixedStart ?? 0));
    slots.push({ tech, date: entry.date, windowStart: toMinutes(entry.start), windowEnd: toMinutes(entry.end), items: fixed, locked: null });
  }
  slots.sort((a, b) => a.date.localeCompare(b.date));
  const blocked = blockingErrors(data);
  let planned = 0;
  for (const r of [...data.requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (blocked.has(r.id)) continue;
    const item = requestToItem(r, data.technicians);
    if (!item || !item.eligible.size) continue;
    const techs = data.technicians
      .filter((t) => item.eligible.has(t.id))
      .sort((a, b) => haversineKm(a.home, item.pos) - haversineKm(b.home, item.pos));
    placing: for (const tech of techs) {
      for (const slot of slots) {
        if (slot.tech.id !== tech.id) continue;
        const trial = [...slot.items, item];
        if (simulate(slot, trial, travel).feasible) {
          slot.items = trial;
          planned++;
          break placing;
        }
      }
    }
  }
  const driveMinutes = slots.reduce((n, slot) => n + (slot.items.length ? simulate(slot, slot.items, travel, false).drive : 0), 0);
  return { planned, driveMinutes: Math.round(driveMinutes) };
}

// MARK: - Datenfehler

/**
 * DATEN: Anfragen mit Datenfehler (Severity "error"), die nicht schon eigene Gründe haben
 * (fehlende Koordinaten / nicht zuordenbar werden weiter unten mit eigenem Grund ausgewiesen).
 */
function blockingErrors(data: Dataset): Map<string, string> {
  const out = new Map<string, string>();
  for (const i of validateDataset(data))
    if (i.entity === 'request' && i.severity === 'error' && i.code !== 'NO_COORDS' && i.code !== 'NOT_ASSIGNABLE' && !out.has(i.entityId)) out.set(i.entityId, i.message);
  return out;
}

/** Alle Datenfehler einer Anfrage (inkl. Koordinaten / Zuständigkeit) – Grund, warum sie nicht planbar ist */
export function requestErrors(data: Dataset, requestId: string): string[] {
  return validateDataset(data).filter((i) => i.entity === 'request' && i.entityId === requestId && i.severity === 'error').map((i) => i.message);
}
