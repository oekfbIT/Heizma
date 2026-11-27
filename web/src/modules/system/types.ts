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
}

export interface AppConfig {
  map: MapConfig;
}

/** Rohdaten aus GET /api/log */
