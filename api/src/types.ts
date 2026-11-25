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
  travelMinutes: number;
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
}

export interface UnassignedRequest {
  requestId: string;
  reason: string;
}

export interface Plan {
  generatedAt: string;
  travelSource: 'estimate';
  routes: DayRoute[];
  unassigned: UnassignedRequest[];
  stats: {
    totalRequests: number;
    planned: number;
    unassigned: number;
    driveMinutes: number;
  };
}
