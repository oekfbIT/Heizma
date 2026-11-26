/**
 * @file      types.ts – Gemeinsames Typ-Modell (API-Daten + Plan) – wird auch vom Web importiert
 * @layer     Backend · Typen (eine Quelle der Wahrheit)
 * @siehe     docs/02-architektur.md · docs/07-api.md · docs/10-code-navigation.md
 */
// Datentypen der Heizma Case-Study-API (read-only, eingefrorener Datenstand)

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Technician {
  id: string;
  name: string;
  home: LatLng & { label: string };
  /** Einsatzgebiet als Polygon (geschlossen gedacht). Kann leer sein. */
  region: LatLng[];
}

export interface AvailabilityEntry {
  technicianId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  blocked: boolean;
}

export type VisitationType = 'WP' | 'PV' | 'WP+PV';

export interface ServiceRequest {
  id: string;
  customer: string;
  address: string;
  lat: number | null;
  lng: number | null;
  visitationType: VisitationType | null;
  durationMinutes: number;
  customerAvailableFrom: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Appointment {
  id: string;
  technicianId: string;
  type: 'Besichtigung' | 'Inbetriebnahme';
  visitationType: string | null;
  durationMinutes: number;
  start: string; // ISO 8601 mit Offset
  end: string;
  customer: string;
  address: string;
  lat: number;
  lng: number;
  /** Lokal: aus einer freigegebenen Tour entstanden (simuliert – in Produktion Heizma-Backend) */
  simulated?: boolean;
  fromRequestId?: string;
}

export interface TravelResult {
  minutes: number;
  km: number;
  estimated: boolean;
  polyline: string | null;
}

export interface Dataset {
  technicians: Technician[];
  availability: AvailabilityEntry[];
  requests: ServiceRequest[];
  appointments: Appointment[];
  range: { from: string; to: string };
  source: 'live' | 'mock';
  loadedAt: string;
}

// MARK: - Validierung
export type Severity = 'error' | 'warning' | 'info';
export type EntityKind = 'technician' | 'request' | 'appointment' | 'availability';

export interface Issue {
  entity: EntityKind;
  entityId: string;
  field?: string;
  severity: Severity;
  code: string;
  message: string;
  /** Eindeutige Korrektur, die der Planer per Klick übernehmen kann (z. B. „10:00“ statt „10.00“) */
  suggestion?: string;
}

// MARK: - Planung
export interface PlannedStop {
  kind: 'request' | 'appointment';
  id: string;
  customer: string;
  address: string;
  lat: number;
  lng: number;
  visitationType: string | null;
  /** Art des Termins laut API: neue Anfrage = Besichtigung, fixe Termine = Besichtigung | Inbetriebnahme */
  appointmentType: 'Besichtigung' | 'Inbetriebnahme';
  /** Dauer vor Ort in Minuten */
  durationMinutes: number;
  travelMinutes: number;
  /** true = Luftlinien-Schätzung statt echter Fahrzeit */
  travelEstimated: boolean;
  arrival: string; // HH:MM
  start: string; // HH:MM
  end: string; // HH:MM
  waitMinutes: number;
  fixed: boolean;
  /** Vom Planer manuell gesetzt (fixiert / vorgezogen) */
  manual?: ManualMark | null;
}

export interface ManualMark {
  mode: 'pin' | 'prioritize';
  reason: string;
  /** true = Planer hat einen Regelbruch bewusst akzeptiert */
  override: boolean;
}

// MARK: - Planer-Entscheidungen (manuelle Eingriffe)
export type DecisionMode = 'pin' | 'exclude' | 'prioritize';

export interface Decision {
  mode: DecisionMode;
  /** nur bei pin */
  technicianId?: string;
  date?: string;
  reason: string;
  override: boolean;
  /** nur bei pin: diese Anfrage wurde für den Platz bewusst aus dieser Tour genommen (Tausch) */
  replaces?: string;
  at: string;
}

/** Ein möglicher Slot für eine Anfrage, nach Zusatz-Fahrzeit sortiert */
export interface SlotOption {
  technicianId: string;
  technicianName: string;
  date: string;
  /** voraussichtliche Uhrzeit des Termins */
  start: string | null;
  end: string | null;
  /** Zusatz-Fahrminuten in der Ziel-Tour */
  deltaDrive: number;
  /** Ersparnis in der bisherigen Tour (wenn die Anfrage schon geplant ist) */
  sourceSaving: number;
  /** Ziel-Tour: Stopps vorher → nachher */
  stopsBefore: number;
  /** Was die Regeln verletzen würde – leer = regelkonform */
  warnings: string[];
  /** Ziel nicht möglich (z. B. Tour freigegeben, Termin hätte keinen Platz) */
  blocked: string | null;
  current: boolean;
}

/** Tausch-Kandidat: geplante Anfrage, die für eine vorgezogene Platz machen könnte */
export interface SwapOption {
  technicianId: string;
  technicianName: string;
  date: string;
  /** Wer weichen müsste */
  displaced: { id: string; customer: string; address: string; createdAt: string; start: string; end: string; notes: string | null };
  /** true = die verdrängte Anfrage ist älter → „ältere zuerst“ wird übergangen */
  displacesOlder: boolean;
  /** Neue Uhrzeit der vorgezogenen Anfrage */
  start: string;
  end: string;
  /** Fahrzeit der Tour: vorher → nachher (Differenz = Mehr-/Minderfahrzeit gegenüber der optimalen Tour) */
  driveBefore: number;
  driveAfter: number;
  deltaDrive: number;
  /** Passt die verdrängte Anfrage regelkonform in einen anderen Tag? (null = Warteliste) */
  fallback: { technicianName: string; date: string; deltaDrive: number } | null;
  recommended: boolean;
  /** Vorschau der Tagesroute vorher/nachher */
  before: RoutePreview;
  after: RoutePreview;
  /** Regelprüfung der neuen Tagesroute (aus der Vorschau berechnet) */
  checks: { label: string; ok: boolean; detail?: string }[];
}

export interface RoutePreview {
  window: { start: string; end: string };
  departure: string;
  returnHome: string;
  /** Abfahrt bis Heimkehr in Minuten */
  totalMinutes: number;
  driveMinutes: number;
  workMinutes: number;
  lunch: { start: string; end: string } | null;
  stops: { id: string; customer: string; address: string; start: string; end: string; travelMinutes: number; kind: 'request' | 'appointment'; isNew: boolean }[];
}

export type RequestPlanningStatus = 'termin' | 'pinned' | 'planned' | 'waitlist' | 'excluded' | 'unplannable';

export interface RequestPlanning {
  requestId: string;
  status: RequestPlanningStatus;
  route: {
    technicianId: string;
    technicianName: string;
    date: string;
    start: string;
    end: string;
    position: number;
    stops: number;
    approved: boolean;
  } | null;
  /** Grund, wenn nicht eingeplant */
  reason: string | null;
  /** Freitext-Notiz aus dem Vertrieb – wird angezeigt, nicht ausgewertet */
  notes: string | null;
  decision: Decision | null;
  /** Warteliste: Platz nach Eingang und ältere Wartende */
  waitlist: { position: number; total: number } | null;
  /** Ältere Anfragen, die noch auf der Warteliste stehen (Hinweis beim Vorziehen) */
  olderWaiting: number;
  /** Regelverstöße dieser Anfrage (rot) und bewusste Ausnahmen (gelb) laut Plan-Prüfung */
  violations: string[];
  exceptions: PlanException[];
  log: AuditEntry[];
}

export interface AuditEntry {
  at: string;
  entity: string;
  id: string;
  action: string;
  reason?: string;
  changes?: Record<string, unknown>;
}

export interface DayRoute {
  technicianId: string;
  date: string;
  window: { start: string; end: string };
  departure: string;
  returnHome: string;
  lunch: { start: string; end: string } | null;
  stops: PlannedStop[];
  driveMinutes: number;
  workMinutes: number;
  /** Auslastung des Fensters (vor Ort + Fahrt) in % */
  utilization: number;
  /** gesetzt = vom Planer freigegeben und gesperrt */
  approved: { at: string } | null;
}

export interface UnassignedRequest {
  requestId: string;
  reason: string;
}

export interface Plan {
  /** Nur bei Prognose-Wochen (GET /api/plan?week=N): Projektion, nicht freigebbar */
  projected?: { week: number; from: string; to: string };
  generatedAt: string;
  travelSource: 'heizma' | 'estimate' | 'mixed';
  travel: {
    source: 'heizma' | 'estimate' | 'mixed';
    pairsNeeded: number;
    pairsReal: number;
    pairsEstimated: number;
    apiCalls: number;
    builtAt: string;
  } | null;
  routes: DayRoute[];
  unassigned: UnassignedRequest[];
  stats: {
    totalRequests: number;
    planned: number;
    unassigned: number;
    driveMinutes: number;
    /** Fahrzeit nach Phase 1 (Greedy), vor 2-opt/Relocate */
    greedyDriveMinutes: number;
    improvements: number;
    /** Tausche „ältere zuerst“: wartende ältere Anfrage hat eine jüngere ersetzt */
    prioritySwaps?: number;
    avgDrivePerVisit: number;
    approvedRoutes: number;
    routesWithStops: number;
  };
  verification?: Verification;
}

// MARK: - Plan-Prüfung
export interface Violation {
  rule: string;
  technicianId?: string;
  date?: string;
  stopId?: string;
  message: string;
}

export interface RuleCheck {
  rule: string;
  label: string;
  checks: number;
  violations: Violation[];
}

export interface Verification {
  ok: boolean;
  totalViolations: number;
  rules: RuleCheck[];
  notes: string[];
  /** Bewusste Ausnahmen des Planers (mit Begründung) – kein Fehler, aber sichtbar */
  exceptions?: PlanException[];
}

export interface PlanException {
  requestId: string;
  rule: string;
  technicianId?: string;
  date?: string;
  message: string;
  reason: string;
}
