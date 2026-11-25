import { estimateTravelMinutes, hasCoords } from './geo.js';
import { splitIso, toHHMM, toMinutes } from './time.js';
import { eligibleTechnicians } from './validation.js';
import type { Appointment, Dataset, DayRoute, LatLng, Plan, PlannedStop, ServiceRequest, Technician, UnassignedRequest } from './types.js';

/**
 * ERSTER ENTWURF des Planers (Scaffold):
 * Greedy "Cheapest Insertion" – älteste Anfrage zuerst, wird an der Stelle eingefügt,
 * die am wenigsten zusätzliche Fahrzeit kostet und alle Regeln erfüllt.
 * Fahrzeiten sind hier noch Schätzungen (geo.ts) – nächster Schritt: Fahrzeitmatrix aus /travel.
 */

const LUNCH_EARLIEST = toMinutes('11:30');
const LUNCH_LATEST = toMinutes('13:00');
const LUNCH_MINUTES = 60;
const RETURN_TOLERANCE = 60; // Heimfahrt darf bis 60 min über das Fenster
const FULL_DAY_MINUTES = 10 * 60; // "ganzer Tag" = Fenster ≥ 10 h (z. B. 07–19)

interface Item {
  kind: 'request' | 'appointment';
  id: string;
  customer: string;
  address: string;
  pos: LatLng;
  visitationType: string | null;
  duration: number;
  earliest: number | null; // customerAvailableFrom
  fixedStart: number | null; // fixe Termine
}

interface Slot {
  tech: Technician;
  date: string;
  windowStart: number;
  windowEnd: number;
  items: Item[];
}

interface SimResult {
  feasible: boolean;
  drive: number;
  departure: number;
  returnHome: number;
  lunch: [number, number] | null;
  stops: PlannedStop[];
}

function simulate(slot: Slot, items: Item[], strict = true): SimResult {
  const fail: SimResult = { feasible: false, drive: Infinity, departure: 0, returnHome: 0, lunch: null, stops: [] };
  const fullDay = slot.windowEnd - slot.windowStart >= FULL_DAY_MINUTES;
  let t = slot.windowStart;
  let pos: LatLng = slot.tech.home;
  let drive = 0;
  let lunch: [number, number] | null = null;
  const stops: PlannedStop[] = [];

  for (const item of items) {
    const travel = estimateTravelMinutes(pos, item.pos);

    // Mittagspause vor der Weiterfahrt, wenn die Fahrt ins Fenster 11:30–13:00 fällt
    const lunchStart = Math.max(t, LUNCH_EARLIEST);
    if (fullDay && !lunch && lunchStart <= LUNCH_LATEST && t + travel >= LUNCH_EARLIEST) {
      const afterLunchArrival = lunchStart + LUNCH_MINUTES + travel;
      if (item.fixedStart === null || afterLunchArrival <= item.fixedStart) {
        lunch = [lunchStart, lunchStart + LUNCH_MINUTES];
        t = lunchStart + LUNCH_MINUTES;
      }
    }

    const arrival = t + travel;
    let start = arrival;
    if (item.fixedStart !== null) {
      if (arrival > item.fixedStart && strict) return fail;
      start = item.fixedStart;
    } else if (item.earliest !== null) {
      start = Math.max(arrival, item.earliest);
    }
    // Lange Wartezeit im Mittagsfenster → als Mittagspause nutzen
    if (fullDay && !lunch && start - arrival >= LUNCH_MINUTES && arrival >= LUNCH_EARLIEST && arrival <= LUNCH_LATEST) {
      lunch = [arrival, arrival + LUNCH_MINUTES];
    }
    const end = start + item.duration;
    if (end > slot.windowEnd && strict) return fail; // Termin inkl. Anfahrt muss im Fenster liegen

    drive += travel;
    stops.push({
      kind: item.kind,
      id: item.id,
      customer: item.customer,
      address: item.address,
      lat: item.pos.lat,
      lng: item.pos.lng,
      visitationType: item.visitationType,
      travelMinutes: travel,
      arrival: toHHMM(arrival),
      start: toHHMM(start),
      end: toHHMM(end),
      waitMinutes: start - arrival,
      fixed: item.fixedStart !== null,
    });
    t = end;
    pos = item.pos;
  }

  const back = estimateTravelMinutes(pos, slot.tech.home);
  const returnHome = t + back;
  if (returnHome > slot.windowEnd + RETURN_TOLERANCE && strict) return fail;
  drive += back;

  // Abfahrt so spät wie möglich, damit beim ersten Kunden nicht gewartet wird
  const first = stops[0];
  const departure = first
    ? Math.max(slot.windowStart, toMinutes(first.start) - first.travelMinutes)
    : slot.windowStart;

  return { feasible: true, drive, departure, returnHome, lunch, stops };
}

function requestToItem(r: ServiceRequest): Item | null {
  if (!hasCoords(r)) return null;
  const earliest = r.customerAvailableFrom && /^\d{2}:\d{2}$/.test(r.customerAvailableFrom) ? toMinutes(r.customerAvailableFrom) : null;
  return {
    kind: 'request',
    id: r.id,
    customer: r.customer,
    address: r.address,
    pos: { lat: r.lat, lng: r.lng },
    visitationType: r.visitationType,
    duration: r.visitationType === null ? 105 : r.durationMinutes,
    earliest,
    fixedStart: null,
  };
}

function appointmentToItem(a: Appointment): Item {
  const s = splitIso(a.start);
  return {
    kind: 'appointment',
    id: a.id,
    customer: a.customer,
    address: a.address,
    pos: { lat: a.lat, lng: a.lng },
    visitationType: a.visitationType ?? a.type,
    duration: splitIso(a.end).minutes - s.minutes,
    earliest: null,
    fixedStart: s.minutes,
  };
}

export function buildPlan(data: Dataset): Plan {
  // 1) Tages-Slots aus den Verfügbarkeiten (gesperrte Tage fallen raus), fixe Termine vorbelegen
  const slots: Slot[] = [];
  for (const entry of data.availability) {
    if (entry.blocked) continue;
    const tech = data.technicians.find((t) => t.id === entry.technicianId);
    if (!tech) continue;
    const fixed = data.appointments
      .filter((a) => a.technicianId === tech.id && splitIso(a.start).date === entry.date)
      .map(appointmentToItem)
      .sort((a, b) => (a.fixedStart ?? 0) - (b.fixedStart ?? 0));
    slots.push({ tech, date: entry.date, windowStart: toMinutes(entry.start), windowEnd: toMinutes(entry.end), items: fixed });
  }

  // 2) Älteste Anfragen zuerst
  const queue = [...data.requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const unassigned: UnassignedRequest[] = [];

  for (const request of queue) {
    const item = requestToItem(request);
    if (!item) {
      unassigned.push({ requestId: request.id, reason: 'Keine Koordinaten – erst geokodieren' });
      continue;
    }
    const eligible = new Set(eligibleTechnicians(request, data.technicians).map((t) => t.id));
    if (!eligible.size) {
      unassigned.push({ requestId: request.id, reason: 'Nicht zuordenbar (kein Gebiet, > 15 km)' });
      continue;
    }
    const candidates = slots.filter((s) => eligible.has(s.tech.id));
    if (!candidates.length) {
      unassigned.push({ requestId: request.id, reason: 'Zuständige Techniker ohne Verfügbarkeit' });
      continue;
    }

    let best: { slot: Slot; index: number; delta: number } | null = null;
    for (const slot of candidates) {
      const base = simulate(slot, slot.items);
      if (!base.feasible) continue;
      const baseDrive = base.drive;
      for (let i = 0; i <= slot.items.length; i++) {
        const trial = [...slot.items.slice(0, i), item, ...slot.items.slice(i)];
        const sim = simulate(slot, trial);
        if (!sim.feasible) continue;
        const delta = sim.drive - baseDrive;
        if (!best || delta < best.delta) best = { slot, index: i, delta };
      }
    }

    if (best) best.slot.items.splice(best.index, 0, item);
    else unassigned.push({ requestId: request.id, reason: 'Kapazität erschöpft (Warteliste)' });
  }

  // 3) Ergebnis aufbereiten
  const routes: DayRoute[] = slots
    .map((slot) => {
      // Fixe Termine können selbst schon Regeln verletzen → dann ohne Prüfung darstellen (Validierung meldet es)
      const strictSim = simulate(slot, slot.items);
      const sim = strictSim.feasible ? strictSim : simulate(slot, slot.items, false);
      const workMinutes = sim.stops.reduce((sum, s) => sum + (toMinutes(s.end) - toMinutes(s.start)), 0);
      return {
        technicianId: slot.tech.id,
        date: slot.date,
        window: { start: toHHMM(slot.windowStart), end: toHHMM(slot.windowEnd) },
        departure: toHHMM(sim.departure),
        returnHome: toHHMM(sim.returnHome),
        lunch: sim.lunch ? { start: toHHMM(sim.lunch[0]), end: toHHMM(sim.lunch[1]) } : null,
        stops: sim.stops,
        driveMinutes: sim.drive,
        workMinutes,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.technicianId.localeCompare(b.technicianId));

  const planned = routes.reduce((n, r) => n + r.stops.filter((s) => s.kind === 'request').length, 0);
  return {
    generatedAt: new Date().toISOString(),
    travelSource: 'estimate',
    routes,
    unassigned,
    stats: {
      totalRequests: data.requests.length,
      planned,
      unassigned: unassigned.length,
      driveMinutes: routes.reduce((n, r) => n + r.driveMinutes, 0),
    },
  };
}
