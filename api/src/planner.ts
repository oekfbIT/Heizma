/**
 * @file      planner.ts – Kern der Einsatzplanung (Anfragen → Personen-Tage → Tagesrouten)
 * @layer     Backend · Domäne (reine Funktionen, kein I/O)
 * @einstieg  buildPlan() · rankOptions() · swapOptions() · forecast()
 * @nutzt     travelMatrix (Fahrzeiten), validation (Zuständigkeit, Datenfehler), timeWish (Notiz-Zeitwünsche)
 * @genutzt   index.ts (HTTP-Routen), verify.ts prüft das Ergebnis unabhängig nach
 * @siehe     docs/03-planung-und-regeln.md · docs/10-code-navigation.md
 *
 * Lesereihenfolge für Reviewer:
 *   1. RULES (Konstanten)  2. simulate() – hier stecken alle Tagesregeln  3. buildPlan() Phasen 1–5
 *   4. rankOptions()/swapOptions() – Vorschauen für manuelle Eingriffe   5. forecast() – Mehrwochen-Projektion
 * Schnellsuche: `grep -n "REGEL-" planner.ts` zeigt, wo jede Case-Regel umgesetzt ist.
 */
import { hasCoords } from './geo.js';
import { parseTimeWish } from './timeWish.js';
import { normalizeTime, splitIso, toHHMM, toMinutes } from './time.js';
import { estimateLookup, type MatrixStats, type TravelLookup } from './travelMatrix.js';
import { eligibleTechnicians, validateDataset } from './validation.js';
import type { Appointment, Dataset, DayRoute, Decision, LatLng, ManualMark, Plan, PlannedStop, ServiceRequest, RoutePreview, SlotOption, SwapOption, Technician, UnassignedRequest } from './types.js';

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
  earliest: number | null; // customerAvailableFrom (+ bestätigte Notiz)
  latestEnd: number | null; // bestätigte Notiz „nur vormittags“ etc.
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
    if (item.latestEnd !== null && end > item.latestEnd && strict) return fail(`${item.customer} endet ${toHHMM(end)}, laut Notiz nur bis ${toHHMM(item.latestEnd)}`);

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
function requestToItem(r: ServiceRequest, techs: Technician[], note?: NoteConstraint): Item | null {
  if (!hasCoords(r)) return null;
  const norm = normalizeTime(r.customerAvailableFrom);
  const from = norm ? toMinutes(norm) : null;
  const noteFrom = note?.earliest ? toMinutes(note.earliest) : null;
  const earliest = from === null ? noteFrom : noteFrom === null ? from : Math.max(from, noteFrom);
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
    latestEnd: note?.latest ? toMinutes(note.latest) : null,
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
    latestEnd: null,
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

export interface NoteConstraint {
  earliest?: string;
  latest?: string;
}

export interface PlanOptions {
  /** Vom Planer bestätigte Zeit-Hinweise aus den Notizen */
  noteConstraints?: Record<string, NoteConstraint>;
  travel?: TravelLookup;
  travelStats?: MatrixStats;
  /** key "techId@date" → freigegebene Route (Stopps + Startzeiten) */
  approvals?: Record<string, ApprovedRoute>;
  /** Manuelle Entscheidungen des Planers je Anfrage */
  decisions?: Record<string, Decision>;
  optimize?: boolean;
}

// MARK: - Zeitwünsche aus Vertriebsnotizen

/**
 * DATEN: Notizen sind Freitext (37 Stück im Datensatz). timeWish.ts liest Zeitwünsche regelbasiert heraus.
 * Zeitwünsche aus Notizen: bestätigte gelten wie bestätigt (leeres Objekt = verworfen).
 * Unbestätigte werden mit `withPending` als harte Grenze eingesetzt (bei manuellen Eingriffen),
 * sonst bleiben sie außen vor – die Anfrage wird dann gar nicht automatisch geplant.
 */
function pendingTimeWishes(data: Dataset, confirmed: Record<string, NoteConstraint> = {}): Set<string> {
  return new Set(data.requests.filter((r) => !(r.id in confirmed) && parseTimeWish(r.notes)).map((r) => r.id));
}
function effectiveNotes(data: Dataset, confirmed: Record<string, NoteConstraint> = {}, withPendingFor?: (id: string) => boolean): Record<string, NoteConstraint> {
  const out: Record<string, NoteConstraint> = { ...confirmed };
  for (const r of data.requests) {
    if (r.id in confirmed || (withPendingFor && !withPendingFor(r.id))) continue;
    const w = parseTimeWish(r.notes);
    if (w) out[r.id] = { earliest: w.earliest, latest: w.latest };
  }
  return out;
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

  const pendingWish = pendingTimeWishes(data, opts.noteConstraints);
  // Manuell eingeplant (fixiert/vorgezogen) trotz offenem Zeitwunsch → Wunsch gilt sicherheitshalber als harte Grenze
  const notes = effectiveNotes(data, opts.noteConstraints, (id) => !!opts.decisions?.[id] && opts.decisions[id].mode !== 'exclude');
  const items = new Map<string, Item>();
  for (const r of data.requests) {
    const it = requestToItem(r, data.technicians, notes[r.id]);
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
  // Tausch: verdrängte Anfrage darf nicht in die Tour zurück, aus der sie bewusst genommen wurde
  const banned = new Map<string, string>();
  for (const d of Object.values(decisions)) if (d.mode === 'pin' && d.replaces) banned.set(d.replaces, `${d.technicianId}@${d.date}`);
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
   * REGEL-5: nur Slots mit item.eligible · `banned`: nach Tausch nicht in die Ursprungstour zurück.
   */
  function bestInsertion(item: Item, candidates: Slot[]) {
    let best: { slot: Slot; index: number; delta: number } | null = null;
    for (const slot of candidates) {
      if (!item.eligible.has(slot.tech.id)) continue;
      if (banned.get(item.id) === `${slot.tech.id}@${slot.date}`) continue;
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
  // REGEL-8: 2) Älteste Anfragen zuerst – vom Planer vorgezogene vor allen anderen
  const prio = (id: string) => (decisions[id]?.mode === 'prioritize' ? 0 : 1);
  const byPriority = (a: { id: string; createdAt: string }, b: { id: string; createdAt: string }) => prio(a.id) - prio(b.id) || a.createdAt.localeCompare(b.createdAt);
  const queue = [...data.requests].filter((r) => !handled.has(r.id)).sort(byPriority);
  for (const r of queue) {
    const d = decisions[r.id];
    const it = items.get(r.id);
    if (d?.mode === 'prioritize' && it) it.manual = { mode: 'prioritize', reason: d.reason, override: d.override };
  }

  for (const request of queue) {
    const item = items.get(request.id);
    // DATEN · ANNAHME: Offener Zeitwunsch aus der Notiz: nie automatisch einplanen – erst bestätigt oder verworfen
    if (pendingWish.has(request.id) && !decisions[request.id]) {
      unassigned.push({ requestId: request.id, reason: `Zeitwunsch klären: „${request.notes}“` });
      continue;
    }
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
  // oder rückt auf die Warteliste. Manuell fixierte/vorgezogene Stopps werden nie verdrängt.
  let swaps = 0;
  // ACHTUNG: `guard` begrenzt die Tausch-Runden hart (200) – Schutz gegen Endlosschleifen bei Ping-Pong-Tauschen.
  for (let guard = 0; guard < 200; guard++) {
    let done = false;
    for (const w of [...stillWaiting].sort(byPriority)) {
      let best: { slot: Slot; victim: Item; list: Item[]; score: number } | null = null;
      for (const slot of open) {
        if (!w.eligible.has(slot.tech.id) || banned.get(w.id) === `${slot.tech.id}@${slot.date}`) continue;
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
  const notes = effectiveNotes(data, opts.noteConstraints);
  const item = requestToItem(request, data.technicians, notes[requestId]);
  if (!item) return [];
  const toItem = (stop: PlannedStop, approved: boolean): Item | null => {
    if (stop.kind === 'appointment') {
      const a = data.appointments.find((x) => x.id === stop.id);
      return a ? appointmentToItem(a) : null;
    }
    const r = data.requests.find((x) => x.id === stop.id);
    const it = r ? requestToItem(r, data.technicians, notes[r.id]) : null;
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

// MARK: - Tausch-Vorschläge für wartende Anfragen (REGEL-8, manuell)

/**
 * Tausch-Vorschläge für eine wartende Anfrage: Welche geplante Anfrage müsste weichen,
 * damit sie regelkonform in eine Tour passt? Nie fixe Termine, freigegebene Touren oder manuell fixierte/vorgezogene Stopps.
 * Empfehlung: zuerst wer jünger ist (keine Verletzung von „ältere zuerst“) und anderswo unterkommt, dann geringste Mehrfahrzeit.
 */
export function swapOptions(data: Dataset, plan: Plan, requestId: string, opts: PlanOptions & { withFallback?: boolean; onlyYounger?: boolean } = {}): SwapOption[] {
  const travel = opts.travel ?? estimateLookup;
  const notes = effectiveNotes(data, opts.noteConstraints);
  const decisions = opts.decisions ?? {};
  const request = data.requests.find((r) => r.id === requestId);
  const item = request ? requestToItem(request, data.technicians, notes[requestId]) : null;
  if (!request || !item) return [];
  const reqItem = (id: string) => {
    const r = data.requests.find((x) => x.id === id);
    return r ? requestToItem(r, data.technicians, notes[id]) : null;
  };
  const slotOf = (route: DayRoute, tech: Technician): Slot => ({
    tech,
    date: route.date,
    windowStart: toMinutes(route.window.start),
    windowEnd: toMinutes(route.window.end),
    items: route.stops
      .map((s) => (s.kind === 'appointment' ? (() => { const a = data.appointments.find((x) => x.id === s.id); return a ? appointmentToItem(a) : null; })() : reqItem(s.id)))
      .filter((x): x is Item => !!x),
    locked: route.approved,
  });
  const bestInsert = (slot: Slot, it: Item, list: Item[]) => {
    let best: { drive: number; stop: PlannedStop; sim: SimResult; list: Item[] } | null = null;
    for (let i = 0; i <= list.length; i++) {
      const trial = [...list.slice(0, i), it, ...list.slice(i)];
      const s = simulate(slot, trial, travel);
      if (s.feasible && (!best || s.drive < best.drive)) best = { drive: s.drive, stop: s.stops[i], sim: s, list: trial };
    }
    return best;
  };
  const preview = (slot: Slot, s: SimResult, newId: string | null): RoutePreview => ({
    window: { start: toHHMM(slot.windowStart), end: toHHMM(slot.windowEnd) },
    departure: toHHMM(s.departure),
    returnHome: toHHMM(s.returnHome),
    totalMinutes: s.stops.length ? s.returnHome - s.departure : 0,
    driveMinutes: Math.round(s.drive),
    workMinutes: s.stops.reduce((n, x) => n + x.durationMinutes, 0),
    lunch: s.lunch ? { start: toHHMM(s.lunch[0]), end: toHHMM(s.lunch[1]) } : null,
    stops: s.stops.map((x) => ({ id: x.id, customer: x.customer, address: x.address, start: x.start, end: x.end, travelMinutes: x.travelMinutes, kind: x.kind, isNew: x.id === newId })),
  });
  /**
   * Nachprüfung der neuen Tagesroute fürs UI (Checkliste im Tausch-Dialog) – gleiche Regeln wie im Briefing.
   * ACHTUNG: Das ist nur die UI-Checkliste. Die maßgebliche, unabhängige Prüfung ist verify.ts.
   */
  const checkRoute = (slot: Slot, s: SimResult, list: Item[]): SwapOption['checks'] => {
    const byId = new Map(list.map((x) => [x.id, x]));
    const m = toMinutes;
    const late = s.stops.filter((x) => m(x.end) > slot.windowEnd);
    const custEarly = s.stops.filter((x) => { const it = byId.get(x.id); return it?.earliest != null && m(x.start) < it.earliest; });
    const overlap = s.stops.filter((x, i) => i > 0 && m(x.start) < m(s.stops[i - 1].end) + x.travelMinutes);
    const fixedMoved = s.stops.filter((x) => { const it = byId.get(x.id); return it?.fixedStart != null && m(x.start) !== it.fixedStart; });
    const foreign = s.stops.filter((x) => x.kind === 'request' && !byId.get(x.id)?.eligible.has(slot.tech.id));
    const over = s.returnHome - slot.windowEnd;
    const full = isFullDay(slot.windowStart, slot.windowEnd);
    const names = (xs: { customer: string }[]) => xs.map((x) => x.customer).join(', ');
    return [
      { label: 'Abfahrt im Verfügbarkeitsfenster', ok: s.departure >= slot.windowStart, detail: `${toHHMM(s.departure)} (ab ${toHHMM(slot.windowStart)})` },
      { label: 'Alle Termine inkl. Anfahrt im Fenster', ok: !late.length, detail: late.length ? names(late) : `bis ${toHHMM(slot.windowEnd)}` },
      { label: 'Heimfahrt max. 60 min über Fensterende', ok: over <= RETURN_TOLERANCE, detail: over > 0 ? `Heimkehr ${toHHMM(s.returnHome)} (+${over} min)` : `Heimkehr ${toHHMM(s.returnHome)}` },
      {
        label: 'Kunde verfügbar ab (customerAvailableFrom)',
        ok: !custEarly.length,
        detail: (() => {
          if (custEarly.length) return `zu früh: ${names(custEarly)}`;
          const withLimit = s.stops.filter((x) => x.kind === 'request' && byId.get(x.id)?.earliest != null).length;
          const without = s.stops.filter((x) => x.kind === 'request').length - withLimit;
          return [withLimit && `${withLimit}× Vorgabe eingehalten`, without && `${without}× ohne Vorgabe (ganztags)`].filter(Boolean).join(' · ') || undefined;
        })(),
      },
      { label: 'Keine Überschneidung inkl. Fahrzeit', ok: !overlap.length, detail: overlap.length ? names(overlap) : undefined },
      { label: 'Fixe Termine unverändert', ok: !fixedMoved.length, detail: fixedMoved.length ? names(fixedMoved) : undefined },
      { label: 'Zuständigkeit (Gebiet bzw. ≤ 15 km)', ok: !foreign.length, detail: foreign.length ? names(foreign) : undefined },
      { label: 'Mittagspause 60 min, Beginn 11:30–13:00', ok: true, detail: !full ? 'Halber Tag – keine Pause nötig' : s.lunch ? `${toHHMM(s.lunch[0])}–${toHHMM(s.lunch[1])}` : 'Passt nicht – entfällt (laut Regel erlaubt)' },
    ];
  };
  const openRoutes = plan.routes
    .filter((r) => !r.approved)
    .map((r) => ({ route: r, tech: data.technicians.find((t) => t.id === r.technicianId)! }))
    .filter((x) => x.tech);

  const out: SwapOption[] = [];
  // Aus dieser Tour wurde die Anfrage bewusst per Tausch genommen → dort nicht wieder vorschlagen (wie im Planer)
  const bannedKeys = new Set(Object.values(decisions).filter((d) => d.mode === 'pin' && d.replaces === requestId).map((d) => `${d.technicianId}@${d.date}`));
  for (const { route, tech } of openRoutes) {
    if (!item.eligible.has(tech.id) || bannedKeys.has(`${tech.id}@${route.date}`)) continue;
    const slot = slotOf(route, tech);
    for (const stop of route.stops) {
      if (stop.kind !== 'request' || stop.fixed || stop.manual) continue;
      const dm = decisions[stop.id]?.mode;
      if (dm === 'pin' || dm === 'prioritize') continue;
      const without = slot.items.filter((x) => x.id !== stop.id);
      const ins = bestInsert(slot, item, without);
      if (!ins) continue;
      const displacedReq = data.requests.find((r) => r.id === stop.id)!;
      if (opts.onlyYounger && displacedReq.createdAt <= request.createdAt) continue;
      // Kommt die verdrängte Anfrage woanders regelkonform unter?
      const dItem = reqItem(stop.id);
      let fallback: SwapOption['fallback'] = null;
      if (dItem && opts.withFallback !== false) {
        for (const o of openRoutes) {
          if (o.route === route || !dItem.eligible.has(o.tech.id)) continue;
          const os = slotOf(o.route, o.tech);
          const fi = bestInsert(os, dItem, os.items);
          if (fi && (!fallback || fi.drive - o.route.driveMinutes < fallback.deltaDrive))
            fallback = { technicianName: o.tech.name, date: o.route.date, deltaDrive: Math.round(fi.drive - o.route.driveMinutes) };
        }
      }
      out.push({
        technicianId: tech.id,
        technicianName: tech.name,
        date: route.date,
        displaced: { id: stop.id, customer: stop.customer, address: stop.address, createdAt: displacedReq.createdAt, start: stop.start, end: stop.end, notes: displacedReq.notes, timeWish: parseTimeWish(displacedReq.notes)?.hint ?? null },
        displacesOlder: displacedReq.createdAt < request.createdAt,
        start: ins.stop.start,
        end: ins.stop.end,
        driveBefore: route.driveMinutes,
        driveAfter: Math.round(ins.drive),
        deltaDrive: Math.round(ins.drive - route.driveMinutes),
        fallback,
        recommended: false,
        before: preview(slot, simulate(slot, slot.items, travel), null),
        after: preview(slot, ins.sim, requestId),
        checks: checkRoute(slot, ins.sim, ins.list),
      });
    }
  }
  const score = (o: SwapOption) => (o.displacesOlder ? 2 : 0) + (o.fallback ? 0 : 1);
  out.sort((a, b) => score(a) - score(b) || a.deltaDrive - b.deltaDrive || b.displaced.createdAt.localeCompare(a.displaced.createdAt));
  if (out[0]) out[0].recommended = true;
  return out;
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

// MARK: - Prognose: wie lange dauert es, die offenen Anfragen abzuarbeiten?
// ANNAHME: siehe `assumptions` unten – Verfügbarkeit wiederholt sich, keine neuen Anfragen, keine fixen Termine.

export interface ForecastWeek {
  index: number; // 0 = aktuelle Woche
  from: string;
  to: string;
  planned: number;
  remaining: number;
  driveMinutes: number;
}

export interface Forecast {
  weeks: ForecastWeek[];
  /** Wochen bis die Warteliste leer ist (inkl. aktueller); null = nicht abarbeitbar in maxWeeks */
  weeksNeeded: number | null;
  /** Bleibt hängen, obwohl Kapazität wiederholt wird (z. B. zuständige Person nie verfügbar) */
  stuck: number;
  /** Braucht eine Entscheidung, bevor es überhaupt planbar ist */
  needsAction: { review: number; dataErrors: number; excluded: number };
  byTechnician: { technicianId: string; name: string; weeks: number; requests: number }[];
  /** Wartende Anfrage → voraussichtlicher Termin in einer Folgewoche (Prognose) */
  placements: Record<string, { week: number; date: string; technicianId: string; start: string; end: string }>;
  assumptions: string[];
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Projektion: Die Verfügbarkeit dieser Woche wiederholt sich, es kommen keine neuen Anfragen dazu,
 * fixe Termine gibt es in Folgewochen nicht. Die Warteliste wird Woche für Woche mit demselben Planer
 * („ältere zuerst“, alle Regeln) eingeplant, bis sie leer ist oder nichts mehr vorankommt.
 */
export function forecast(data: Dataset, plan: Plan, opts: PlanOptions = {}, maxWeeks = 8): Forecast {
  return forecastWithPlans(data, plan, opts, maxWeeks).forecast;
}

/** Wie forecast, liefert zusätzlich die projizierten Wochenpläne samt Datensatz (für die Wochenansicht im Planer) */
export function forecastWithPlans(data: Dataset, plan: Plan, opts: PlanOptions = {}, maxWeeks = 8): { forecast: Forecast; plans: { data: Dataset; plan: Plan }[] } {
  const plans: { data: Dataset; plan: Plan }[] = [];
  const placements: Forecast['placements'] = {};
  // ACHTUNG · GRUND-PRAEFIX: prüft den Anfang von `reason` – muss zu den Texten in planner.ts buildPlan() passen
  const capacity = (u: UnassignedRequest) => u.reason.startsWith('Kapazität');
  let remaining = data.requests.filter((r) => plan.unassigned.some((u) => u.requestId === r.id && capacity(u)));
  const weeks: ForecastWeek[] = [
    { index: 0, from: data.range.from, to: data.range.to, planned: plan.stats.planned, remaining: remaining.length, driveMinutes: plan.stats.driveMinutes },
  ];
  const lastWeek = new Map<string, number>();
  const count = new Map<string, number>();
  for (const r of plan.routes) for (const s of r.stops) if (s.kind === 'request') {
    lastWeek.set(r.technicianId, 0);
    count.set(r.technicianId, (count.get(r.technicianId) ?? 0) + 1);
  }
  let stuck = 0;
  for (let w = 1; w <= maxWeeks && remaining.length; w++) {
    const shift = 7 * w;
    const week: Dataset = {
      ...data,
      requests: remaining,
      appointments: [],
      availability: data.availability.map((a) => ({ ...a, date: addDays(a.date, shift) })),
      range: { from: addDays(data.range.from, shift), to: addDays(data.range.to, shift) },
    };
    const p = buildPlan(week, { travel: opts.travel, noteConstraints: opts.noteConstraints, decisions: opts.decisions, optimize: true });
    plans.push({ data: week, plan: p });
    for (const r of p.routes) for (const s of r.stops) if (s.kind === 'request') placements[s.id] = { week: w, date: r.date, technicianId: r.technicianId, start: s.start, end: s.end };
    const left = week.requests.filter((r) => p.unassigned.some((u) => u.requestId === r.id && capacity(u)));
    weeks.push({ index: w, from: week.range.from, to: week.range.to, planned: p.stats.planned, remaining: left.length, driveMinutes: p.stats.driveMinutes });
    for (const r of p.routes) for (const s of r.stops) if (s.kind === 'request') {
      lastWeek.set(r.technicianId, w);
      count.set(r.technicianId, (count.get(r.technicianId) ?? 0) + 1);
    }
    if (p.stats.planned === 0) {
      stuck = left.length;
      remaining = left;
      break;
    }
    remaining = left;
  }
  const done = remaining.length === 0;
  return { plans, forecast: {
    weeks,
    placements,
    weeksNeeded: done ? weeks.length : null,
    stuck: done ? 0 : stuck || remaining.length,
    // ACHTUNG · GRUND-PRAEFIX: Zählung nach Grund-Präfix – neue Gründe hier einordnen
    needsAction: {
      review: plan.unassigned.filter((u) => u.reason.startsWith('Zeitwunsch')).length,
      dataErrors: plan.unassigned.filter((u) => /^(Datenfehler|Keine Koordinaten|Nicht zuordenbar|Zuständige|Passt in keinen Tag)/.test(u.reason)).length,
      excluded: plan.unassigned.filter((u) => u.reason.startsWith('Aus dem Plan')).length,
    },
    byTechnician: [...lastWeek.entries()]
      .map(([id, w]) => ({ technicianId: id, name: data.technicians.find((t) => t.id === id)?.name ?? id, weeks: w + 1, requests: count.get(id) ?? 0 }))
      .sort((a, b) => b.weeks - a.weeks || b.requests - a.requests),
    assumptions: [
      'Verfügbarkeit der Folgewochen kommt in Produktion aus der API – hier wie diese Woche angenommen (gleiche Tage, Fenster, Urlaube)',
      'Keine neuen Anfragen',
      'Keine fixen Termine in Folgewochen',
      'Gleiche Regeln, ältere zuerst',
    ],
  } };
}
