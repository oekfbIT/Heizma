/**
 * @file      types.ts – Typen des System-Moduls (Stammdaten-Read-Model, Prognose, Übersicht)
 * @layer     Web · Modul-Typen
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import type { AvailabilityEntry, Appointment, Issue, ServiceRequest, Technician } from '@/lib/types';
import type { Escalation } from '@/modules/anfragen/types';

/** Bearbeitbare Bereiche der lokalen Korrekturen (PATCH /api/stammdaten/:key/:id) */
export type EntityKey = 'requests' | 'technicians' | 'appointments';

/** Gesamter Datenbestand – Read-Model für die generischen Stammdaten-Seiten */
export interface Stammdaten {
  technicians: Technician[];
  availability: AvailabilityEntry[];
  requests: ServiceRequest[];
  appointments: Appointment[];
  issues: Issue[];
  range: { from: string; to: string };
  source: 'live' | 'mock';
  loadedAt: string;
  /** IDs mit lokalen Korrekturen */
  overridden?: Record<EntityKey, string[]>;
  /** Zuständige Außendienstler je Anfrage (Gebiet → sonst ≤ 15 km) */
  responsibility: Record<string, string[]>;
  /** Eskalationen je Anfrage (simuliert) */
  escalations: Record<string, Escalation>;
  /** Anfragen aus freigegebenen Routen – jetzt (simuliert) Termine */
  convertedRequests?: ServiceRequest[];
}

export interface LocalDb {
  updatedAt: string | null;
  path: string;
  overrides: Record<string, Record<string, Record<string, unknown>>>;
  log: { at: string; entity: string; id: string; action: string; changes?: Record<string, unknown> }[];
  editableFields: Record<EntityKey, string[]>;
}

export interface Forecast {
  weeks: { index: number; from: string; to: string; planned: number; remaining: number; driveMinutes: number }[];
  weeksNeeded: number | null;
  stuck: number;
  needsAction: { dataErrors: number; excluded: number };
  byTechnician: { technicianId: string; name: string; weeks: number; requests: number }[];
  placements: Record<string, { week: number; date: string; technicianId: string; start: string; end: string }>;
  assumptions: string[];
}

export interface Overview {
  requests: { total: number; planned: number; open: number };
  appointments: { fixed: number };
  technicians: { total: number; available: number; techDays: number };
  actionRequired: {
    total: number;
    technicians: number;
    requests: number;
    appointments: number;
    availability: number;
    errors: number;
    warnings: number;
  };
  driveMinutes: number;
}

export interface Meta {
  source: 'live' | 'mock';
  range: { from: string; to: string };
  loadedAt: string;
  office: { label: string; lat: number; lng: number };
  /** Erster Werktag nach dem Planungszeitraum */
  nextWorkday: string;
}

export interface MapConfig {
  googleMapsApiKey: string;
  googleMapsMapId: string;
  tileUrl: string;
  attribution: string;
}

export interface AppConfig {
  map: MapConfig;
}

/** Rohdaten aus GET /api/log */
export interface LogEntry {
  at: string;
  entity: string;
  id: string;
  action: string;
  reason?: string;
  changes?: Record<string, unknown>;
}

export type LogCategory = 'freigabe' | 'planung' | 'eskalation' | 'korrektur' | 'notiz' | 'system';

/** Aufbereiteter Protokolleintrag für die Ansicht */
export interface LogItem {
  key: string;
  at: string;
  category: LogCategory;
  /** „Route freigegeben“ */
  action: string;
  /** Worauf sich der Eintrag bezieht, z. B. „Nord · Mo 23.11.“ oder „req_1046“ */
  target: { label: string; to: string | null };
  /** Kurz: „5 Stopps“, „→ Süd · Di 24.11.“ */
  detail: string;
  reason?: string;
  /** Bewusste Ausnahme (Regelbruch mit Begründung) */
  exception?: boolean;
}
