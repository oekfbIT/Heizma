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

// ---------- Validierung ----------

export type Severity = 'error' | 'warning' | 'info';
export type EntityKind = 'technician' | 'request' | 'appointment' | 'availability';

export interface Issue {
  entity: EntityKind;
  entityId: string;
  field?: string;
  severity: Severity;
  code: string;
  message: string;
}

// ---------- Planung ----------

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
    avgDrivePerVisit: number;
    approvedRoutes: number;
    routesWithStops: number;
  };
  verification?: Verification;
}

// ---------- Plan-Prüfung ----------

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
}
